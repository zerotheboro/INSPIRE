import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {initializeApp, deleteApp} from 'firebase/app'
import {getAuth, connectAuthEmulator, signInAnonymously, EmailAuthProvider, GoogleAuthProvider,
  linkWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCredential, signOut} from 'firebase/auth'
import {getFirestore as clientFirestore, connectFirestoreEmulator, doc, getDoc, setDoc} from 'firebase/firestore'
import {createLocalService, requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {AccountService, emptyPreferences, vietnamMonth, verifiedIdentity} from '../functions/src/inspireAccount.ts'
import {ConfirmedNoReply, UnknownReplyOutcome, importSource, retrieveKnowledge} from '../functions/src/inspireKnowledge.ts'
import {checkRateLimit, getVisitorKey} from '../functions/src/inspireAI.ts'

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
requireLocalEmulators()
await Promise.all(['http://127.0.0.1:9099', 'http://127.0.0.1:8080'].map(async (url) => {
  try { await fetch(url) } catch { throw Error('Start Firebase Auth/Firestore emulators first (demo-inspire only)') }
}))
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const db = require('firebase-admin/firestore').getFirestore()
const apps = []
function client() {
  const app = initializeApp({projectId: 'demo-inspire', apiKey: 'demo-test-key', authDomain: 'demo-inspire.firebaseapp.com'}, randomUUID())
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true})
  return {app, auth}
}
async function anonymous() {
  const c = client()
  const {user} = await signInAnonymously(c.auth)
  return {...c, user, identity: await verifiedIdentity(await user.getIdToken())}
}
async function registered() {
  const c = client(), email = `${randomUUID()}@synthetic.invalid`
  const {user} = await createUserWithEmailAndPassword(c.auth, email, 'Synthetic-test-753!')
  return {...c, user, email, identity: await verifiedIdentity(await user.getIdToken())}
}
function request(service, identity, session = service.session(identity), extra = {}) {
  return {kind: 'send', epoch: session.epoch, sessionId: session.sessionId,
    conversationId: randomUUID(), operationId: randomUUID(),
    // Quota/auth fixtures must not search the growing real corpus. Natural
    // relevance is exercised separately; this suite overrides the text below
    // for the explicit adapter/provenance case.
    messages: [{id: randomUUID(), role: 'user', text: 'zaccountquotafixture'}], ...extra}
}
const noRate = async () => ({allowed: true})
const offline = {mode: 'simulation', reply: async () => 'Phản hồi mô phỏng cho kiểm thử.'}

test('verified anonymous + email registration links same UID, login and signout do not mint another identity', async () => {
  const guest = await anonymous(), account = new AccountService()
  assert.equal(guest.identity.registered, false)
  await account.account(guest.identity)
  const service = createLocalService(offline, Date.now, noRate)
  const first = request(service, guest.identity)
  const answer = await service.handle(first, guest.identity, 'quota-test')
  const email = `${randomUUID()}@synthetic.invalid`, uid = guest.user.uid
  await linkWithCredential(guest.user, EmailAuthProvider.credential(email, 'Synthetic-test-753!'))
  const verified = await verifiedIdentity(await guest.user.getIdToken(true))
  assert.equal(verified.uid, uid); assert.equal(verified.registered, true)
  assert.deepEqual(verified.providers, ['password'])
  assert.equal((await account.account(verified)).quota.remaining, 30)
  const next = {...first, operationId:randomUUID(), messages:[...first.messages, answer.message,
    {id:randomUUID(),role:'user',text:'zaccountlinkcorrectionfixture',correctionOf:first.messages[0].id}]}
  await service.handle(next, verified, 'quota-test')
  assert.equal((await account.account(verified)).quota.remaining, 29)
  await signOut(guest.auth)
  assert.equal(guest.auth.currentUser, null)
  assert.equal((await signInWithEmailAndPassword(guest.auth, email, 'Synthetic-test-753!')).user.uid, uid)
  await assert.rejects(verifiedIdentity('forged-token'), {code: 'UNAUTHENTICATED'})
})

