import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

type InspireAIRequest = {
  message: string;
};

type InspireAIResponse = {
  answer: string;
};

const inspireAICall =
  httpsCallable<
    InspireAIRequest,
    InspireAIResponse
  >(
    functions,
    "inspireAI"
  );

export async function askInspireAI(
  message: string
): Promise<string> {

  const result =
    await inspireAICall({
      message
    });

  return result.data.answer;
}