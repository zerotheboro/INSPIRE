import {randomUUID} from "node:crypto";
import {
  ChatError, validateRequest, validateResponse,
} from "./inspireChatContract";
import type {
  ChatMessage, ChatRequest, ChatResponse, ChatMode,
} from "./inspireChatContract";

type Session = {
  touched: number; owner?: string; conversations: Map<string, ChatMessage[]>;
};
type Operation = { fingerprint: string; result: Promise<ChatResponse> };
type Generator = (
  messages: readonly ChatMessage[], request?: ChatRequest
) => Promise<string>;
export type OperationHooks = {
  reserve(): Promise<void>;
  complete(response: ChatResponse): Promise<void>;
  fail(error: unknown, outputValidated: boolean): Promise<never>;
};

/**
 * Quote an explicit excerpt, preserving full history in the request.
 * @param {string} text Original text.
 * @param {number} length Display excerpt length.
 * @return {string} Quotation with an ellipsis if shortened.
 */
function excerpt(text: string, length: number): string {
  return text.length > length ? text.slice(0, length) + "…" : text;
}

// Mechanical demonstration; no fixtures, test answers or model calls.
export const simulateConversation: Generator = async (messages) => {
  const latest = messages[messages.length - 1];
  const users = messages.filter((m) => m.role === "user");
  if (latest.correctionOf) {
    const original = messages.find((m) => m.id === latest.correctionOf)!;
    return "Mình đã ghi nhận đính chính của bạn: “" +
      excerpt(latest.text, 380) + "”. Tin nhắn gốc “" +
      excerpt(original.text, 300) + "” vẫn được giữ để bạn có thể xem lại." +
      "\n\nĐây là phản hồi mô phỏng, chưa phải phản hồi từ mô hình AI.";
  }
  const context = users.length > 1 ?
    `Cuộc trò chuyện hiện có ${users.length} tin nhắn của bạn ` +
    "cùng các phản hồi trước đó, theo đúng thứ tự. " +
    "Bạn có thể tiếp tục ý vừa nói hoặc đính chính một tin nhắn cũ." :
    "Bạn có thể tiếp tục bằng một ý khác, một câu hỏi " +
    "hoặc điều bạn muốn làm rõ.";
  return "Mình đã nhận được: “" + excerpt(latest.text, 480) + "”.\n\n" +
    context + "\n\nĐây là phản hồi mô phỏng để trải nghiệm cách trò chuyện, " +
    "chưa phải phản hồi từ mô hình AI.";
};

/**
 * Create one bounded, process-local simulation with a unique restart epoch.
 * @param {Generator} generate Offline adapter, injectable for failure tests.
 * @param {function(): number} now Clock, injectable for expiry tests.
 * @param {string} mode Private evaluation mode requires separate admission.
 * @return {object} Session issuer and validated operation handler.
 */
