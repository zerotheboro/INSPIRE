import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {createHash} from "node:crypto";
import {validateRequest, ChatError} from "./inspireChatContract";

const TEN_MINUTES_MS = 10 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;
const TEN_MINUTE_LIMIT = 10;
const DAILY_LIMIT = 30;
const RATE_LIMIT_COLLECTION = "inspireAIRateLimits";

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Hash server-observed IP data for the shared request-rate record.
 * @param {string} ipAddress Server-observed address.
 * @return {string} Opaque record key.
 */
export function getVisitorKey(ipAddress: string): string {
  return createHash("sha256")
    .update(ipAddress)
    .digest("hex");
}

/**
 * Atomically enforce the existing rolling IP request limits.
 * @param {string} visitorKey Hashed server-observed address.
 * @param {number} now Server time in milliseconds.
 * @return {Promise<RateLimitResult>} Admission or retry interval.
 */
export async function checkRateLimit(
  visitorKey: string,
  now: number
): Promise<RateLimitResult> {
  const firestore = getFirestore();
  const rateLimitRef = firestore
    .collection(RATE_LIMIT_COLLECTION)
    .doc(visitorKey);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateLimitRef);
    const storedAttempts = snapshot.data()?.attempts;

    const recentAttempts = Array.isArray(storedAttempts) ?
      storedAttempts
        .filter(
          (attempt): attempt is number =>
            typeof attempt === "number" &&
            Number.isFinite(attempt) &&
            attempt > now - TWENTY_FOUR_HOURS_MS &&
            attempt <= now
        )
        .sort((first, second) => first - second) :
      [];

    const tenMinuteAttempts = recentAttempts.filter(
      (attempt) => attempt > now - TEN_MINUTES_MS
    );

    const retryTimes: number[] = [];

    if (tenMinuteAttempts.length >= TEN_MINUTE_LIMIT) {
      retryTimes.push(
        tenMinuteAttempts[0] + TEN_MINUTES_MS
      );
    }

    if (recentAttempts.length >= DAILY_LIMIT) {
      retryTimes.push(
        recentAttempts[0] + TWENTY_FOUR_HOURS_MS
      );
    }

    if (retryTimes.length > 0) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Math.max(...retryTimes) - now) / 1_000)
      );

      return {
        allowed: false,
        retryAfterSeconds,
      };
    }

    transaction.set(rateLimitRef, {
      attempts: [...recentAttempts, now],
      updatedAt: Timestamp.fromMillis(now),
    });

    return {allowed: true};
  });
}

/**
 * Keep model access closed until integration is explicitly authorized.
 * @return {boolean} Always false; there is no configuration bypass.
 */
function liveModelAuthorized(): boolean {
  return false;
}

export const inspireAI = onCall(
  {
    region: "asia-southeast1",
    invoker: "public",
    cors: true,
  },
  async (request) => {
    // The live callable is closed until authorization and controller controls
    // are connected and tested. Never fall back to a single-prompt model call.
    try {
      validateRequest(request.data);
    } catch (error) {
      throw new HttpsError("invalid-argument", error instanceof ChatError ?
        error.message : "Yêu cầu không hợp lệ.");
    }

    if (!liveModelAuthorized()) {
      throw new HttpsError("failed-precondition",
        "Kết nối mô hình AI chưa được bật. Bản mô phỏng chỉ chạy cục bộ.");
    }

    const clientIp =
      request.rawRequest.ip ||
      request.rawRequest.socket.remoteAddress;

    if (!clientIp) {
      throw new HttpsError(
        "unavailable",
        "Không thể xác minh yêu cầu lúc này. Vui lòng thử lại."
      );
    }

    let rateLimit: RateLimitResult;

    try {
      rateLimit = await checkRateLimit(
        getVisitorKey(clientIp),
        Date.now()
      );
    } catch (error) {
      console.error("AI rate-limit check failed", {
        errorName:
          error instanceof Error ? error.name : "UnknownError",
      });

      throw new HttpsError(
        "unavailable",
        "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại."
      );
    }

    if (!rateLimit.allowed) {
      throw new HttpsError(
        "resource-exhausted",
        "Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau.",
        {
          code: "RATE_LIMITED",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        }
      );
    }

    // Keep the shared Firestore limits above intact for a future authorized
    // adapter. No provider implementation or key is loaded by this callable.
    throw new HttpsError("failed-precondition",
      "Chưa có bộ kết nối mô hình được phê duyệt.");
  }
);