test('Google emulator credentials create verified Google account (synthetic OAuth substitute)', async () => {
  const c = client()
  const guest = await signInAnonymously(c.auth)
  const subject = randomUUID(), email = `${subject}@synthetic.invalid`
  const jwt = Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({sub: subject, email, email_verified: true, name: 'Synthetic Google User',
      iss: 'https://accounts.google.com', aud: 'demo-inspire', exp: Math.floor(Date.now()/1000)+3600})).toString('base64url') + '.'
  const credential = GoogleAuthProvider.credential(jwt)
  const {user} = await linkWithCredential(guest.user, credential)
  assert.equal(user.uid, guest.user.uid)
  const identity = await verifiedIdentity(await user.getIdToken())
  assert.equal(identity.registered, true)
  assert.deepEqual(identity.providers, ['google.com'])
  assert.equal((await new AccountService().account(identity)).quota.remaining, 30)
  await signOut(c.auth)
  assert.equal((await signInWithCredential(c.auth, credential)).user.uid, user.uid)
})

test('guest 10 total, completion once, durable duplicate rejected, no periodic reset', async () => {
  let now = Date.UTC(2026, 10, 9), generations = 0
  const service = createLocalService({mode: 'simulation', reply: async () => { generations++; return 'Đã nhận.' }}, () => now, noRate)
  const {identity} = await anonymous()
  for (let i = 0; i < 10; i++) {
    const r = request(service, identity)
    const response = await service.handle(r, identity, 'quota-test')
    assert.deepEqual(await service.handle({...r, kind: 'replay'}, identity, 'quota-test'), response)
    await service.accounts.settle(identity, r.operationId, 'completed')
  }
  assert.equal(generations, 10)
  assert.equal((await service.accounts.account(identity)).quota.remaining, 0)
  await assert.rejects(service.handle(request(service, identity), identity, 'quota-test'), {code: 'QUOTA_EXHAUSTED'})
  now += 400 * 86400000
  assert.equal((await service.accounts.account(identity)).quota.remaining, 0)
})

test('registered 30 replies, Vietnam midnight boundary, mid-month allowance and no rollover', async () => {
  let now = Date.parse('2026-11-30T16:59:59.999Z')
  const {identity} = await registered()
  const service = createLocalService(offline, () => now, noRate)
  for (let i = 0; i < 30; i++) await service.handle(request(service, identity), identity, 'quota-test')
  assert.equal((await service.accounts.account(identity)).quota.remaining, 0)
  await assert.rejects(service.handle(request(service, identity), identity, 'quota-test'), {code: 'QUOTA_EXHAUSTED'})
  now++
  const december = await service.accounts.account(identity)
  assert.equal(december.quota.period, '2026-12'); assert.equal(december.quota.remaining, 30)
  assert.equal(december.quota.nextReset, '2026-12-31T17:00:00.000Z')
  assert.deepEqual(vietnamMonth(Date.parse('2026-12-31T17:00:00Z')), {key:'2027-01', nextReset:'2027-01-31T17:00:00.000Z'})
  now = Date.parse('2027-01-15T05:00:00Z')
  assert.equal((await service.accounts.account(identity)).quota.remaining, 30)
})

test('atomic reservations prevent overspending; midnight completion charges the completion month', async () => {
  let now = Date.parse('2026-11-30T16:59:59Z')
  const account = new AccountService(() => now), {identity} = await anonymous()
  const requests = Array.from({length: 12}, () => ({...request(createLocalService(offline, () => now, noRate), identity)}))
  const outcomes = await Promise.allSettled(requests.map((r) => account.reserve(identity, r)))
  const accepted = requests.filter((_, i) => outcomes[i].status === 'fulfilled')
  assert.equal(accepted.length, 10)
  const quota = (await account.account(identity)).quota
  assert.equal(quota.completed, 0); assert.equal(quota.pending, 10); assert.equal(quota.remaining, 0)
  await Promise.all(accepted.map((r) => account.settle(identity, r.operationId, 'completed')))
  assert.equal((await account.account(identity)).quota.completed, 10)
  const registeredIdentity = (await registered()).identity
  const r = request(createLocalService(offline, () => now, noRate), registeredIdentity)
  await account.reserve(registeredIdentity, r)
  now = Date.parse('2026-11-30T17:00:00Z')
  assert.equal((await account.account(registeredIdentity)).quota.pending, 1)
  assert.equal((await account.account(registeredIdentity)).quota.remaining, 29)
  await account.settle(registeredIdentity, r.operationId, 'completed')
  assert.equal((await account.account(registeredIdentity)).quota.completed, 1)
  assert.equal((await db.doc(`inspireAccounts/${registeredIdentity.uid}/usage/2026-11`).get()).data().completed, 0)
})

