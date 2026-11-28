// Shared wire contract. Conversation text is data, never system instructions.
export const CHAT_LIMITS = {
  message: 2000, messages: 31, context: 24000,
} as const;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  correctionOf?: string;
};
export type ChatRequest = {
  kind: "send" | "replay";
  epoch: string;
  sessionId: string;
  operationId: string;
  conversationId: string;
  messages: ChatMessage[];
};
export type ChatMode = "simulation" | "private-model";
export type ChatResponse = {
  mode: ChatMode;
  epoch: string;
  sessionId: string;
  operationId: string;
  conversationId: string;
  replyTo: string;
  message: ChatMessage;
};
export type RetryKind = "replay" | "new-attempt" | "none";
/** A display-safe failure, separate from assistant conversation text. */
export class ChatError extends Error {
  /**
   * Construct a failure with a machine-readable retry policy.
   * @param {string} code Public failure identifier.
   * @param {string} message Display-safe Vietnamese explanation.
   * @param {RetryKind} retry Explicit replay/new-attempt policy.
   * @param {number} status HTTP status.
   * @param {unknown} cause Internal non-serialized diagnostic cause.
   */
  constructor(
    public code: string,
    message: string,
    public retry: RetryKind = "none",
    public status = 400,
    cause?: unknown,
  ) {
    super(message);
    // Internal debugging only; never part of the callable/browser JSON.
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {value: cause});
    }
  }
}

/**
 * Narrow a JSON object without accepting null or arrays.
 * @param {unknown} value Untrusted value.
 * @return {boolean} Whether the value is an object.
 */
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/**
 * Reject all unsupported fields, including client authority metadata.
 * @param {object} value Untrusted object.
 * @param {string[]} keys Allowed field names.
 */
export function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ChatError("INVALID_REQUEST",
      "Yêu cầu chứa trường không được hỗ trợ.");
  }
}
/**
 * IDs are opaque references and never confer permissions.
 * @param {unknown} value Untrusted reference.
 * @return {boolean} Whether the reference has valid syntax.
 */
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
/**
 * Validate complete ordered history; never shorten or rewrite client text.
 * @param {unknown} value Full untrusted history.
 */
export function validateMessages(
  value: unknown,
): asserts value is ChatMessage[] {
  if (!Array.isArray(value) || !value.length ||
      value.length > CHAT_LIMITS.messages) {
    throw new ChatError("CONTEXT_LIMIT",
      "Cuộc trò chuyện đã đạt giới hạn. Hãy mở cuộc trò chuyện mới.");
  }
  const seen = new Map<string, ChatMessage>();
  let length = 0;
  value.forEach((item, index) => {
    if (!record(item)) {
      throw new ChatError("INVALID_REQUEST", "Tin nhắn không hợp lệ.");
    }
    exactKeys(item, ["id", "role", "text", "correctionOf"]);
    if (!identifier(item.id) || seen.has(item.id) ||
        item.role !== (index % 2 === 0 ? "user" : "assistant") ||
        typeof item.text !== "string" || !item.text.trim() ||
        item.text.length > CHAT_LIMITS.message) {
      throw new ChatError("INVALID_REQUEST",
        "Vai trò, thứ tự hoặc nội dung tin nhắn không hợp lệ " +
        "(tối đa 2.000 ký tự).");
    }
    if ("correctionOf" in item &&
        (item.role !== "user" || !identifier(item.correctionOf) ||
        seen.get(item.correctionOf)?.role !== "user")) {
      throw new ChatError("INVALID_CORRECTION",
        "Chỉ có thể đính chính một tin nhắn của bạn đã gửi trước đó.");
    }
    length += item.text.length;
    seen.set(item.id, item as ChatMessage);
  });
  if (value.length % 2 !== 1) {
    throw new ChatError("INVALID_REQUEST", "Thiếu tin nhắn cần phản hồi.");
  }
  if (length > CHAT_LIMITS.context) {
    throw new ChatError("CONTEXT_LIMIT",
      "Nội dung đã vượt giới hạn của bản thử nghiệm. " +
      "Hãy mở cuộc trò chuyện mới.");
  }
}
/**
 * Enforce the allowlisted request contract before any adapter runs.
 * @param {unknown} value Untrusted request envelope.
 */
export function validateRequest(value: unknown): asserts value is ChatRequest {
  if (!record(value)) {
    throw new ChatError("INVALID_REQUEST", "Yêu cầu không hợp lệ.");
  }
  exactKeys(value, ["kind", "epoch", "sessionId", "operationId",
    "conversationId", "messages"]);
  if ((value.kind !== "send" && value.kind !== "replay") ||
      ![value.epoch, value.sessionId, value.operationId,
        value.conversationId].every(identifier)) {
    throw new ChatError("INVALID_REQUEST", "Thông tin lượt gửi không hợp lệ.");
  }
  validateMessages(value.messages);
}
/**
 * Bind output to the exact session, operation, conversation and user turn.
 * @param {unknown} value Untrusted adapter or transport output.
 * @param {ChatRequest} request Original request.
 * @param {string} mode Exact server-issued transport mode.
 * @return {void} Throw on any mismatch.
 */
export function validateResponse(
  value: unknown, request: ChatRequest, mode: ChatMode = "simulation",
): asserts value is ChatResponse {
  const fail = () => {
    throw new ChatError("INVALID_RESPONSE",
      "Không xác minh được phản hồi cho lượt gửi này.", "replay", 502);
  };
  if (!record(value)) return fail();
  try {
    exactKeys(value, ["mode", "epoch", "sessionId", "operationId",
      "conversationId", "replyTo", "message"]);
  } catch {
    return fail();
  }
  if (value.mode !== mode || value.epoch !== request.epoch ||
      value.sessionId !== request.sessionId ||
      value.operationId !== request.operationId ||
      value.conversationId !== request.conversationId ||
      value.replyTo !== request.messages[request.messages.length - 1]?.id ||
      !record(value.message)) return fail();
  const message = value.message;
  try {
    exactKeys(message, ["id", "role", "text"]);
  } catch {
    return fail();
  }
  if (!identifier(message.id) ||
      request.messages.some((m) => m.id === message.id) ||
      message.role !== "assistant" || typeof message.text !== "string" ||
      !message.text.trim() ||
      message.text.length > CHAT_LIMITS.message) return fail();
}
