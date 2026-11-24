/// <reference types="vite/client" />
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { Link } from "react-router"
import Header from "../components/Header"
import Icon from "../components/Icon"
import InspireAccountPanel from "../components/InspireAccountPanel"
import {chatToken} from "../services/inspireIdentity"
import { createSimulationTransport, createPrivateChatgptTransport } from "../services/InspireAIconnect"
import type {LunaPreview} from "../services/InspireAIconnect"
import { CHAT_LIMITS, ConversationStore } from "../services/inspireConversation"

const starters = ["Sắp xếp một ngày nhiều việc", "Viết một lời cảm ơn", "Nhìn từ một góc khác"]

export default function AIInspire() {
  const privateTest = import.meta.env.DEV && import.meta.env.MODE === "development" &&
    new URLSearchParams(window.location.search).get("thu-rieng") === "1"
  const [privateReady, setPrivateReady] = useState(false)
  const [privateError, setPrivateError] = useState("")
  const [apiReady, setApiReady] = useState(false)
  const [apiMode, setApiMode] = useState(false)
  const [knowledgeTrace, setKnowledgeTrace] = useState<unknown>(null)
  const [apiPreview, setApiPreview] = useState<LunaPreview>()
  const [feedback, setFeedback] = useState<Record<string, {rating: string; note: string}>>({})
  useEffect(() => {
    if (!privateTest) return
    const abort = new AbortController()
    void fetch("/api/inspire-private-status", {cache: "no-store", signal: abort.signal})
      .then(async (response) => {
        const value = await response.json()
        if (!response.ok || value.mode !== "simulation" || value.modelAvailable !== false) throw Error()
        setPrivateReady(true)
        setApiReady(value.chatgptPreview === true)
      }).catch(() => { if (!abort.signal.aborted) setPrivateError("Phòng thử riêng chưa mở. Nhờ con kiểm tra giúp bố.") })
    return () => abort.abort()
  }, [privateTest])
  const makeStore = () => new ConversationStore(apiMode && privateTest ?
    createPrivateChatgptTransport(setApiPreview, fetch, chatToken, () => window.dispatchEvent(new Event("inspire-account-refresh"))) :
    createSimulationTransport(fetch, chatToken, () => window.dispatchEvent(new Event("inspire-account-refresh")), setKnowledgeTrace))
  const [store, setStore] = useState(makeStore)
  const identityKey = useRef<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)
  const onIdentity = useCallback((key: string | null) => {
    const uid = key?.split(":")[0] ?? null
    if (identityKey.current !== uid) { identityKey.current = uid; setStore(makeStore()); setFeedback({}); setApiPreview(undefined); setKnowledgeTrace(null) }
    setIdentityReady(!!key)
  }, [apiMode])
  useEffect(() => { setStore(makeStore()); setFeedback({}); setApiPreview(undefined); setKnowledgeTrace(null) }, [apiMode])
  const workspace = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const current = workspace.conversations.find((c) => c.id === workspace.activeId)!
  const [showConversations, setShowConversations] = useState(false)
  const timeline = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const prototypeEnabled = import.meta.env.DEV && import.meta.env.MODE === "development"
  const available = prototypeEnabled && identityReady && (!privateTest || privateReady)
  const locked = current.status !== "idle" || !available
  const correction = current.messages.find((m) => m.id === current.correctionOf)

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
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className={`site-shell inspire-prototype${privateTest ? " ip-private" : ""}`}>
      {!privateTest && <Header />}
      <main className="ip-main">
        <div className="ip-page-heading">
          <div><span className="ip-kicker">{privateTest ? "INSPIRE · CHỈ TRÊN MÁY NÀY" : "MỘT KHOẢNG DỪNG CHO BẠN"}</span><h1>{privateTest ? "Phòng thử riêng của bố" : "Trò chuyện cùng INSPIRE"}</h1></div>
          <span className="ip-mode"><span /> {apiMode ? "ChatGPT · Chưa gửi tới AI" : privateTest ? "Mô phỏng · Chưa dùng AI" : "Bản thử nghiệm · Mô phỏng"}</span>
        </div>
        {privateTest && !current.messages.length && <div className="ip-private-intro">
          <p>Bố cứ hỏi bằng tiếng Việt, hỏi tiếp hoặc đính chính điều vừa nói. Chỉ dùng tình huống giả định.</p>
          <p>{apiMode ? "Bố có thể nhập câu hỏi giả định để chuẩn bị. Chưa mở phản hồi từ AI." : "Mô phỏng chỉ để thử giao diện, chưa đánh giá nội dung AI."}</p>
          {privateError && <p role="alert">{privateError}</p>}
        </div>}
        {prototypeEnabled && (!privateTest || privateReady) && (privateTest ?
          <details className="ip-private-setup"><summary>Dành cho con · Thiết lập và tài khoản</summary><InspireAccountPanel onIdentity={onIdentity} />
            <div className="ip-private-modes" aria-label="Chế độ thử"><button aria-pressed={!apiMode} onClick={() => setApiMode(false)}>Mô phỏng</button><button disabled={!apiReady} aria-pressed={apiMode} onClick={() => setApiMode(true)} title="Chỉ chuẩn bị nội dung; chưa gọi mô hình.">{apiReady ? "ChatGPT · Xem trước" : "Luna · Chưa bật"}</button></div>
            <p>Đường ưu tiên: đăng nhập ChatGPT. Chưa gửi tới mô hình; chưa xác minh chi phí. Mô phỏng vẫn dùng Controller hiện có.</p>
            {knowledgeTrace != null && (knowledgeTrace as {conversationId?: string}).conversationId === current.id && <details><summary>Nguồn được chọn và đầu vào mô hình (chưa gửi)</summary><pre>{JSON.stringify(knowledgeTrace, null, 2)}</pre></details>}
            {apiMode && apiPreview && apiPreview.operationId === current.pending?.request?.operationId && apiPreview.conversationId === current.id && <div className="ip-api-preview">
              <h2>Nội dung chính xác dự kiến gửi OpenAI</h2>
              <p>Chưa gửi. Đề xuất tối đa ba lần thử; lần lỗi hoặc chưa rõ kết quả vẫn tính lượt. Chưa xác minh được giới hạn cứng 512 token và việc tắt thử lại của ChatGPT. {apiPreview.sourceCount} đoạn nguồn đủ quyền xuất.</p>
              <p>Chỉ dùng đường đăng nhập ChatGPT, không chuyển sang khóa API. Chưa xác minh điều kiện không phát sinh phí. Mã lượt và mã nội dung được lưu riêng trên máy; nội dung trò chuyện chỉ ở bộ nhớ.</p>
              <pre>{JSON.stringify({controls: apiPreview.controls, accounting: apiPreview.accounting}, null, 2)}</pre>
              <pre>{JSON.stringify(apiPreview.payload, null, 2)}</pre>
              <p>Mã nội dung: <code>{apiPreview.payloadSHA}</code></p>
              <p>Mã lượt duyệt: <code>{apiPreview.binding}</code></p>
              <p>Đây chỉ là đánh giá riêng. Controller vẫn giữ quyền thực thi và đưa ra công chúng ở trạng thái đóng. Sau khi nhận kết quả, dừng lượt thử.</p>
            </div>}
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
            <div className="ip-memory"><Icon name="leaf" size={25} /><p>Chỉ giữ trong phiên này.</p><p>Tải lại hoặc rời trang sẽ xóa các cuộc trò chuyện khỏi giao diện. Bản thử nghiệm không lưu lịch sử vào thiết bị.</p></div>
            <Link className="ip-human" to="/tham-van-tam-ly">Khi bạn muốn gặp một người thật <Icon name="arrow" size={20} /></Link>
          </aside>
          <section className="ip-chat" aria-label="Không gian trò chuyện">
            <header className="ip-chat-heading">
              <div className="ip-assistant-mark"><Icon name="leaf" size={26} /></div>
              <div><strong>INSPIRE</strong><span>Chậm lại một chút. Bắt đầu từ điều bạn muốn.</span></div>
              <button className="ip-mobile-toggle" aria-expanded={showConversations} onClick={() => setShowConversations(!showConversations)} aria-label="Danh sách cuộc trò chuyện"><Icon name="message" /></button>
            </header>
            <div className="ip-disclosure"><Icon name="spark" size={20} /><p>{apiMode ? "ChatGPT · Bản nháp chỉ để đánh giá riêng, chưa được kiểm định. Chưa tự gửi hoặc tự thử lại." : privateTest ? "Mô phỏng · Chưa dùng AI. Nhận xét chỉ giữ trong phiên này." : available ? "Bạn đang trải nghiệm mô phỏng cục bộ có xác thực và hạn mức, chưa kết nối mô hình AI. Chỉ dùng nội dung giả định." : prototypeEnabled ? "Đang chờ kết nối danh tính khách hoặc tài khoản với trình mô phỏng cục bộ. Mô hình AI chưa được bật." : "Bản xem trước đang đóng kết nối. Chạy ứng dụng cục bộ để trải nghiệm mô phỏng; mô hình AI chưa được bật."}</p></div>
            <div ref={timeline} className="ip-timeline" role="log" aria-label="Nội dung trò chuyện" aria-live="polite" aria-relevant="additions">
              {!current.messages.length && <div className="ip-welcome">
                <div className="ip-welcome-leaf"><Icon name="garden" size={44} /></div>
                <span className="ip-kicker">CHÀO BẠN, MÌNH LÀ INSPIRE</span>
                <h2>{privateTest ? <>Bố muốn hỏi<br />điều gì hôm nay?</> : <>Một ý nghĩ nhỏ cũng<br />là một khởi đầu.</>}</h2>
                <p>{privateTest ? "Gõ câu hỏi vào ô bên dưới rồi bấm Gửi. Bố có thể hỏi theo cách tự nhiên của mình." : "Bạn muốn viết, lên ý tưởng hay chỉ cùng nhìn lại một điều? Cứ bắt đầu bằng cách của bạn."}</p>
                {!privateTest && <div className="ip-starters">{starters.map((text) => <button key={text} disabled={!available} onClick={() => { store.draft(current.id, text); composer.current?.focus() }}>{text}<Icon name="arrow" size={19} /></button>)}</div>}
              </div>}
              {current.messages.map((m) => <article key={m.id} className={`ip-message ip-message-${m.role}`} data-message-role={m.role}>
                <div className="ip-message-label">{m.role === "user" ? "Bạn" : <><Icon name="leaf" size={18} /> INSPIRE <span>· {apiMode ? "ChatGPT · Đánh giá riêng" : "Mô phỏng"}</span></>}</div>
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
              {current.status === "sending" && <p className="ip-loading" role="status"><span className="ip-loading-dot" /> {apiMode ? "Đang xử lý lượt thử riêng…" : "Đang chuẩn bị phản hồi mô phỏng…"}</p>}
              {current.error && <div className="ip-error" role="alert"><p>{current.error.message}</p>
                {current.status === "error" && current.error.retry !== "none" && <button onClick={() => void store.retry(current.id)}>{apiMode && current.error.code === "AUTHORIZATION_REQUIRED" ? "Kiểm tra quyền và gửi lượt này" : current.error.retry === "new-attempt" ? "Thử lại bằng lượt mới" : "Kiểm tra lại lượt gửi"}<Icon name="arrow" size={18} /></button>}
                {current.error.retry === "none" && <button onClick={() => store.newConversation()}>Mở cuộc trò chuyện mới <Icon name="arrow" size={18} /></button>}
              </div>}
            </div>
            <div className="ip-composer-area">
              {correction && <div className="ip-correcting"><p><strong>Đính chính, giữ nguyên bản gốc</strong><span>“{correction.text}”</span></p><button onClick={() => store.correct(current.id)} aria-label="Hủy đính chính">Hủy</button></div>}
              <form className="ip-composer" onSubmit={submit}>
                <label className="ip-sr" htmlFor="inspire-message">Tin nhắn cho INSPIRE</label>
                <textarea id="inspire-message" ref={composer} value={current.draft} disabled={locked}
                  onChange={(event) => store.draft(current.id, event.target.value)} onKeyDown={keyDown}
                  maxLength={CHAT_LIMITS.message} rows={2} placeholder={correction ? "Điều bạn muốn đính chính…" : "Viết điều bạn muốn chia sẻ…"} />
                <div className="ip-composer-bottom"><span>{current.draft.length.toLocaleString("vi-VN")} / 2.000</span><button type="submit" disabled={locked || !current.draft.trim()}>Gửi <Icon name="arrow" size={21} /></button></div>
              </form>
              <p className="ip-footnote">{privateTest ? "Chỉ dùng tình huống giả định." : "Enter để gửi · Shift + Enter để xuống dòng. INSPIRE không thay thế chuyên gia."}</p>
            </div>
          </section>
        </div>
        <p className="ip-bottom-note">Lịch sử{privateTest ? " và nhận xét" : ""} chỉ ở trong phiên này. Tải lại hoặc rời trang sẽ xóa các cuộc trò chuyện khỏi giao diện.</p>
      </main>
    </div>
  )
}
