// Actual Chromium smoke test via CDP; no browser or test dependency added.
// Start `npm run dev -- --host 127.0.0.1` before running this script.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.INSPIRE_TEST_URL || 'http://127.0.0.1:5173'
const privateMode = process.argv.includes('--private')
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
assert.ok(chrome, 'Set CHROME_PATH to an installed Chromium browser')
await fetch(base)
if (!process.argv.includes('--production')) {
  // Isolate this synthetic browser fixture from earlier loopback test traffic.
  // Enforcement remains enabled throughout the test; never used in app code.
  assert.ok(base.startsWith('http://127.0.0.1:'))
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  process.env.METADATA_SERVER_DETECTION = 'none'
  const require = createRequire(new URL('../functions/package.json', import.meta.url))
  const {initializeApp, deleteApp} = require('firebase-admin/app')
  const {getFirestore} = require('firebase-admin/firestore')
  const app = initializeApp({projectId:'demo-inspire'}, 'browser-fixture')
  const db = getFirestore(app)
  await Promise.all(['127.0.0.1','::1','::ffff:127.0.0.1'].map((ip) => db.collection('inspireAIRateLimits').doc(createHash('sha256').update(ip).digest('hex')).delete()))
  await db.terminate(); await deleteApp(app)
}
const profile = mkdtempSync(join(tmpdir(), 'inspire-browser-'))
const evidence = resolve(process.env.INSPIRE_EVIDENCE_DIR || 'docs/evidence/inspire-chat')
mkdirSync(evidence, { recursive: true })
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: 'ignore', windowsHide: true })
let socket, sequence = 0
const waiting = new Map(), handlers = new Map()
const results = [], errors = [], requests = [], blocked = [], emulatorRequests = []
function on(event, callback) { handlers.set(event, callback) }
function call(method, params = {}) {
  return new Promise((resolveCall, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { waiting.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 20000)
    waiting.set(id, { resolve: resolveCall, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description)
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(100) }
  throw Error('Browser wait failed: ' + expression)
}
async function navigate(path) {
  await call('Page.navigate', { url: base + path })
  await until(`location.pathname === ${JSON.stringify(path.split('?')[0])} && document.querySelector('main') && document.readyState === 'complete'`)
}
async function reload() {
  const previous = await evaluate('performance.timeOrigin')
  await call('Page.reload', { ignoreCache: true })
  await until(`performance.timeOrigin !== ${previous} && document.readyState === 'complete' && !!document.querySelector('main')`)
}
async function screenshot(name) {
  await evaluate(`window.scrollTo({top:0, behavior:'instant'})`)
  await evaluate('document.fonts.ready')
  await delay(150)
  const cssContentSize = await evaluate(`({ width: document.documentElement.clientWidth,
    height: Math.ceil(document.querySelector('.site-shell').getBoundingClientRect().bottom + scrollY + 30) })`)
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } })
  writeFileSync(join(evidence, name + '.png'), Buffer.from(data, 'base64'))
}
async function draft(text) {
  await evaluate(`(() => { const input = document.querySelector('#inspire-message');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}
const count = (role) => evaluate(`document.querySelectorAll('[data-message-role="${role}"]').length`)
async function send(text, duplicate = false) {
  await draft(text)
  await evaluate(`document.querySelector('.ip-composer').requestSubmit(); ${duplicate ? "document.querySelector('.ip-composer').requestSubmit()" : ''}`)
}
function pass(name, detail) { results.push({ check: name, status: 'PASS', detail }); console.log('PASS', name, detail || '') }

try {
  let targets
  for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9333/json/list')).json(); break } catch { await delay(100) }
  }
  assert.ok(targets?.length, 'Chromium debugging endpoint available')
  socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data)
    if (event.id) {
      const pending = waiting.get(event.id)
      if (!pending) return
      clearTimeout(pending.timer); waiting.delete(event.id)
      if (event.error) pending.reject(Error(event.error.message)); else pending.resolve(event.result)
    } else Promise.resolve(handlers.get(event.method)?.(event.params)).catch((error) => errors.push('Browser harness: ' + error.message))
  })
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable')
  await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*', '*google-analytics.com*', '*analytics.google.com*', '*firestore.googleapis.com*', '*api.openai.com*', '*firebaseinstallations.googleapis.com*'] })
  on('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text))
  on('Network.requestWillBeSent', (event) => {
    if (/127\.0\.0\.1:(9099|8080)/.test(event.request.url)) emulatorRequests.push(event.request.url.split('?')[0])
    if (event.request.url.includes('/api/inspire-prototype')) requests.push(JSON.parse(event.request.postData || '{}'))
    if (/cloudfunctions.net|api.openai.com/.test(event.request.url)) blocked.push(event.request.url)
  })
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await navigate('/ai-inspire'+(privateMode?'?thu-rieng=1':''))
  await until(`!!document.querySelector('.ip-welcome')`)
  if (privateMode && !process.argv.includes('--production')) {
    await until(`document.querySelector('#inspire-message').disabled === false`)
    assert.equal(await evaluate(`document.querySelector('h1').textContent`),'Phòng thử riêng của bố')
    assert.equal(await evaluate(`document.querySelector('.ip-private-setup').open`),false)
    assert.equal(await evaluate(`document.querySelector('.ip-private-modes button').getAttribute('aria-pressed')`),'true')
    assert.ok(await evaluate(`document.querySelector('.ip-mode').textContent.includes('Chưa dùng AI')`))
    await screenshot('father-welcome-desktop')
    await send('Một tình huống giả định: tôi muốn hiểu rõ điều mình vừa trải qua.',true)
    await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 1`)
    assert.equal(await count('user'),1)
    await send('Tôi muốn nói rõ hơn về câu hỏi vừa rồi.')
    await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 2`)
    assert.deepEqual(requests.filter(r=>r.kind==='send')[1].messages.map(m=>m.role),['user','assistant','user'])
    await evaluate(`document.querySelector('.ip-correct').click()`)
    await send('Tôi đính chính: đây là tình huống ở nơi làm việc.')
    await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 3`)
    assert.ok(requests.filter(r=>r.kind==='send')[2].messages.at(-1).correctionOf)
    await evaluate(`document.querySelectorAll('.ip-private-feedback button')[1].click()`)
    await evaluate(`(() => { const input=document.querySelector('[aria-label="Ghi chú cho con"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Ghi chú giả định: cần xem lại cách trình bày.'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    assert.ok(await evaluate(`document.querySelector('[aria-label="Ghi chú cho con"]').value.includes('Ghi chú giả định')`))
    assert.ok(requests.every(r=>!JSON.stringify(r).includes('Ghi chú giả định')))
    await screenshot('father-conversation-desktop')
    pass('Private Vietnamese screen, disabled Luna, duplicate protection, follow-up, correction and memory-only feedback')
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await call('Emulation.setPageScaleFactor',{pageScaleFactor:1})
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ip-message-body p')).fontSize`),'20px')
    assert.ok(await evaluate(`document.querySelector('.ip-composer button').getBoundingClientRect().height>=48`))
    await delay(200)
    const position=await evaluate(`({label:document.querySelector('.ip-message:last-child .ip-message-label').getBoundingClientRect().top,top:document.querySelector('.ip-timeline').getBoundingClientRect().top,bottom:document.querySelector('.ip-timeline').getBoundingClientRect().bottom})`)
    assert.ok(position.label>=position.top && position.label<position.bottom,'Latest reply begins visibly inside the mobile transcript')
    await screenshot('father-conversation-mobile')
    await reload()
    await until(`!!document.querySelector('.ip-welcome') && document.querySelector('#inspire-message').disabled === false`)
    assert.equal(await count('user'),0)
    assert.equal(await evaluate(`document.querySelectorAll('.ip-private-feedback').length`),0)
    assert.deepEqual(blocked,[]);assert.deepEqual(errors,[])
    pass('Private mobile layout; refresh clears conversation and feedback; no provider or booking call')
    writeFileSync(join(evidence,'father-browser-results.json'),JSON.stringify({results,errors,providerRequests:blocked,mode:'simulation-only',modelQuality:'NOT_ASSESSED'},null,2))
  } else if (process.argv.includes('--production')) {
    assert.equal(await evaluate(`document.querySelector('.ip-private') === null`), true)
    assert.equal(await evaluate(`document.querySelector('.ip-private-setup') === null`), true)
    assert.equal(await evaluate(`document.querySelector('#inspire-message').disabled`), true)
    assert.equal(await evaluate(`document.querySelector('.ip-composer button').disabled`), true)
    assert.ok(await evaluate(`document.querySelector('.ip-disclosure').textContent.includes('đang đóng kết nối')`))
    await evaluate(`document.querySelector('.ip-composer').requestSubmit()`)
    await delay(300)
    assert.equal(requests.length, 0)
    assert.equal(await count('user'), 0)
    assert.deepEqual(blocked, [])
    assert.deepEqual(emulatorRequests, [])
    assert.equal(await evaluate(`document.querySelector('.ip-account') === null`),true)
    await screenshot('closed-production')
    pass('Production preview keeps sending closed with no API requests')
    writeFileSync(join(evidence, 'production-results.json'), JSON.stringify({ results, errors, emulatorRequests, chatRequests:requests.length }, null, 2))
  } else {
  await until(`document.querySelector('#inspire-message').disabled === false && !!document.querySelector('[data-testid="quota"]')`)
  assert.ok(await evaluate(`document.querySelector('[data-testid="quota"]').textContent.includes('10')`))
  await screenshot('welcome-desktop')
  pass('Desktop welcome and simulation disclosure')

  await send('Tôi muốn viết một lời cảm ơn cho một người bạn.', true)
  await until(`!!document.querySelector('.ip-loading')`)
  assert.equal(await evaluate(`document.querySelector('.ip-composer button').disabled`), true)
  await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 1`)
  assert.equal(await count('user'), 1)
  await send('Lời nhắn ngắn gọn và gần gũi nhé.')
  await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 2`)
  const sendRequests = requests.filter((r) => r.kind === 'send')
  assert.deepEqual(sendRequests[1].messages.map((m) => m.role), ['user', 'assistant', 'user'])
  pass('Multi-turn context, loading and duplicate submission prevention')

  await evaluate(`document.querySelector('.ip-correct').click()`)
  await send('Tôi muốn cảm ơn một đồng nghiệp, không phải một người bạn.')
  await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 3`)
  assert.equal(await evaluate(`document.querySelector('[data-message-role="user"] .ip-message-body p').textContent`), 'Tôi muốn viết một lời cảm ơn cho một người bạn.')
  assert.ok(requests.filter((r) => r.kind === 'send')[2].messages.at(-1).correctionOf)
  await screenshot('conversation-desktop')
  pass('Explicit correction preserves original message')

  let dropResponse = true
  let interceptionActive = true
  await call('Fetch.enable', { patterns: [{ urlPattern: '*api/inspire-prototype*', requestStage: 'Response' }] })
  on('Fetch.requestPaused', async (event) => {
    try {
    if (dropResponse && JSON.parse(event.request.postData || '{}').kind === 'send') {
      dropResponse = false
      await call('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' })
    } else await call('Fetch.continueRequest', { requestId: event.requestId })
    } catch (error) {
      if (interceptionActive || !error.message.includes('Fetch domain is not enabled')) throw error
    }
  })
  await send('Thêm một lời chúc cho tuần mới.')
  await until(`!!document.querySelector('.ip-error')`)
  assert.equal(await count('assistant'), 3)
  assert.equal(await count('user'), 4)
  await screenshot('retry-desktop')
  await evaluate(`document.querySelector('.ip-error button').click()`)
  await until(`document.querySelectorAll('[data-message-role="assistant"]').length === 4`)
  assert.equal(await count('user'), 4)
  const lastRequests = requests.filter((r) => r.kind === 'send' || r.kind === 'replay').slice(-2)
  assert.equal(lastRequests[1].kind, 'replay')
  assert.equal(lastRequests[1].operationId, lastRequests[0].operationId)
  interceptionActive = false
  await call('Fetch.disable')
  pass('Actual lost HTTP response and explicit replay', 'Same user and operation; error outside timeline')

  await evaluate(`document.querySelector('.ip-new').click()`)
  await until(`!!document.querySelector('.ip-welcome')`)
  await draft('Bản nháp của cuộc trò chuyện thứ hai')
  await evaluate(`document.querySelector('.ip-conversations button').click()`)
  assert.equal(await count('user'), 4)
  await evaluate(`document.querySelectorAll('.ip-conversations button')[1].click()`)
  assert.equal(await evaluate(`document.querySelector('#inspire-message').value`), 'Bản nháp của cuộc trò chuyện thứ hai')
  await evaluate(`document.querySelector('.ip-conversations button').click()`)
  pass('Conversation switching and independent drafts')

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
  await delay(200)
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  const sizes = await evaluate(`({body: getComputedStyle(document.querySelector('.ip-message-body p')).fontSize,
    send: document.querySelector('.ip-composer button').getBoundingClientRect().height,
    menu: document.querySelector('.ip-mobile-toggle').getBoundingClientRect().height})`)
  assert.equal(sizes.body, '18px'); assert.ok(sizes.send >= 48); assert.ok(sizes.menu >= 48)
  await screenshot('conversation-mobile')
  await evaluate(`document.querySelector('.ip-mobile-toggle').click()`)
  assert.equal(await evaluate(`document.querySelector('.ip-sidebar').classList.contains('is-open')`), true)
  await evaluate(`document.querySelectorAll('.ip-conversations button')[1].click()`)
  assert.equal(await evaluate(`document.querySelector('#inspire-message').value`), 'Bản nháp của cuộc trò chuyện thứ hai')
  pass('390px mobile layout, 18px message text, 48px controls and conversation navigation', sizes)

  await reload()
  await until(`!!document.querySelector('.ip-welcome') && document.querySelectorAll('.ip-conversations button').length === 1`)
  assert.equal(await count('user'), 0)
  assert.equal(await evaluate(`document.querySelector('#inspire-message').value`), '')
  await until(`!!document.querySelector('[data-testid="quota"]') && document.querySelector('[data-testid="quota"] b').textContent === '6'`)
  pass('Refresh resets prototype conversations and drafts')

  // Actual browser SDK registration, sign-out, reload and email sign-in.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.querySelector('.ip-account-actions button').click()`)
  await evaluate(`[...document.querySelectorAll('.ip-auth-form button')].find(b => b.textContent.includes('Chưa có')).click()`)
  const email = `browser-${Date.now()}@synthetic.invalid`
  await evaluate(`(() => { for (const [name, value] of Object.entries({email:${JSON.stringify(email)}, password:'Synthetic-test-753!'})) {
    const input = document.querySelector('.ip-auth-form [name="'+name+'"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  } document.querySelector('.ip-auth-form').requestSubmit(); })()`)
  await until(`document.querySelector('.ip-account-summary strong').textContent === 'Tài khoản INSPIRE'`)
  assert.equal(await evaluate(`document.querySelector('[data-testid="quota"] b').textContent`), '30')
  await evaluate(`[...document.querySelectorAll('.ip-account-actions button')].find(b => b.textContent.includes('Tùy chọn')).click()`)
  await evaluate(`(() => { const input = document.querySelector('.ip-preferences input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Tên giả định'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await evaluate(`document.querySelector('.ip-preferences').requestSubmit()`)
  await until(`document.body.textContent.includes('Đã lưu tùy chọn')`)
  await screenshot('account-profile-desktop')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  await screenshot('account-profile-mobile')
  await evaluate(`[...document.querySelectorAll('.ip-account-actions button')].find(b => b.textContent === 'Đăng xuất').click()`)
  await until(`document.querySelector('#inspire-message').disabled && !!document.querySelector('.ip-auth-form')`)
  await reload()
  await until(`!!document.querySelector('.ip-auth-form')`)
  assert.equal(await evaluate(`document.querySelector('#inspire-message').disabled`), true)
  await evaluate(`(() => { for (const [name, value] of Object.entries({email:${JSON.stringify(email)}, password:'Synthetic-test-753!'})) {
    const input = document.querySelector('.ip-auth-form [name="'+name+'"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true}));
  } document.querySelector('.ip-auth-form').requestSubmit(); })()`)
  await until(`document.querySelector('.ip-account-summary strong').textContent === 'Tài khoản INSPIRE'`)
  assert.equal(await evaluate(`document.querySelector('[data-testid="quota"] b').textContent`), '30')
  pass('Browser email registration/link, optional profile, signout/reload and sign-in', 'No replacement guest allowance; registered allowance 30')

  // Exercise each existing article and real share/export controls, without external sharing.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await navigate('/tham-van-tam-ly')
  const links = await evaluate(`Array.from(new Set([...document.querySelectorAll('a[href^="/tham-van-tam-ly/"]')].map(a => a.getAttribute('href'))))`)
  assert.equal(links.length, 6)
  const topics = []
  for (const link of links) {
    await navigate(link)
    await until(`document.querySelectorAll('.counseling-export-button').length === 3`)
    const info = await evaluate(`({ title: document.querySelector('h1').textContent.trim(),
      exports: [...document.querySelectorAll('.counseling-export-button')].map(b => b.textContent.trim()),
      image: document.querySelectorAll('[data-counseling-long-image]').length })`)
    assert.equal(info.image, 1)
    assert.deepEqual(info.exports, ['Tải PDF', 'Tải ảnh chia sẻ', 'Chia sẻ'])
    topics.push(info.title)
  }
  // Stub only OS side effects; actual site click handlers and export renderer run.
  const downloads = join(profile, 'downloads')
  mkdirSync(downloads, { recursive: true })
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  await evaluate(`window.__printCalled = false; window.print = () => { window.__printCalled = true }; document.querySelector('.counseling-export-button').click()`)
  assert.equal(await evaluate('window.__printCalled'), true)
  await evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { window.__sharePayload = data } }); document.querySelectorAll('.counseling-export-button')[2].click()`)
  await until(`!!window.__sharePayload`)
  assert.ok((await evaluate('window.__sharePayload.url')).includes('/tham-van-tam-ly/'))
  await evaluate(`document.querySelectorAll('.counseling-export-button')[1].click()`)
  await until(`document.body.textContent.includes('Đã tải ảnh chia sẻ')`)
  for (let i = 0; i < 30 && !readdirSync(downloads).some((name) => name.endsWith('.png')); i++) await delay(100)
  const pngs = readdirSync(downloads).filter((name) => name.endsWith('.png'))
  assert.equal(pngs.length, 1)
  const png = readFileSync(join(downloads, pngs[0]))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 1080)
  assert.ok(png.readUInt32BE(20) > 2000)
  pass('Six counselling topics; PDF, share handler and real PNG export', topics)

  await navigate('/nghi-duong-duong-sinh')
  await until(`!!document.querySelector('#dat-lich-nghi-duong .booking-form')`)
  assert.ok(await evaluate(`document.querySelector('h1').textContent.includes('Một nơi')`))
  assert.ok(await evaluate(`document.querySelectorAll('#dat-lich-nghi-duong .booking-form input').length >= 2`))
  pass('Retreat page and booking form render', 'No booking submitted')
  assert.deepEqual(blocked, [], 'No paid model or booking callable was requested')
  assert.deepEqual(errors, [], 'No unhandled browser exceptions')
  pass('No provider/booking calls or unhandled browser exceptions')
  writeFileSync(join(evidence, 'browser-results.json'), JSON.stringify({ results, errors, screenshots: ['welcome-desktop.png', 'conversation-desktop.png', 'retry-desktop.png', 'conversation-mobile.png', 'account-profile-desktop.png', 'account-profile-mobile.png'] }, null, 2))
  console.log(`${results.length} browser checks passed. Evidence: ${evidence}`)
  }
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close') } catch { /* browser exited */ } socket.close() }
  child.kill()
  await delay(1000)
  // Only the isolated temporary profile created above is removed.
  if (profile.startsWith(join(tmpdir(), 'inspire-browser-'))) rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
}
