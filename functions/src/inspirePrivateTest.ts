/** Local-only admission for the father's private development screen. */
import {ChatError} from "./inspireChatContract";

/**
 * Require server opt-in, loopback socket/Host and same-origin requests.
 * @param {boolean} enabled Trusted server configuration.
 * @param {string} ip Observed socket address.
 * @param {string} host Host header, independently validated.
 * @param {string} origin Optional browser origin.
 */
export function requirePrivateTest(
  enabled: boolean, ip: string, host: string, origin?: string,
) {
  if (!enabled || process.env.NODE_ENV === "production") {
    throw new ChatError("PRIVATE_TEST_CLOSED",
      "Phòng thử riêng chưa được mở. Nhờ con kiểm tra giúp.", "none", 404);
  }
  let hostname = "";
  try {
    const value = new URL("http://" + host);
    if (value.username || value.password || value.pathname !== "/" ||
        value.search || value.hash) throw new Error("HOST");
    hostname = value.hostname;
  } catch {
    throw new ChatError("PRIVATE_HOST", "Địa chỉ phòng thử không hợp lệ.",
      "none", 403);
  }
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
      (origin !== undefined && origin !== "http://" + host)) {
    throw new ChatError("PRIVATE_LOCAL_ONLY",
      "Phòng thử này chỉ mở trên máy của con.", "none", 403);
  }
}
