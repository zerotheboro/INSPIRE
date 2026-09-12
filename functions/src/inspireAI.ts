import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

export const inspireAI = onCall(
  {
    region: "asia-southeast1",
    secrets: [OPENAI_API_KEY],
    invoker: "public",
    cors: true,
  },
  

  async (request) => {
    try {
      const message = request.data?.message;

      if (
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "A message is required."
        );
      }

      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY.value(),
      });

      const response = await openai.responses.create({
        model: "gpt-5.6",
        input: message,
      });

      return {
        answer: response.output_text,
      };
    } catch (error) {
      console.error("OpenAI error:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "INSPIRE AI failed to respond."
      );
    }
  }
);