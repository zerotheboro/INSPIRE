import { CHAT_LIMITS, ChatError, validateMessages, validateResponse } from "../../functions/src/inspireChatContract"
import type { ChatMessage, ChatRequest } from "../../functions/src/inspireChatContract"
import type { ChatSession, ChatTransport } from "./InspireAIconnect"

export type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  draft: string
  correctionOf?: string
  session?: ChatSession
  pending?: { request?: ChatRequest }
  status: "idle" | "sending" | "error"
  error?: ChatError
}
type Workspace = { activeId: string; conversations: Conversation[] }

// Pure in-memory store, owned by the mounted page; synchronous locks precede I/O.
export class ConversationStore {
  private listeners = new Set<() => void>()
  private state: Workspace
  private preparingApproved = false
  constructor(private transport: ChatTransport, private id = () => crypto.randomUUID()) {
    const first = this.makeConversation()
    this.state = { activeId: first.id, conversations: [first] }
  }
  private makeConversation(): Conversation {
    return { id: this.id(), title: "Cuộc trò chuyện mới", messages: [], draft: "", status: "idle" }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(id: string, change: Partial<Conversation>) {
    this.state = { ...this.state, conversations: this.state.conversations.map((c) => c.id === id ? { ...c, ...change } : c) }
    this.listeners.forEach((l) => l())
  }
  private conversation(id: string) { return this.state.conversations.find((c) => c.id === id)! }
  newConversation() {
    if (this.state.conversations.length >= 20) return
    const next = this.makeConversation()
    this.state = { activeId: next.id, conversations: [...this.state.conversations, next] }
    this.listeners.forEach((l) => l())
  }
  select(id: string) {
    if (!this.state.conversations.some((c) => c.id === id)) return
    this.state = { ...this.state, activeId: id }
    this.listeners.forEach((l) => l())
  }
  draft(id: string, draft: string) { this.update(id, { draft }) }
  diagnostics() { return this.transport.diagnostics?.() ?? Promise.resolve(null) }
  correct(id: string, messageId?: string) {
    const c = this.conversation(id)
    if (c.status !== "idle") return
    if (messageId && !c.messages.some((m) => m.id === messageId && m.role === "user")) return
    this.update(id, { correctionOf: messageId })
  }
  async prepareApproved() {
    if (this.preparingApproved) return
    if (!this.transport.prepareApproved) throw new ChatError('OWNER_ROUTE_CLOSED', 'Chưa mở bước chuẩn bị attempt đã duyệt.')
    this.preparingApproved = true
    try {
      const {request} = await this.transport.prepareApproved()
      const conversation: Conversation = {id: request.conversationId, title: request.messages[0].text.slice(0,48),
        messages: structuredClone(request.messages), draft: '', status: 'error',
        session: {epoch: request.epoch, sessionId: request.sessionId, mode: 'private-model'}, pending: {request},
        error: new ChatError('OWNER_APPROVED_READY', 'Backend đã đối chiếu quyền một attempt. Chưa gọi OpenAI. Gửi bằng nút trong “Dành cho con”.', 'replay', 403)}
      const others = this.state.conversations.filter(c=>c.id !== conversation.id)
      if (others.length >= 20) throw new ChatError('CAPACITY', 'Đã đủ số cuộc trò chuyện trong bộ nhớ.')
      this.state = {activeId: conversation.id, conversations:[...others,conversation]}
      this.listeners.forEach(listener=>listener())
    } finally { this.preparingApproved = false }
  }
  async send(id: string) {
    const c = this.conversation(id)
    if (c.status !== "idle" || !c.draft.trim()) return
    const message: ChatMessage = { id: this.id(), role: "user", text: c.draft,
      ...(c.correctionOf ? { correctionOf: c.correctionOf } : {}) }
    const messages = [...c.messages, message]
    try { validateMessages(messages) } catch (e) {
      this.update(id, { error: e as ChatError }); return
    }
    this.update(id, { messages, title: c.messages.length ? c.title : c.draft.trim().slice(0, 48),
      draft: "", correctionOf: undefined, status: "sending", error: undefined, pending: {} })
    await this.execute(id, "send")
  }
  async retry(id: string) {
    const c = this.conversation(id)
    const recover = ['SESSION_IDENTITY','SESSION_LOST'].includes(c.error?.code ?? '') && !!this.transport.recoverUnsent && !!c.pending?.request
    if (c.status !== "error" || !c.pending || (c.error?.retry === "none" && !recover)) return
    if (recover) {
      this.update(id, {status:'sending',error:undefined})
      try {
        const request = await this.transport.recoverUnsent!(c.pending.request!)
        this.update(id, {pending:{request},session:{epoch:request.epoch,sessionId:request.sessionId,mode:'private-model'}})
        await this.execute(id,'send')
      } catch(error) { this.update(id,{status:'error',error:error instanceof ChatError ? error : new ChatError('RESULT_UNKNOWN','Chưa xác minh được lượt gửi. Không gọi lại AI.','none',409)}) }
      return
    }
    const kind = c.error?.retry === "new-attempt" ? "send" : "replay"
    if (kind === "send") this.update(id, { pending: {} })
    this.update(id, { status: "sending", error: undefined })
    await this.execute(id, kind)
  }
  private async execute(id: string, kind: "send" | "replay") {
    try {
      let c = this.conversation(id)
      if (!c.session) {
        const session = await this.transport.connect()
        this.update(id, { session })
        c = this.conversation(id)
      }
      const request: ChatRequest = c.pending?.request
        ? { ...c.pending.request, kind }
        : { kind: "send", epoch: c.session!.epoch, sessionId: c.session!.sessionId,
          operationId: this.id(), conversationId: id, messages: structuredClone(c.messages) }
      this.update(id, { pending: { request } })
      const response = await this.transport.send(request)
      validateResponse(response, request, c.session!.mode)
      this.update(id, { messages: [...request.messages, response.message], status: "idle", pending: undefined, error: undefined })
    } catch (error) {
      this.update(id, { status: "error", error: error instanceof ChatError ? error :
        new ChatError("CONNECTION", "Không thể kết nối. Bạn có thể kiểm tra lại lượt gửi.", "replay", 503) })
    }
  }
}

export { CHAT_LIMITS }
