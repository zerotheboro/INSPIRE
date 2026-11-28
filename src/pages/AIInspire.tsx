/// <reference types="vite/client" />
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { Link } from "react-router"
import Header from "../components/Header"
import Icon from "../components/Icon"
import InspireAccountPanel from "../components/InspireAccountPanel"
import {chatToken} from "../services/inspireIdentity"
import { createSimulationTransport, createPrivateConversationTransport } from "../services/InspireAIconnect"
import { CHAT_LIMITS, ConversationStore } from "../services/inspireConversation"

const starters = ["Sắp xếp một ngày nhiều việc", "Viết một lời cảm ơn", "Nhìn từ một góc khác"]
// Tab memory only: retain unsent wording across route changes, never localStorage.
const drafts = new Map<boolean, {uid: string | null; text: string}>()
let hotWorkspace = import.meta.hot?.data.workspace

export default function AIInspire() {
  const privateTest = import.meta.env.DEV && import.meta.env.MODE === "development" &&
    (import.meta.env.INSPIRE_PRIVATE_LOCAL || new URLSearchParams(window.location.search).get("thu-rieng") === "1")
  const [privateReady, setPrivateReady] = useState(false)
  const [checking, setChecking] = useState(privateTest)
  const [privateError, setPrivateError] = useState("")
  const [backendConnected, setBackendConnected] = useState(false)
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [budgetReleased, setBudgetReleased] = useState(false)
  const [budgetReason, setBudgetReason] = useState('')
  const [apiReady, setApiReady] = useState(false)
  const [conversationReady, setConversationReady] = useState(false)
  const [rag, setRag] = useState<{ready: boolean; state: string; records?: number; sections?: number; warnings?: number}>()
  const [apiRoute, setApiRoute] = useState<'chatgpt' | 'api'>('chatgpt')
  const [apiMode, setApiMode] = useState(privateTest)
  const [knowledgeTrace, setKnowledgeTrace] = useState<unknown>(null)
  const [feedback, setFeedback] = useState<Record<string, {rating: string; note: string}>>({})
  useEffect(() => {
    if (!privateTest) return
    const abort = new AbortController()
    const check = () => { void fetch("/api/inspire-private-status", {cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(7000)])})
      .then(async (response) => {
        const value = await response.json()
        if (!response.ok || value.mode !== "simulation" || value.modelAvailable !== false) throw Error()
        setPrivateReady(true)
        setChecking(false)
        setBackendConnected(true)
        setApiReady(value.privateRoute === 'luna-api')
        setConversationReady(value.privateRoute === 'luna-api' && value.conversationTransport === true)
        setKeyConfigured(value.keyConfigured === true)
        setRag(value.rag ?? {ready:false,state:'unverified'})
        setApiRoute(value.privateRoute === 'luna-api' ? 'api' : 'chatgpt')
        setPrivateError("")
      }).catch(() => { if (!abort.signal.aborted) { setChecking(false); setBackendConnected(false); setApiReady(false); setKeyConfigured(false); setBudgetReleased(false); setPrivateError("Không kết nối được INSPIRE AI riêng. Nhờ con kiểm tra máy chủ giúp bố.") } }) }
    check()
    const timer = setInterval(check,10000)
    return () => { clearInterval(timer); abort.abort() }
  }, [privateTest])
  const makeStore = () => {
    const next = new ConversationStore(apiMode && privateTest ?
    createPrivateConversationTransport(setKnowledgeTrace, fetch, chatToken, () => window.dispatchEvent(new Event("inspire-account-refresh"))) :
    createSimulationTransport(fetch, chatToken, () => window.dispatchEvent(new Event("inspire-account-refresh")), setKnowledgeTrace))
    next.draft(next.getSnapshot().activeId, drafts.get(privateTest)?.text ?? '')
    return next
  }
  const [store, setStore] = useState<ConversationStore>(() => {
    const saved = hotWorkspace; hotWorkspace = undefined
    return saved?.apiMode === apiMode && saved?.privateTest === privateTest ? saved.store : makeStore()
  })
  if (import.meta.hot) import.meta.hot.data.workspace = {store,apiMode,privateTest}
  const storeMode = useRef(apiMode)
  const identityKey = useRef<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)
  const onIdentity = useCallback((key: string | null) => {
    const uid = key?.split(":")[0] ?? null
    if (identityKey.current !== uid) {
      const saved = drafts.get(privateTest)
      if (saved?.uid && saved.uid !== uid) drafts.delete(privateTest)
      else if (saved) drafts.set(privateTest, {...saved, uid})
      identityKey.current = uid; setStore(makeStore()); setFeedback({}); setKnowledgeTrace(null); setBudgetReleased(false)
    }
    setIdentityReady(!!key)
  }, [apiMode])
  useEffect(() => {
    if (storeMode.current === apiMode) return
    storeMode.current = apiMode
    setStore(makeStore()); setFeedback({}); setKnowledgeTrace(null); setBudgetReleased(false)
  }, [apiMode])
  useEffect(() => {
    if (!conversationReady || !identityReady || !apiMode) { setBudgetReleased(false); return }
    let active = true
    const check = () => { void store.diagnostics().then(value => {
      if (!active) return
      setKnowledgeTrace(value)
      setBudgetReleased((value as {budget?: {released?: boolean}})?.budget?.released === true)
      setBudgetReason((value as {budget?: {reason?: string}})?.budget?.reason ?? '')
    }).catch(() => { if (active) setBudgetReleased(false) }) }
    check()
    const timer = setInterval(check, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [store,conversationReady,identityReady,apiMode])
  const workspace = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const current = workspace.conversations.find((c) => c.id === workspace.activeId)!
  useEffect(() => { drafts.set(privateTest, {uid: identityKey.current, text: current.draft}) }, [current.draft, privateTest])
  const [showConversations, setShowConversations] = useState(false)
  const timeline = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const prototypeEnabled = import.meta.env.DEV && import.meta.env.MODE === "development"
  const available = prototypeEnabled && identityReady && (!privateTest || (privateReady && backendConnected)) &&
    (!privateTest || !apiMode || (apiReady && conversationReady && keyConfigured && budgetReleased && rag?.ready === true))
  const locked = current.status !== "idle" || !available
  const blockedReason = !prototypeEnabled ? 'AI công khai chưa được mở.' : privateTest && apiMode ?
    checking ? 'Đang kiểm tra kết nối AI. Bạn vẫn có thể soạn tin.' :
    !backendConnected || !apiReady || !conversationReady || !keyConfigured ? 'Không kết nối được Luna API. Bạn vẫn có thể soạn tin.' :
    !rag?.ready ? 'Kho tri thức chưa sẵn sàng. Chưa thể gửi tới AI.' :
    !identityReady ? 'Chưa kết nối tài khoản thử. Nhờ con kiểm tra trong “Dành cho con”.' :
    !budgetReleased ? budgetReason === 'SESSION_IDENTITY' ? 'Tài khoản đang mở chưa được liên kết với phiên đã duyệt. Nhờ con kiểm tra trong “Dành cho con”.' : 'Phiên AI chưa có quyền gửi hợp lệ. Bạn vẫn có thể soạn tin.' : '' :
    !identityReady ? 'Chưa kết nối tài khoản thử. Bạn vẫn có thể soạn tin.' : ''
  const correction = current.messages.find((m) => m.id === current.correctionOf)
  const userError = current.error ? !conversationReady || current.error.code.startsWith('SESSION_') ? current.error.message :
    ['CONNECTION','HTTP_TIMEOUT','OUTCOME_UNKNOWN','RESULT_UNKNOWN','SESSION_LOST'].includes(current.error.code) ? 'Kết quả chưa xác định được. Lượt này được giữ để đối chiếu; hệ thống không tự tạo câu trả lời khác.' :
    'Chưa hoàn tất được câu trả lời. Nhờ con kiểm tra giúp; hệ thống không tự gửi lại.' : ''

  useEffect(() => {
    const element = timeline.current
    if (!element) return
    const align = () => {
      const latest = element.lastElementChild
      if (privateTest && current.messages.length && latest) {
        element.scrollTop += latest.getBoundingClientRect().top - element.getBoundingClientRect().top - 20
      } else element.scrollTop = current.messages.length ? element.scrollHeight : 0
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(element)
    return () => observer.disconnect()
  }, [current.id, current.messages.length, current.status, privateTest])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!locked) { setKnowledgeTrace(null); void store.send(current.id) }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!locked && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className={`site-shell inspire-prototype${privateTest ? " ip-private" : ""}`}>
      {!privateTest && <Header />}
      <main className="ip-main">
        <div className="ip-page-heading">
          <div><span className="ip-kicker">{privateTest ? "INSPIRE · DÙNG RIÊNG" : "MỘT KHOẢNG DỪNG CHO BẠN"}</span><h1>Trò chuyện cùng INSPIRE</h1></div>
          <span className="ip-mode"><span /> {apiMode ? checking ? 'INSPIRE AI · Đang kiểm tra' : !backendConnected || !apiReady || !conversationReady || !keyConfigured ? 'INSPIRE AI · Không kết nối' : !rag?.ready ? 'INSPIRE AI · Kho tri thức chưa sẵn sàng' : !budgetReleased ? 'INSPIRE AI · Phiên chưa được mở' : 'INSPIRE AI · Bản thử riêng' : "Mô phỏng · Chưa dùng AI"}</span>
        </div>
        {privateTest && apiMode && privateError && <p role="alert">{privateError}</p>}
        {privateTest && !current.messages.length && <div className="ip-private-intro">
          {apiMode && conversationReady && !rag?.ready && <p role="status">Kho tri thức đang chưa sẵn sàng. Hệ thống chưa gửi câu hỏi tới AI.</p>}
          {apiMode && backendConnected && conversationReady && !budgetReleased && <p role="status">Phiên AI riêng chưa có quyền gửi hợp lệ. Chưa gửi câu hỏi tới mô hình.</p>}
          <p>Bạn cứ hỏi bằng tiếng Việt, theo cách tự nhiên của mình. Có thể hỏi tiếp hoặc đính chính điều vừa nói.</p>
          {!apiMode && <p>Mô phỏng chỉ để thử cách sử dụng, chưa dùng mô hình AI.</p>}
          {!conversationReady && <details className="ip-family-guide"><summary>Gợi ý thử cùng con</summary>
            <p>Bố thử đóng vai một người vừa nghỉ hưu: “Chiều nay tôi rảnh mà chưa biết làm gì.” Sau đó hỏi tiếp: “Nếu chỉ có nửa tiếng thì sao?”</p>
            <p>Muốn sửa chi tiết, bấm <strong>Đính chính</strong> ở tin đầu rồi viết: “Tôi nói chưa đúng: tôi vẫn đi làm, chỉ rảnh chiều nay.” Lời ban đầu vẫn còn để đối chiếu.</p>
            <p>Bấm <strong>Dễ theo dõi</strong> hoặc <strong>Cần xem lại</strong> dưới câu trả lời. Ở chế độ mô phỏng, bố chỉ nhận xét cách sử dụng. Tải lại trang sẽ mất ghi chú.</p>
          </details>}
        </div>}
        {prototypeEnabled && (!privateTest || privateReady) && (privateTest ?
          <details className="ip-private-setup"><summary>Dành cho con · Thiết lập và tài khoản</summary><InspireAccountPanel onIdentity={onIdentity} />
            <div className="ip-private-modes" aria-label="Chế độ thử"><button aria-pressed={!apiMode} onClick={() => setApiMode(false)}>Mô phỏng</button><button disabled={!apiReady} aria-pressed={apiMode} onClick={() => setApiMode(true)}>{conversationReady ? 'Trả lời bằng AI' : apiReady ? `${apiRoute === 'api' ? 'Luna API' : 'ChatGPT'} · Xem trước` : 'Chưa bật'}</button></div>
            {!conversationReady && <p>Đường Luna API riêng chưa kết nối. Không tự chuyển sang mô phỏng.</p>}
            {conversationReady && <><p>Đường API thật dùng ngân sách phiên riêng, không dùng grant cũ. Mỗi lần Gửi tự truy xuất tối đa ba đoạn đủ quyền; không tự retry. Output mã hóa chỉ được đọc trong bảy ngày và được dọn khi kho hoạt động; lịch sử giao diện chỉ ở bộ nhớ tab.</p><pre>{JSON.stringify({rag,connection:knowledgeTrace,error:current.error ? {code:current.error.code,message:current.error.message} : null},null,2)}</pre></>}
            {knowledgeTrace != null && (knowledgeTrace as {conversationId?: string}).conversationId === current.id && <details><summary>Biên nhận chuẩn bị · không hiển thị văn bản nguồn</summary><pre>{JSON.stringify(knowledgeTrace, null, 2)}</pre></details>}
          </details> :
          <InspireAccountPanel onIdentity={onIdentity} />)}
        <div className="ip-workspace">
          <aside className={`ip-sidebar ${showConversations ? "is-open" : ""}`} aria-label="Các cuộc trò chuyện">
            <button className="ip-new" disabled={workspace.conversations.length >= 20} onClick={() => { store.newConversation(); setShowConversations(false); composer.current?.focus() }}>
              <span aria-hidden="true">＋</span> Cuộc trò chuyện mới
            </button>
            <div className="ip-sidebar-label">TRONG PHIÊN NÀY</div>
            <nav className="ip-conversations" aria-label="Chọn cuộc trò chuyện">
              {workspace.conversations.map((c, index) => <button key={c.id} aria-current={c.id === current.id ? "true" : undefined}
                onClick={() => { store.select(c.id); setShowConversations(false) }}>
                <Icon name="message" size={20} /><span><strong>{c.messages.length ? c.title : `Cuộc trò chuyện ${index + 1}`}</strong><small>{c.status === "sending" ? "Đang phản hồi…" : `${c.messages.filter((m) => m.role === "user").length} tin nhắn của bạn`}</small></span>
              </button>)}
            </nav>
            <div className="ip-memory"><Icon name="leaf" size={25} /><p>Hội thoại trong tab này.</p><p>Tải lại hoặc rời trang sẽ xóa các cuộc trò chuyện khỏi giao diện.</p></div>
            <Link className="ip-human" to="/tham-van-tam-ly">Khi bạn muốn gặp một người thật <Icon name="arrow" size={20} /></Link>
          </aside>
          <section className="ip-chat" aria-label="Không gian trò chuyện">
            <header className="ip-chat-heading">
              <div className="ip-assistant-mark"><Icon name="leaf" size={26} /></div>
              <div><strong>INSPIRE</strong><span>Chậm lại một chút. Bắt đầu từ điều bạn muốn.</span></div>
              <button className="ip-mobile-toggle" aria-expanded={showConversations} onClick={() => setShowConversations(!showConversations)} aria-label="Danh sách cuộc trò chuyện"><Icon name="message" /></button>
            </header>
            <div className="ip-disclosure"><Icon name="spark" size={20} /><p>{apiMode && available ? 'Đây là AI trong bản thử riêng. Không thay thế hỗ trợ chuyên môn.' : apiMode ? 'AI chưa sẵn sàng nhận tin. Bạn vẫn có thể soạn câu hỏi.' : 'Mô phỏng · Chưa dùng AI.'}</p></div>
            <div ref={timeline} className="ip-timeline" role="log" aria-label="Nội dung trò chuyện" aria-live="polite" aria-relevant="additions">
              {!current.messages.length && <div className="ip-welcome">
                <div className="ip-welcome-leaf"><Icon name="garden" size={44} /></div>
                <span className="ip-kicker">CHÀO BẠN, MÌNH LÀ INSPIRE</span>
                <h2>Bạn muốn trò chuyện<br />điều gì hôm nay?</h2>
                <p>Gõ câu hỏi vào ô bên dưới rồi bấm Gửi. Mình cùng bắt đầu từ điều bạn đang quan tâm.</p>
                {!privateTest && <div className="ip-starters">{starters.map((text) => <button key={text} disabled={!available} onClick={() => { store.draft(current.id, text); composer.current?.focus() }}>{text}<Icon name="arrow" size={19} /></button>)}</div>}
              </div>}
              {current.messages.map((m) => <article key={m.id} className={`ip-message ip-message-${m.role}`} data-message-role={m.role}>
                <div className="ip-message-label">{m.role === "user" ? "Bạn" : <><Icon name="leaf" size={18} /> INSPIRE <span>· {apiMode ? 'AI' : 'Mô phỏng'}</span></>}</div>
                <div className="ip-message-body">
                  {m.correctionOf && <div className="ip-correction-reference">Đính chính tin nhắn: “{current.messages.find((original) => original.id === m.correctionOf)?.text}”</div>}
                  <p>{m.text}</p>
                </div>
                {m.role === "user" && <button className="ip-correct" disabled={locked} onClick={() => { store.correct(current.id, m.id); composer.current?.focus() }}>Đính chính <span className="ip-sr">tin nhắn: {m.text}</span></button>}
                {privateTest && m.role === "assistant" && <div className="ip-private-feedback">
                  <span>Nhận xét cho con · {apiMode ? "bản nháp Luna, chưa được kiểm định" : "hiện chỉ về bản mô phỏng"}</span>
                  <div>{["Dễ theo dõi", "Cần xem lại"].map((rating) => <button key={rating} aria-pressed={feedback[m.id]?.rating === rating}
                    onClick={() => setFeedback((old) => ({...old, [m.id]: {rating, note: old[m.id]?.note ?? ""}}))}>{rating}</button>)}</div>
                  {feedback[m.id] && <label>Điều bố muốn ghi lại<textarea aria-label="Ghi chú cho con" maxLength={1000} rows={2} value={feedback[m.id].note}
                    onChange={(event) => setFeedback((old) => ({...old, [m.id]: {...old[m.id], note: event.target.value}}))} /></label>}
                </div>}
              </article>)}
            </div>
            <div className="ip-operation" aria-live="polite">
              {current.status === "sending" && <p className="ip-loading" role="status"><span className="ip-loading-dot" /> {apiMode ? "Đang trả lời…" : "Đang chuẩn bị phản hồi mô phỏng…"}</p>}
              {current.error && <div className="ip-error" role="alert"><p>{userError}</p>
                {current.status === "error" && (current.error.retry !== "none" || ['SESSION_IDENTITY','SESSION_LOST'].includes(current.error.code)) && current.error.code !== 'OWNER_APPROVED_READY' && <button onClick={() => void store.retry(current.id)}>{['SESSION_IDENTITY','SESSION_LOST'].includes(current.error.code) ? 'Gửi tin đang giữ · chỉ khi backend xác minh chưa gửi' : apiMode && current.error.code === "AUTHORIZATION_REQUIRED" ? "Kiểm tra quyền và gửi lượt này" : current.error.retry === "new-attempt" ? "Thử lại bằng lượt mới" : "Kiểm tra lại lượt gửi"}<Icon name="arrow" size={18} /></button>}
                {current.error.retry === "none" && !current.error.code.startsWith('SESSION_') && <button onClick={() => store.newConversation()}>Mở cuộc trò chuyện mới <Icon name="arrow" size={18} /></button>}
              </div>}
            </div>
            <div className="ip-composer-area">
              {correction && <div className="ip-correcting"><p><strong>Đính chính, giữ nguyên bản gốc</strong><span>“{correction.text}”</span></p><button onClick={() => store.correct(current.id)} aria-label="Hủy đính chính">Hủy</button></div>}
              <form className="ip-composer" onSubmit={submit}>
                <label className="ip-sr" htmlFor="inspire-message">Tin nhắn cho INSPIRE</label>
                <textarea id="inspire-message" ref={composer} value={current.draft}
                  aria-describedby="inspire-send-status"
                  onChange={(event) => { drafts.set(privateTest, {uid: identityKey.current, text: event.target.value}); store.draft(current.id, event.target.value) }} onKeyDown={keyDown}
                  maxLength={CHAT_LIMITS.message} rows={2} placeholder={correction ? "Điều bạn muốn đính chính…" : "Viết điều bạn muốn chia sẻ…"} />
                <div className="ip-composer-bottom"><span>{current.draft.length.toLocaleString("vi-VN")} / 2.000</span><button type="submit" disabled={locked || !current.draft.trim()}>Gửi <Icon name="arrow" size={21} /></button></div>
              </form>
              <p id="inspire-send-status" role="status">{blockedReason}</p>
              <p className="ip-footnote">Enter để gửi · Shift + Enter để xuống dòng.</p>
            </div>
          </section>
        </div>
        <p className="ip-bottom-note">Lịch sử{privateTest ? " và nhận xét" : ""} chỉ ở trong phiên này. Tải lại hoặc rời trang sẽ xóa các cuộc trò chuyện khỏi giao diện.</p>
      </main>
    </div>
  )
}