test('confirmed failure refunds; unknown adapter or completion outcome remains reserved after restart', async () => {
  const {identity} = await anonymous()
  const known = createLocalService({mode:'simulation', reply: async () => { throw new ConfirmedNoReply() }}, Date.now, noRate)
  await assert.rejects(known.handle(request(known, identity), identity, 'quota-test'), {code:'ATTEMPT_FAILED', retry:'new-attempt'})
  assert.equal((await known.accounts.account(identity)).quota.remaining, 10)
  let generations = 0
  const unknown = createLocalService({mode:'simulation', reply: async () => { generations++; throw new UnknownReplyOutcome() }}, Date.now, noRate)
  const r = request(unknown, identity)
  await assert.rejects(unknown.handle(r, identity, 'quota-test'), {code:'OUTCOME_UNKNOWN'})
  const restarted = createLocalService(offline, Date.now, noRate)
  await assert.rejects(restarted.handle({...r,kind:'replay'}, identity, 'quota-test'), {code:'SESSION_LOST'})
  assert.equal(generations, 1)
  assert.equal((await restarted.accounts.account(identity)).quota.pending, 1)
  await assert.rejects(restarted.accounts.reserve(identity, r), {code:'RESULT_UNAVAILABLE'})
  const commitFailure = createLocalService(offline, Date.now, noRate)
  const settle = commitFailure.accounts.settle.bind(commitFailure.accounts)
  commitFailure.accounts.settle = async (id, op, outcome) => { if (outcome === 'completed') throw Error('commit unavailable'); return settle(id, op, outcome) }
  await assert.rejects(commitFailure.handle(request(commitFailure, identity), identity, 'quota-test'), {code:'OUTCOME_UNKNOWN'})
  assert.equal((await commitFailure.accounts.account(identity)).quota.pending, 2)
})

test('account linking blocks old anonymous identity, adds no guest balance, and sessions reject another user', async () => {
  const guest = await anonymous(), member = await registered()
  const service = createLocalService(offline, Date.now, noRate)
  const r = request(service, guest.identity)
  await service.handle(r, guest.identity, 'quota-test')
  await service.accounts.linkGuest(member.identity, await guest.user.getIdToken())
  assert.equal((await service.accounts.account(member.identity)).quota.remaining, 30)
  await assert.rejects(service.accounts.account(guest.identity), {code:'ACCOUNT_LINKED'})
  await assert.rejects(service.handle({...r, kind:'replay'}, member.identity, 'quota-test'), {code:'IDENTITY_CHANGED'})
})

test('client quota manipulation, cross-user records and private sources are rejected', async () => {
  const guest = await anonymous(), other = await registered()
  const service = createLocalService(offline, Date.now, noRate), r = request(service, guest.identity)
  for (const extra of [{uid:other.identity.uid},{registered:true},{quota:1000},{limit:500},{remaining:50}]) {
    await assert.rejects(service.handle({...r,...extra}, guest.identity, 'quota-test'), {code:'INVALID_REQUEST'})
  }
  const firestore = clientFirestore(guest.app)
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  for (const path of [`inspireAccounts/${other.identity.uid}`, `inspireAccounts/${guest.identity.uid}/usage/guest`,
    'inspireKnowledge/private-test', `inspirePreferences/${other.identity.uid}`, 'inspireOperations/forged']) {
    await assert.rejects(getDoc(doc(firestore, path)), {code:'permission-denied'})
    await assert.rejects(setDoc(doc(firestore, path), {remaining:999}), {code:'permission-denied'})
  }
  await assert.rejects(service.accounts.savePreferences(guest.identity, {...emptyPreferences, diagnosis:'inferred'}), {code:'INVALID_REQUEST'})
  await service.accounts.savePreferences(guest.identity, {...emptyPreferences, name:'Tên giả định', context:'Bối cảnh do người dùng tự viết'})
  assert.equal((await service.accounts.account(guest.identity)).preferences.name, 'Tên giả định')
  await service.accounts.savePreferences(guest.identity, {...emptyPreferences})
  assert.equal((await service.accounts.account(guest.identity)).preferences.context, '')
})

