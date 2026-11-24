import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createSimulationServer, simulateConversation } from '../functions/src/inspireChatSimulation.ts'
import { validateRequest, validateResponse, ChatError } from '../functions/src/inspireChatContract.ts'
import { ConversationStore } from '../src/services/inspireConversation.ts'
import { createSimulationTransport } from '../src/services/InspireAIconnect.ts'

const user = (id = 'u1', text = 'Một ý tưởng cho ngày mai') => ({ id, role: 'user', text })
function request(server, messages = [user()], extra = {}) {
  const { epoch, sessionId } = server.session()
  return { kind: 'send', epoch, sessionId, operationId: 'op1', conversationId: 'c1', messages, ...extra }
}
function setup(generate) {
  const server = createSimulationServer(generate)
  let counter = 0
  const transport = { connect: async () => server.session(), send: (r) => server.handle(r) }
  return { server, transport, store: new ConversationStore(transport, () => `id${++counter}`) }
}
const active = (store) => store.getSnapshot().conversations.find((c) => c.id === store.getSnapshot().activeId)

test('multi-turn passes both ordered roles and corrections preserve exact original wording', async () => {
  const contexts = []
  const { store } = setup(async (messages) => { contexts.push(messages); return 'Phản hồi giả định' })
  const id = active(store).id
  store.draft(id, '  Tôi muốn viết một lá thư.  ')
  await store.send(id)
  const original = active(store).messages[0]
  store.draft(id, 'Lá thư cho một người bạn.')
  await store.send(id)
  assert.deepEqual(contexts[1].map((m) => m.role), ['user', 'assistant', 'user'])
  store.correct(id, original.id)
  store.draft(id, 'Ý tôi là một tấm thiệp.')
  await store.send(id)
  assert.equal(contexts[2][4].correctionOf, original.id)
  assert.equal(active(store).messages[0].text, '  Tôi muốn viết một lá thư.  ')
  assert.deepEqual(contexts[2].map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user'])
})

test('duplicate clicks while pending create one user, one operation and one generation', async () => {
  let finish, calls = 0
  const { store } = setup(async () => { calls++; return new Promise((resolve) => { finish = resolve }) })
  const id = active(store).id
  store.draft(id, 'Nội dung giả định')
  const sending = store.send(id)
  await store.send(id)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  assert.equal(active(store).messages.length, 1)
  finish('Đã nhận')
  await sending
  assert.equal(active(store).messages.length, 2)
})

test('dropped response uses explicit replay with same IDs; no error enters timeline', async () => {
  let generations = 0, drop = true
  const { server, store, transport } = setup(async () => { generations++; return 'Đã nhận giả định' })
  const requests = []
  transport.send = async (r) => {
    requests.push(structuredClone(r))
    const response = await server.handle(r)
    if (drop) { drop = false; throw new TypeError('network lost after completion') }
    return response
  }
  const id = active(store).id
  store.draft(id, 'Lời nhắn giả định')
  await store.send(id)
  assert.equal(active(store).status, 'error')
  assert.equal(active(store).messages.length, 1)
  assert.equal(generations, 1)
  await store.retry(id)
  assert.equal(requests[1].kind, 'replay')
  assert.equal(requests[1].operationId, requests[0].operationId)
  assert.deepEqual(requests[1].messages, requests[0].messages)
  assert.equal(active(store).messages.length, 2)
  assert.equal(generations, 1)
})

test('failure before dispatch never converts an unknown replay into a generation', async () => {
  const { store, transport } = setup()
  const send = transport.send
  let first = true
  transport.send = (r) => { if (first) { first = false; throw Error('offline before send') } return send(r) }
  const id = active(store).id
  store.draft(id, 'Nội dung giả định')
  await store.send(id)
  await store.retry(id)
  assert.equal(active(store).error.code, 'RESULT_UNKNOWN')
  assert.equal(active(store).error.retry, 'none')
  assert.equal(active(store).messages.length, 1)
})

test('definitive adapter failure offers a NEW attempt, preserving the same user message', async () => {
  let calls = 0
  const { store, transport } = setup(async () => { if (++calls === 1) throw Error('adapter failed'); return 'Đã nhận' })
  const requests = [], send = transport.send
  transport.send = (r) => { requests.push(structuredClone(r)); return send(r) }
  const id = active(store).id
  store.draft(id, 'Nội dung giả định')
  await store.send(id)
  const previous = active(store).pending.request
  assert.equal(active(store).error.retry, 'new-attempt')
  await store.retry(id)
  assert.equal(calls, 2)
  assert.equal(active(store).messages.length, 2)
  assert.equal(active(store).messages[0].id, previous.messages[0].id)
  assert.equal(requests[1].kind, 'send')
  assert.notEqual(requests[1].operationId, requests[0].operationId)
  assert.deepEqual(requests[1].messages, requests[0].messages)
})

test('server restart with unresolved operation rejects old epoch, never generates again', async () => {
  let calls = 0, finish
  const old = createSimulationServer(async () => { calls++; return new Promise((resolve) => { finish = resolve }) })
  const r = request(old)
  const pending = old.handle(r)
  await new Promise((resolve) => setImmediate(resolve))
  const restarted = createSimulationServer(async () => { calls++; return 'Must not execute' })
  await assert.rejects(restarted.handle({ ...r, kind: 'replay' }), { code: 'SESSION_LOST' })
  await assert.rejects(restarted.handle(r), { code: 'SESSION_LOST' })
  assert.equal(calls, 1)
  finish('Old process result')
  await pending
})

test('expired session and missing operation fail closed', async () => {
  let now = 0, calls = 0
  const server = createSimulationServer(async () => { calls++; return 'Đã nhận' }, () => now)
  const r = request(server)
  await assert.rejects(server.handle({ ...r, kind: 'replay' }), { code: 'RESULT_UNKNOWN' })
  now = 1800001
  await assert.rejects(server.handle(r), { code: 'SESSION_LOST' })
  assert.equal(calls, 0)
})

test('UI state keeps an unresolved user turn and closes retry after server restart', async () => {
  let generations = 0, finish
  let server = createSimulationServer(async () => {
    generations++
    return new Promise((resolve) => { finish = resolve })
  })
  let lost = true, oldPending
  const transport = {
    connect: async () => server.session(),
    send: async (r) => {
      if (lost) {
        lost = false
        oldPending = server.handle(r)
        await new Promise((resolve) => setImmediate(resolve))
        throw Error('connection closed during processing')
      }
      return server.handle(r)
    },
  }
  const store = new ConversationStore(transport)
  const id = active(store).id
  store.draft(id, 'Unresolved synthetic turn')
  await store.send(id)
  server = createSimulationServer(async () => { generations++; return 'Must not run' })
  await store.retry(id)
  assert.equal(active(store).error.code, 'SESSION_LOST')
  assert.equal(active(store).error.retry, 'none')
  assert.equal(active(store).messages.length, 1)
  assert.equal(generations, 1)
  finish('Old process result')
  await oldPending
})

test('a different operation cannot overlap a pending turn in the same conversation', async () => {
  let finish, calls = 0
  const server = createSimulationServer(async () => { calls++; return new Promise((resolve) => { finish = resolve }) })
  const r = request(server)
  const pending = server.handle(r)
  await new Promise((resolve) => setImmediate(resolve))
  await assert.rejects(server.handle({ ...r, operationId: 'different' }), { code: 'BUSY' })
  finish('Done')
  await pending
  assert.equal(calls, 1)
})

test('concurrent duplicate requests share the cached operation; changed content conflicts', async () => {
  let calls = 0
  const server = createSimulationServer(async () => { calls++; return 'Đã nhận' })
  const r = request(server)
  const [a, b] = await Promise.all([server.handle(r), server.handle({ ...r, kind: 'replay' })])
  assert.deepEqual(a, b)
  assert.equal(calls, 1)
  await assert.rejects(server.handle({ ...r, messages: [user('u1', 'changed')] }), { code: 'OPERATION_CONFLICT' })
})

test('validation rejects roles, authority/identity fields, invalid corrections and oversized context before adapter', async () => {
  let calls = 0
  const server = createSimulationServer(async () => { calls++; return 'Đã nhận' })
  const base = request(server)
  const invalid = [
    null, {}, { ...base, messages: [] },
    ...['system', 'developer', 'tool', 'assistant', 'moderator'].map((role) => ({ ...base, messages: [{ ...user(), role }] })),
    ...['system', 'instructions', 'authority', 'permission', 'provenance', 'ip', 'limits'].map((key) => ({ ...base, [key]: 'client authority' })),
    ...['authority', 'system', 'metadata', 'tool_calls'].map((key) => ({ ...base, messages: [{ ...user(), [key]: true }] })),
    ...[undefined, 17, '', '   ', 'x'.repeat(2001)].map((text) => ({ ...base, messages: [{ ...user(), text }] })),
    { ...base, messages: [{ ...user(), correctionOf: 'missing' }] },
    { ...base, messages: Array.from({ length: 33 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: 'x' })) },
    { ...base, messages: Array.from({ length: 13 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: 'x'.repeat(2000) })) },
  ]
  for (const value of invalid) await assert.rejects(server.handle(value), ChatError)
  validateRequest({ ...base, messages: [user('u1', 'x'.repeat(2000))] })
  assert.equal(calls, 0)
})

