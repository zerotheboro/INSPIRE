import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import OpenAI from "openai";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const MAX_MESSAGE_LENGTH = 2_000;
const TEN_MINUTES_MS = 10 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;
const TEN_MINUTE_LIMIT = 10;
const DAILY_LIMIT = 30;
const RATE_LIMIT_COLLECTION = "inspireAIRateLimits";

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function getVisitorKey(ipAddress: string): string {
  return createHash("sha256")
    .update(ipAddress)
    .digest("hex");
}

async function checkRateLimit(
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

    const recentAttempts = Array.isArray(storedAttempts)
      ? storedAttempts
        .filter(
          (attempt): attempt is number =>
            typeof attempt === "number" &&
            Number.isFinite(attempt) &&
            attempt > now - TWENTY_FOUR_HOURS_MS &&
            attempt <= now
        )
        .sort((first, second) => first - second)
      : [];

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

    return { allowed: true };
  });
}

export const inspireAI = onCall(
  {
    region: "asia-southeast1",
    secrets: [OPENAI_API_KEY],
    invoker: "public",
    cors: true,
  },
  async (request) => {
    const message = request.data?.message;

    if (typeof message !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Tin nhắn phải là văn bản."
      );
    }

    if (message.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Vui lòng nhập nội dung tin nhắn."
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `Tin nhắn không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự.`
      );
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

    try {
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY.value(),
      });

      const response = await openai.responses.create({
        model: "gpt-5.6",
        input: message.trim(),
      });

      return {
        answer: response.output_text,
      };
    } catch (error) {
      console.error("OpenAI request failed", {
        errorName:
          error instanceof Error ? error.name : "UnknownError",
        status:
          error instanceof OpenAI.APIError
            ? error.status
            : undefined,
      });

      throw new HttpsError(
        "internal",
        "AI INSPIRE hiện chưa thể phản hồi. Vui lòng thử lại."
      );
    }
  }
);