test('incremental knowledge provenance, review exclusion, Edulience isolation and real adapter context construction', async (t) => {
  const id = 'synthetic-source-' + randomUUID()
  const needle = 'source' + randomUUID().replaceAll('-','')
  const record = {collection:'INSPIRE',documentId:id,title:'Nguồn kiểm thử về giấc ngủ ' + needle,status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:'synthetic-raw'}
  t.after(async () => {
    await Promise.all([db.doc('inspireKnowledge/'+id), db.doc('inspireKnowledge/'+id+'-review'),
      db.doc('edulienceKnowledge/'+id+'-edulience')].map((ref) => db.recursiveDelete(ref)))
  })
  const a = Buffer.from('Giấc ngủ và thời gian nghỉ ngơi. Nguồn giả định chỉ phục vụ kiểm thử.')
  assert.deepEqual(await importSource(record, a, a.toString()), {changed:true,version:1})
  assert.deepEqual(await importSource(record, a, a.toString()), {changed:false,version:1})
  const b = Buffer.from('Giấc ngủ và nghỉ ngơi. Bản cập nhật giả định.')
  assert.deepEqual(await importSource(record, b, b.toString()), {changed:true,version:2})
  await importSource({...record,documentId:id+'-review',status:'review-required',permittedUse:'receipt-only'}, a, a.toString())
  await importSource({...record,collection:'Edulience',documentId:id+'-edulience'}, a, a.toString())
  // This checks exact provenance and receipt exclusion independently of the
  // growing permitted draft corpus. Natural Vietnamese relevance has its own
  // global-corpus follow-up/correction regression in inspire-pagination.
  const retrieved = await retrieveKnowledge(needle)
  assert.ok(retrieved.some((s) => s.documentId === id && s.version === 2 && s.hash.length === 64))
  assert.ok(retrieved.every((s) => s.sourceStatus === 'published-supporting' && !s.documentId.endsWith('-review') && !s.documentId.endsWith('-edulience')))
  assert.equal((await db.doc(`inspireKnowledge/${id}/versions/1`).get()).exists, true)
  const {identity} = await anonymous()
  let context
  const service = createLocalService({mode:'simulation', reply: async (input) => { context = input; return 'Mô phỏng với ngữ cảnh có nguồn.' }}, Date.now, noRate)
  const r = request(service, identity)
  r.messages[0].text = needle
  await service.handle(r, identity, 'quota-test')
  assert.ok(context.operatingInstructions.some((s) => s.includes('WHAT → WHERE → WHY → TOWARD WHAT → HOW')))
  assert.ok(context.supportingKnowledge.length)
  assert.deepEqual(context.messages, r.messages)
  assert.throws(() => createLocalService({mode:'model', reply:async()=>''}), /Controller/)
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST
  try {
    process.env.FIRESTORE_EMULATOR_HOST = 'production.invalid:443'
    assert.throws(() => createLocalService(), {code:'EMULATORS_REQUIRED'})
  } finally { process.env.FIRESTORE_EMULATOR_HOST = endpoint }
})

test('existing shared IP request-rate limits remain separate and reject before quota reservation or adapter', async () => {
  let now = Date.UTC(2026, 10, 9), calls = 0
  const ip = 'synthetic-rate-' + randomUUID(), key = getVisitorKey(ip)
  for (let batch = 0; batch < 3; batch++) {
    for (let i = 0; i < 10; i++) assert.equal((await checkRateLimit(key, now)).allowed, true)
    assert.equal((await checkRateLimit(key, now)).allowed, false)
    now += 600001
  }
  const {identity} = await anonymous()
  const service = createLocalService({mode:'simulation',reply:async()=>{calls++;return 'Mô phỏng.'}}, () => now)
  await assert.rejects(service.handle(request(service, identity), identity, ip), {code:'RATE_LIMITED'})
  assert.equal(calls, 0)
  assert.equal((await service.accounts.account(identity)).quota.remaining, 10)
  now += 86400001
  await service.handle(request(service, identity), identity, ip)
  assert.equal(calls, 1)
  assert.equal((await service.accounts.account(identity)).quota.completed, 1)
})

test.after(async () => { await Promise.all(apps.map(deleteApp)); await db.terminate() })