export function createSimulationServer(
  generate: Generator = simulateConversation,
  now: () => number = Date.now,
  mode: ChatMode = "simulation",
) {
  const epoch = randomUUID();
  const sessions = new Map<string, Session>();
  const operations = new Map<string, Operation>();
  const busy = new Set<string>();
  const lifetime = 30 * 60 * 1000;
  /**
   * Issue an unpredictable reference with no client identity claims.
   * @param {string} owner Verified identity bound to this session.
   * @return {object} Simulation session and process epoch.
   */
  function session(owner?: string) {
    // Never evict an unresolved operation. Expired session replays fail closed.
    for (const [id, value] of sessions) {
      if (now() - value.touched > lifetime &&
          ![...busy].some((key) => key.startsWith(id + ":"))) {
        sessions.delete(id);
        for (const key of operations.keys()) {
          if (key.startsWith(id + ":")) operations.delete(key);
        }
      }
    }
    if (sessions.size >= 100) {
      throw new ChatError("CAPACITY",
        "Bản thử nghiệm đang bận. Vui lòng thử lại sau.", "none", 503);
    }
    const sessionId = randomUUID();
    sessions.set(sessionId, {touched: now(), owner, conversations: new Map()});
    return {epoch, sessionId, mode};
  }
  /**
   * Validate and replay exactly once within this process and session.
   * @param {unknown} input Untrusted wire request.
   * @param {string} owner Current verified caller.
   * @param {OperationHooks} hooks Durable reservation/completion callbacks.
   */
  async function handle(
    input: unknown, owner?: string, hooks?: OperationHooks,
  ): Promise<ChatResponse> {
    validateRequest(input);
    const request: ChatRequest = input;
    if (request.epoch !== epoch) {
      throw new ChatError("SESSION_LOST",
        "Máy chủ đã khởi động lại. Không thể xác định kết quả lượt trước; " +
        "hãy mở cuộc trò chuyện mới.", "none", 409);
    }
    const current = sessions.get(request.sessionId);
    if (current && current.owner !== owner) {
      throw new ChatError("IDENTITY_CHANGED",
        "Tài khoản đã thay đổi. Hãy mở cuộc trò chuyện mới.", "none", 403);
    }
    if (!current || now() - current.touched > lifetime) {
      throw new ChatError("SESSION_LOST",
        "Phiên thử nghiệm đã hết hạn. Hãy mở cuộc trò chuyện mới.",
        "none", 409);
    }
    current.touched = now();
    const key = request.sessionId + ":" + request.operationId;
    const conversationKey = request.sessionId + ":" + request.conversationId;
    const fingerprint = JSON.stringify([
      request.conversationId, request.messages,
    ]);
    const existing = operations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ChatError("OPERATION_CONFLICT",
          "Lượt gửi không khớp với nội dung ban đầu.", "none", 409);
      }
      return existing.result;
    }
    if (request.kind === "replay") {
      throw new ChatError("RESULT_UNKNOWN",
        "Không còn kết quả để xác minh. Lượt gửi này sẽ không tự chạy lại; " +
        "hãy mở cuộc trò chuyện mới.", "none", 409);
    }
    if (busy.has(conversationKey)) {
      throw new ChatError("BUSY",
        "Cuộc trò chuyện đang xử lý một lượt gửi.", "none", 409);
    }
    const history = current.conversations.get(request.conversationId) ?? [];
    if (JSON.stringify(request.messages.slice(0, -1)) !==
        JSON.stringify(history)) {
      throw new ChatError("HISTORY_MISMATCH",
        "Lịch sử không khớp với các lượt đã được xác nhận.", "none", 409);
    }
    if (operations.size >= 1000 ||
        (!history.length && current.conversations.size >= 20)) {
      throw new ChatError("CAPACITY",
        "Bản thử nghiệm đã đạt giới hạn bộ nhớ. " +
        "Hãy khởi động lại máy chủ thử nghiệm.", "none", 503);
    }
    busy.add(conversationKey);
    const result = Promise.resolve().then(async () => {
      let reserved = false;
      let outputValidated = false;
      try {
        await hooks?.reserve();
        reserved = true;
        const text = await generate(structuredClone(request.messages), request);
        const response: ChatResponse = {
          mode, epoch, sessionId: request.sessionId,
          operationId: request.operationId,
          conversationId: request.conversationId,
          replyTo: request.messages[request.messages.length - 1].id,
          message: {id: randomUUID(), role: "assistant", text},
        };
        validateResponse(response, request, mode);
        outputValidated = true;
        await hooks?.complete(response);
        current.conversations.set(request.conversationId,
          [...request.messages, response.message]);
        return response;
      } catch (error) {
        if (!reserved) throw error;
        if (hooks) return hooks.fail(error, outputValidated);
        throw new ChatError("ATTEMPT_FAILED",
          "Lượt xử lý chưa tạo được phản hồi. " +
          "Bạn có thể bắt đầu một lần thử mới cho cùng tin nhắn.",
          "new-attempt", 503);
      } finally {
        busy.delete(conversationKey);
      }
    });
    operations.set(key, {fingerprint, result});
    return result;
  }
  return {session, handle, epoch};
}
