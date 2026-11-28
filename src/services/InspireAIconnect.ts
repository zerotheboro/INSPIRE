import { ChatError, record, validateRequest, validateResponse } from "../../functions/src/inspireChatContract"
import type { ChatRequest, ChatResponse, ChatMode } from "../../functions/src/inspireChatContract"

export type ChatSession = { epoch: string; sessionId: string; mode: ChatMode }
export interface ChatTransport {
  connect(): Promise<ChatSession>
  send(request: ChatRequest): Promise<ChatResponse>
  prepareApproved?(): Promise<{request: ChatRequest; preview: LunaPreview}>
  diagnostics?(): Promise<unknown>
  recoverUnsent?(request: ChatRequest): Promise<ChatRequest>
}

export type LunaPreview = { payloadSHA: string; binding: string; operationId: string; conversationId: string; reservedNanoUSD?: number; inputTokenBound?: number; sourceCount: number; keyConfigured?: boolean; ownerAuthorized?: boolean; executionAvailable?: boolean; controls?: unknown; accounting?: unknown}
export function createDisconnectedPrivateTransport(): ChatTransport {
  const unavailable = async () => { throw new ChatError('PRIVATE_DISCONNECTED', 'Không kết nối được INSPIRE AI riêng. Chưa gửi tin tới mô hình.', 'none', 503) }
  return {connect: unavailable, send: unavailable}
}
// Sending first prepares a preview. Only a later manual action can request the
// already-reviewed operation; authorization is checked on the server.
export function createPrivateLunaTransport(preview: (value: LunaPreview) => void,
  fetcher: typeof fetch = fetch, token: () => Promise<string>, changed?: () => void, route: 'api' | 'chatgpt' = 'api',
  timing: {authentication?: number; http?: number; conversation?: boolean;
    diagnostic?: (value: unknown) => void} = {}): ChatTransport {
  const prepared = new Set<string>()
  const unauthenticatedPreviews = new Set<string>()
  async function call(body: unknown): Promise<unknown> {
    const serialized = JSON.stringify(body)
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let authTimer: ReturnType<typeof setTimeout> | undefined
    try {
      let bearer: string
      try {
        bearer = await Promise.race([token(), new Promise<never>((_resolve, reject) => {
          authTimer = setTimeout(() => reject(new ChatError('AUTH_TOKEN_TIMEOUT', 'Lấy token Firebase quá thời gian. Chưa gửi HTTP tới backend AI.', 'replay', 401)), timing.authentication ?? 20000)
        })])
      } catch (error) {
        if (error instanceof ChatError) throw error
        throw new ChatError('AUTH_TOKEN_FAILED', 'Firebase SDK chưa cung cấp được token hiện hành. Chưa gửi HTTP tới backend AI.', 'replay', 401)
      }
      clearTimeout(authTimer)
      // The HTTP deadline begins after SDK authentication, not before it.
      timer = setTimeout(() => abort.abort(), timing.http ?? 95000)
      const response = await fetcher(route === 'chatgpt' ? '/api/inspire-chatgpt' : '/api/inspire-luna', {method: 'POST', cache: 'no-store', signal: abort.signal,
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`}, body: serialized})
      let data: unknown
      try { data = await response.json() }
      catch (error) {
        if (abort.signal.aborted) throw error
        throw new ChatError('INVALID_HTTP_RESPONSE', 'Backend trả nội dung không phải JSON hợp lệ. Chưa xác minh được kết quả; không tự gửi lại.', 'none', 502)
      }
      if (!response.ok) {
        if (record(data) && record(data.error) && typeof data.error.code === 'string' && typeof data.error.message === 'string' && ['replay','new-attempt','none'].includes(String(data.error.retry))) {
          // This local 401 precedes handlePrivate/provider dispatch. A manual
          // replay may refresh authentication; it never creates a new attempt.
          if (response.status === 401 && data.error.code === 'UNAUTHENTICATED') throw new ChatError('UNAUTHENTICATED', 'Xác thực đã hết hạn. Bạn có thể kiểm tra lại đúng lượt gửi; chưa gọi thêm AI.', 'replay', 401)
          throw new ChatError(data.error.code, data.error.message, data.error.retry as 'replay'|'new-attempt'|'none', response.status)
        }
        throw Error()
      }
      return data
    } catch (error) {
      if (error instanceof ChatError) throw error
      if (abort.signal.aborted) throw new ChatError('HTTP_TIMEOUT', 'HTTP tới backend quá thời gian. Chưa xác định kết quả; chỉ kiểm tra lại đúng operation, không tạo attempt mới.', 'replay', 504)
      throw new ChatError('CONNECTION', 'Kết nối gián đoạn. Chỉ kiểm tra lại đúng lượt gửi; không tự tạo lượt mới.', 'replay', 503)
    } finally { clearTimeout(authTimer); clearTimeout(timer); changed?.() }
  }
  return {
    diagnostics: () => call({kind:'budget-status'}),
    async recoverUnsent(request) {
      const data = await call({kind:'recover-unsent',request})
      if (!record(data) || data.notDispatched !== true) throw new ChatError('RESULT_UNKNOWN','Chưa chứng minh được lượt này chưa gửi. Không gọi lại AI.','none',409)
      validateRequest(data.request)
      const recovered = data.request
      if (recovered.operationId !== request.operationId || recovered.conversationId !== request.conversationId || JSON.stringify(recovered.messages) !== JSON.stringify(request.messages)) throw new ChatError('RECOVERY_BINDING','Nội dung phục hồi không khớp.','none',409)
      return recovered
    },
    async prepareApproved() {
      if (route !== 'api') throw new ChatError('OWNER_ROUTE_CLOSED', 'Attempt này chỉ dùng đường API đã được chọn.', 'none', 403)
      const data = await call({kind:'owner-preview'})
      if (!record(data) || data.previewOnly !== true || data.ownerAuthorized !== true || data.executionAvailable !== true ||
          typeof data.payloadSHA !== 'string' || typeof data.binding !== 'string' || typeof data.reservedNanoUSD !== 'number' || data.sourceCount !== 3) throw new ChatError('PREVIEW_INVALID', 'Chưa xác minh được preview đã được Chủ hệ cho phép.')
      validateRequest(data.ownerRequest)
      if (data.operationId !== data.ownerRequest.operationId || data.conversationId !== data.ownerRequest.conversationId) throw new ChatError('PREVIEW_INVALID', 'Preview không khớp identity của request.')
      preview(data as unknown as LunaPreview)
      return {request:data.ownerRequest, preview:data as unknown as LunaPreview}
    },
    async connect() {
      const data = await call({kind:'session'})
      if (!record(data) || data.mode !== 'private-model' || typeof data.epoch !== 'string' || typeof data.sessionId !== 'string') throw new ChatError('INVALID_SESSION','Phiên thử riêng chưa hợp lệ.')
      if (timing.conversation) timing.diagnostic?.({budget:data.budget})
      return data as ChatSession
    },
    async send(request) {
      if (timing.conversation) {
        const packet = await call({kind:'conversation',request})
        const response = record(packet) && 'response' in packet ? packet.response : packet
        validateResponse(response,request,'private-model')
        timing.diagnostic?.(record(packet) ? packet.diagnostics : null)
        return response
      }
      if (request.kind === 'send' || unauthenticatedPreviews.has(request.operationId) || (route === 'chatgpt' && !prepared.has(request.operationId))) {
        let data: unknown
        unauthenticatedPreviews.delete(request.operationId)
        try { data = await call({kind:'preview',request: {...request, kind: 'send'}}) }
        catch (error) {
          if (error instanceof ChatError && error.status === 401 && ['UNAUTHENTICATED', 'AUTH_REFRESH_FAILED', 'AUTH_TOKEN_TIMEOUT', 'AUTH_TOKEN_FAILED'].includes(error.code)) unauthenticatedPreviews.add(request.operationId)
          throw error
        }
        if (!record(data) || data.previewOnly !== true || typeof data.payloadSHA !== 'string' || typeof data.binding !== 'string' || (route === 'api' && typeof data.reservedNanoUSD !== 'number') || data.operationId !== request.operationId || data.conversationId !== request.conversationId) throw new ChatError('PREVIEW_INVALID','Chưa xác minh được bản xem trước.')
        preview(data as unknown as LunaPreview)
        if (route === 'chatgpt') {
          if (data.executionAvailable !== true) throw new ChatError('CHATGPT_DISPATCH_BLOCKED','Đã chuẩn bị nội dung, chưa gửi tới ChatGPT. Chưa mở phiên tạo câu trả lời thật.', 'none', 403)
          if (request.kind === 'replay') throw new ChatError('PREVIEW_RECOVERED','Đã tìm lại bản chuẩn bị; chưa tạo phản hồi. Lượt kiểm tra lại không tự gọi mô hình.', 'none', 409)
          prepared.add(request.operationId)
        } else throw new ChatError('AUTHORIZATION_REQUIRED','Đã chuẩn bị nội dung. Chưa gửi tới mô hình; chờ con duyệt chi phí và nội dung.', 'replay', 403)
      }
      const data = await call({kind:'execute',request})
      validateResponse(data,request,'private-model')
      return data
    },
  }
}

export function createPrivateConversationTransport(diagnostic: (value: unknown) => void,
  fetcher: typeof fetch = fetch, token: () => Promise<string>, changed?: () => void): ChatTransport {
  return createPrivateLunaTransport(()=>{},fetcher,token,changed,'api',{conversation:true,diagnostic})
}

// Preferred connection has no API fallback or billing switch. The server must
// separately release execution; the browser cannot authorize it.
export function createPrivateChatgptTransport(preview: (value: LunaPreview) => void,
  fetcher: typeof fetch = fetch, token: () => Promise<string>, changed?: () => void): ChatTransport {
  return createPrivateLunaTransport(preview, fetcher, token, changed, 'chatgpt')
}

// Only the local Vite simulation endpoint is connected. No Firebase/model fallback.
export function createSimulationTransport(fetcher: typeof fetch = fetch, token?: () => Promise<string>, changed?: () => void, diagnostic?: (value: unknown) => void): ChatTransport {
  async function call(payload: unknown): Promise<unknown> {
    const serialized = JSON.stringify(payload)
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 12000)
    try {
      const response = await fetcher("/api/inspire-prototype", {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${await token()}`} : {}) },
        body: serialized, signal: abort.signal, cache: "no-store",
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        if (record(data) && record(data.error) && typeof data.error.message === "string" &&
            typeof data.error.code === "string" && ["replay", "new-attempt", "none"].includes(String(data.error.retry))) {
          if (response.status === 401 && data.error.code === "UNAUTHENTICATED") throw new ChatError("UNAUTHENTICATED", "Xác thực đã hết hạn. Bạn có thể kiểm tra lại đúng lượt gửi; chưa gọi thêm AI.", "replay", 401)
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
