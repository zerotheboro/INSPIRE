/** Separate local evaluation grant. No HTTP issuance or automatic approval. */
import {readFileSync, realpathSync} from "node:fs";
import {join, resolve} from "node:path";
import {createHash} from "node:crypto";
import {chatgptLedger} from "./inspireChatgptSession";
import {exactKeys, record} from "./inspireChatContract";
import type {Identity} from "./inspireAccount";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Read an exact scoped grant; construction issues no permission.
 * @param {string} directory Private nonsynced session directory.
 * @param {Function} now Trusted clock.
 * @return {object} Existing durable ledger and local-accounting hooks.
 */
export function evaluationAllowance(directory: string, now = Date.now) {
  const root = resolve(directory);
  const check = (owner?: string) => {
    if (process.env.NODE_ENV === "production" ||
        /onedrive|dropbox|google drive|^\\\\/i.test(root)) {
      throw Error("EVALUATION_STORAGE_HOLD");
    }
    const file = join(root, "evaluation-grant.json");
    if (realpathSync(file).toLowerCase() !== file.toLowerCase()) {
      throw Error("EVALUATION_STORAGE_HOLD");
    }
    const g: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!record(g)) throw Error("EVALUATION_GRANT_HOLD");
    exactKeys(g, ["schema", "sessionScope", "ownerHash", "approved",
      "maxAttempts", "expiresAt", "route", "model", "syntheticOnly",
      "publicDelivery", "sourcePermissionSeparate"]);
    if (g.schema !== "inspire-private-evaluation-v1" ||
        g.sessionScope !== "father-50-questions-v1" ||
        g.approved !== true || g.maxAttempts !== 50 ||
        g.route !== "codex-app-server" || g.model !== "gpt-6-luna" ||
        g.syntheticOnly !== true || g.publicDelivery !== false ||
        g.sourcePermissionSeparate !== true ||
        typeof g.ownerHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(g.ownerHash) ||
        !Number.isSafeInteger(g.expiresAt) || Number(g.expiresAt) <= now() ||
        (owner !== undefined && g.ownerHash !== sha(owner))) {
      throw Error("EVALUATION_GRANT_HOLD");
    }
    return 50;
  };
  const ledger = chatgptLedger(root, check);
  return {ledger, assertOwner: (owner: string) => check(owner),
    accounting: {
      async reserve(identity: Identity) {
        check(identity.uid);
      },
      async settle(identity: Identity) {
        check(identity.uid);
      },
    }};
}
