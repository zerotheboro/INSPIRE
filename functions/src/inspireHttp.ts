import {TextDecoder} from "node:util";
import {ChatError} from "./inspireChatContract";

/**
 * Read original request bytes and decode once; never repair invalid UTF-8.
 * @param {AsyncIterable<Uint8Array>} chunks Raw IncomingMessage byte chunks.
 * @return {Promise<unknown>} Parsed JSON without text normalization.
 */
export async function readChatJson(
  chunks: AsyncIterable<Uint8Array>,
): Promise<unknown> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.byteLength;
    if (size > 128000) {
      throw new ChatError("BODY_LIMIT", "Yêu cầu quá lớn.", "none", 413);
    }
    parts.push(Buffer.from(chunk));
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true})
      .decode(Buffer.concat(parts, size));
  } catch {
    throw new ChatError("INVALID_UTF8", "Yêu cầu phải dùng UTF-8 hợp lệ.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ChatError("INVALID_JSON", "Yêu cầu JSON không hợp lệ.");
  }
}
