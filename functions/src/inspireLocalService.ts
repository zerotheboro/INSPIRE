import {getApps, initializeApp} from "firebase-admin/app";
import {AccountService, verifiedIdentity} from "./inspireAccount";
import type {Identity} from "./inspireAccount";
import {createSimulationServer} from "./inspireChatSimulation";
import {createController040Adapter} from "./inspireController040";
import {ChatError, validateRequest} from "./inspireChatContract";
import type {ChatRequest} from "./inspireChatContract";
import {
  ConfirmedNoReply, coreInstructions, retrieveKnowledge,
} from "./inspireKnowledge";
import type {ModelAdapter, ModelContext} from "./inspireKnowledge";
import {checkRateLimit, getVisitorKey} from "./inspireAI";

/** Require exact demo endpoints before initializing any Admin client. */
export function requireLocalEmulators() {
  if (process.env.NODE_ENV === "production") {
    throw new ChatError("PRODUCTION_CLOSED",
      "Kết nối mô phỏng không được mở trong môi trường production.",
      "none", 503);
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
    throw new ChatError("EMULATORS_REQUIRED",
      "Cần chạy trình mô phỏng Auth và Firestore cục bộ. " +
      "Không kết nối dữ liệu thật.", "none", 503);
  }
  process.env.METADATA_SERVER_DETECTION = "none";
  const existing = getApps().find((app) => app.name === "[DEFAULT]");
  if (existing && existing.options.projectId !== "demo-inspire") {
    throw new ChatError("DEMO_ONLY",
      "Chỉ được chạy với dự án demo-inspire cục bộ.", "none", 503);
  }
  if (!existing) initializeApp({projectId: "demo-inspire"});
}
/**
 * Construct only the local offline service; model adapters fail closed.
 * @param {ModelAdapter} adapter Offline substitute; no model permission.
 * @param {function(): number} now Server clock, injectable in tests.
 * @param {Function} rateCheck Shared limiter, injectable in quota tests.
 * @param {boolean} privateEvaluation Explicit local research facade only.
 * @return {object} Authenticated local service facade.
 */
export function createLocalService(
  adapter: ModelAdapter = createController040Adapter(),
  now: () => number = Date.now,
  rateCheck = async (ip: string) => checkRateLimit(getVisitorKey(ip), now()),
  privateEvaluation = false,
) {
  requireLocalEmulators();
  if (adapter.mode !== "simulation" && !privateEvaluation) {
    throw new Error(
      "Controller model access is closed in this offline service.");
  }
  const accounts = new AccountService(now);
  const identities = new WeakMap<ChatRequest, Identity>();
  const engine = createSimulationServer(async (messages, request) => {
    const identity = identities.get(request!)!;
    const account = await accounts.account(identity);
    const context: ModelContext = {
      operatingInstructions: coreInstructions,
      messages, userStatedPreferences: account.preferences,
      supportingKnowledge: await retrieveKnowledge(messages, privateEvaluation),
    };
    return adapter.reply(context, request);
  }, now, privateEvaluation ? "private-model" : "simulation");
  return {
    accounts, verify: verifiedIdentity,
    close: () => adapter.close?.(),
    session(identity: Identity) {
      return engine.session(identity.uid);
    },
    async handle(input: unknown, identity: Identity, ip: string) {
      validateRequest(input);
      const request: ChatRequest = input;
      identities.set(request, identity);
      return engine.handle(request, identity.uid, {
        async reserve() {
          const rate = await rateCheck(ip);
          if (!rate.allowed) {
            throw new ChatError("RATE_LIMITED",
              "Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.",
              "new-attempt", 429);
          }
          await accounts.reserve(identity, request);
        },
        async complete() {
          await accounts.settle(identity, request.operationId, "completed");
        },
        async fail(error, outputValidated): Promise<never> {
          if (error instanceof ConfirmedNoReply && !outputValidated) {
            await accounts.settle(identity, request.operationId, "failed");
            throw new ChatError("ATTEMPT_FAILED",
              "Lượt này chưa tạo phản hồi và đã được trả lại. " +
              "Bạn có thể thử bằng lượt mới.", "new-attempt", 503);
          }
          try {
            await accounts.settle(identity, request.operationId, "unknown");
          } catch {/* Leave the durable reservation pending. */}
          throw new ChatError("OUTCOME_UNKNOWN",
            "Kết quả chưa thể xác minh. Lượt được giữ chờ đối soát; " +
            "không tự chạy lại hoặc hoàn lượt.", "none", 409);
        },
      });
    },
  };
}
