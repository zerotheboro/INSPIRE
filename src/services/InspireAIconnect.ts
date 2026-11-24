import { ChatError, record, validateResponse } from "../../functions/src/inspireChatContract"
import type { ChatRequest, ChatResponse, ChatMode } from "../../functions/src/inspireChatContract"

export type ChatSession = { epoch: string; sessionId: string; mode: ChatMode }
export interface ChatTransport {
  connect(): Promise<ChatSession>
  send(request: ChatRequest): Promise<ChatResponse>
}

export type LunaPreview = {payload: unknown; payloadSHA: string; binding: string; operationId: string; conversationId: string; reservedNanoUSD?: number; inputTokenBound?: number; sourceCount: number; keyConfigured?: boolean; controls?: unknown; accounting?: unknown}
// Sending first prepares a preview. Only a later manual action can request the
// already-reviewed operation; authorization is checked on the server.
export function createPrivateLunaTransport(preview: (value: LunaPreview) => void,
  fetcher: typeof fetch = fetch, token: () => Promise<string>, changed?: () => void, route: 'api' | 'chatgpt' = 'api'): ChatTransport {
  async function call(body: unknown): Promise<unknown> {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 95000)
    try {
      const response = await fetcher(route === 'chatgpt' ? '/api/inspire-chatgpt' : '/api/inspire-luna', {method: 'POST', cache: 'no-store', signal: abort.signal,
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${await token()}`}, body: JSON.stringify(body)})
      const data: unknown = await response.json()
      if (!response.ok) {
        if (record(data) && record(data.error) && typeof data.error.code === 'string' && typeof data.error.message === 'string' && ['replay','new-attempt','none'].includes(String(data.error.retry))) {
          throw new ChatError(data.error.code, data.error.message, data.error.retry as 'replay'|'new-attempt'|'none', response.status)
        }
        throw Error()
      }
      return data
    } catch (error) {
      if (error instanceof ChatError) throw error
      throw new ChatError('CONNECTION', 'Kết nối gián đoạn. Chỉ kiểm tra lại đúng lượt gửi; không tự tạo lượt mới.', 'replay', 503)
    } finally { clearTimeout(timer); changed?.() }
  }
  return {
    async connect() {
      const data = await call({kind:'session'})
      if (!record(data) || data.mode !== 'private-model' || typeof data.epoch !== 'string' || typeof data.sessionId !== 'string') throw new ChatError('INVALID_SESSION','Phiên thử riêng chưa hợp lệ.')
      return data as ChatSession
    },
    async send(request) {
      if (request.kind === 'send') {
        const data = await call({kind:'preview',request})
        if (!record(data) || data.previewOnly !== true || typeof data.payloadSHA !== 'string' || typeof data.binding !== 'string' || (route === 'api' && typeof data.reservedNanoUSD !== 'number') || data.operationId !== request.operationId || data.conversationId !== request.conversationId) throw new ChatError('PREVIEW_INVALID','Chưa xác minh được bản xem trước.')
        preview(data as unknown as LunaPreview)
        if (route === 'chatgpt') throw new ChatError('CHATGPT_DISPATCH_BLOCKED','Đã chuẩn bị nội dung, chưa gửi tới ChatGPT. Con cần kiểm tra giới hạn và chi phí trước khi mở phiên thử.', 'none', 403)
        throw new ChatError('AUTHORIZATION_REQUIRED','Đã chuẩn bị nội dung. Chưa gửi tới mô hình; chờ con duyệt chi phí và nội dung.', 'replay', 403)
      }
      const data = await call({kind:'execute',request})
      validateResponse(data,request,'private-model')
      return data
    },
  }
}

// Preferred connection has no API fallback, execute action or billing switch.
export function createPrivateChatgptTransport(preview: (value: LunaPreview) => void,
  fetcher: typeof fetch = fetch, token: () => Promise<string>, changed?: () => void): ChatTransport {
  const transport = createPrivateLunaTransport(preview, fetcher, token, changed, 'chatgpt')
  return {...transport, async send(request) {
    // A network retry may only recover the same held preview, never dispatch.
    return transport.send({...request, kind: 'send'})
  }}
}

// Only the local Vite simulation endpoint is connected. No Firebase/model fallback.
export function createSimulationTransport(fetcher: typeof fetch = fetch, token?: () => Promise<string>, changed?: () => void, diagnostic?: (value: unknown) => void): ChatTransport {
  async function call(payload: unknown): Promise<unknown> {
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 12000)
    try {
      const response = await fetcher("/api/inspire-prototype", {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${await token()}`} : {}) },
        body: JSON.stringify(payload), signal: abort.signal, cache: "no-store",
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        if (record(data) && record(data.error) && typeof data.error.message === "string" &&
            typeof data.error.code === "string" && ["replay", "new-attempt", "none"].includes(String(data.error.retry))) {
          throw new ChatError(data.error.code, data.error.message, data.error.retry as "replay" | "new-attempt" | "none", response.status)
        }
        throw new Error("Invalid error envelope")
      }
      return data
    } catch (error) {
      if (error instanceof ChatError) throw error
      throw new ChatError("CONNECTION", "Kết nối bị gián đoạn. Chưa xác định được kết quả; bạn có thể kiểm tra lại đúng lượt gửi này.", "replay", 503)
    } finally { clearTimeout(timeout); changed?.() }
  }
  return {
    async connect() {
      const data = await call({ kind: "session" })
      if (!record(data) || data.mode !== "simulation" || typeof data.epoch !== "string" || typeof data.sessionId !== "string") {
        throw new ChatError("INVALID_SESSION", "Không xác minh được phiên thử nghiệm.")
      }
      return data as ChatSession
    },
    async send(request) {
      const packet = await call(request)
      const data = record(packet) && "response" in packet ? packet.response : packet
      validateResponse(data, request)
      diagnostic?.(record(packet) && "response" in packet ? packet.knowledge : null)
      return data
    },
  }
}