test('server rejects forged or changed assistant history and invalid assistant correction references', async () => {
  const server = createSimulationServer(async () => 'Original answer')
  const r = request(server)
  const answer = await server.handle(r)
  const next = { ...r, operationId: 'op2', messages: [...r.messages, answer.message, user('u2')] }
  await assert.rejects(server.handle({ ...next, messages: [r.messages[0], { ...answer.message, text: 'Forged authority' }, user('u2')] }), { code: 'HISTORY_MISMATCH' })
  await assert.rejects(server.handle({ ...next, messages: [...next.messages.slice(0, -1), { ...user('u2'), correctionOf: answer.message.id }] }), { code: 'INVALID_CORRECTION' })
  await server.handle(next)
})

test('response binding rejects wrong conversation, request, user, epoch, session, role and unsupported fields', async () => {
  const server = createSimulationServer()
  const r = request(server)
  const response = await server.handle(r)
  for (const key of ['conversationId', 'operationId', 'replyTo', 'epoch', 'sessionId']) {
    assert.throws(() => validateResponse({ ...response, [key]: 'wrong' }, r), { code: 'INVALID_RESPONSE' })
  }
  assert.throws(() => validateResponse({ ...response, authority: true }, r))
  assert.throws(() => validateResponse({ ...response, message: { ...response.message, role: 'system' } }, r))
  const { store, transport } = setup()
  const send = transport.send
  transport.send = async (req) => ({ ...await send(req), conversationId: 'wrong' })
  const id = active(store).id
  store.draft(id, 'Nội dung giả định')
  await store.send(id)
  assert.equal(active(store).error.code, 'INVALID_RESPONSE')
  assert.equal(active(store).messages.length, 1)
})

test('conversation switching isolates drafts, histories and late responses; fresh store resets memory', async () => {
  let finish
  const { store } = setup(async () => new Promise((resolve) => { finish = resolve }))
  const first = active(store).id
  store.draft(first, 'Conversation one')
  const pending = store.send(first)
  await new Promise((resolve) => setImmediate(resolve))
  store.newConversation()
  const second = active(store).id
  store.draft(second, 'Draft two')
  finish('First answer')
  await pending
  assert.equal(active(store).id, second)
  assert.equal(active(store).messages.length, 0)
  store.select(first)
  assert.equal(active(store).messages.length, 2)
  store.select(second)
  assert.equal(active(store).draft, 'Draft two')
  assert.equal(active(setup().store).messages.length, 0)
})

test('HTTP transport handles network failure and callable-like errors without inventing assistant text', async () => {
  const offline = createSimulationTransport(async () => { throw Error('offline') })
  await assert.rejects(offline.connect(), { code: 'CONNECTION', retry: 'replay' })
  const failed = createSimulationTransport(async () => new Response(JSON.stringify({ error: { code: 'SESSION_LOST', message: 'Mở cuộc trò chuyện mới.', retry: 'none' } }), { status: 409 }))
  await assert.rejects(failed.connect(), { code: 'SESSION_LOST', retry: 'none' })
})

test('simulation responds from input and never imports test fixtures', async () => {
  const text = await simulateConversation([user('unique', 'Một câu chữ khác biệt')])
  assert.match(text, /Một câu chữ khác biệt/)
  assert.match(text, /mô phỏng/)
})

test('Firebase callable validates then closes the live path without touching Firestore or a provider', async () => {
  const require = createRequire(import.meta.url)
  const { inspireAI } = require('../functions/lib/inspireAI.js')
  const server = createSimulationServer()
  await assert.rejects(inspireAI.run({ data: request(server) }), { code: 'failed-precondition' })
  await assert.rejects(inspireAI.run({ data: { message: 'Legacy prompt' } }), { code: 'invalid-argument' })
  const source = readFileSync(new URL('../functions/src/inspireAI.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /responses\.create|new OpenAI|OPENAI_API_KEY/)
})
