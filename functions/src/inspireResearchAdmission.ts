/** Stdin-only research admission; never a public Firebase Function. */
import {createHash} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {AccountService, verifiedIdentity} from "./inspireAccount";
import {requireLocalEmulators} from "./inspireLocalService";
import {checkRateLimit, getVisitorKey} from "./inspireAI";
import {exactKeys, record, validateRequest} from "./inspireChatContract";

/** Read a bounded envelope without logging tokens or raw errors. */
async function main() {
  requireLocalEmulators();
  let body = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    body = Buffer.concat([body, Buffer.from(chunk)]);
    if (body.length > 64000) throw new Error("BODY_LIMIT");
  }
  const value: unknown = JSON.parse(body.toString("utf8"));
  if (!record(value)) throw new Error("INVALID_ENVELOPE");
  exactKeys(value, ["action", "token", "subject", "request", "operation",
    "validatedSha256"]);
  if (typeof value.token !== "string") throw new Error("AUTH_REQUIRED");
  const identity = await verifiedIdentity(value.token);
  if (!identity.registered ||
      !identity.email?.endsWith("@synthetic.invalid") ||
      !identity.providers.includes("password")) {
    throw new Error("SYNTHETIC_REGISTERED_ACCOUNT_REQUIRED");
  }
  const subject = createHash("sha256").update(identity.uid).digest("hex");
  if (value.action !== "identity" && value.subject !== subject) {
    throw new Error("IDENTITY_CHANGED");
  }
  const accounts = new AccountService();
  if (value.action === "identity") {
    const account = await accounts.account(identity);
    if (account.quota.remaining < 12) throw new Error("TWELVE_SLOTS_REQUIRED");
    process.stdout.write(JSON.stringify({subject,
      remaining: account.quota.remaining,
      domain: "firebase-demo-emulator"}));
  } else if (value.action === "reserve") {
    validateRequest(value.request);
    const rate = await checkRateLimit(getVisitorKey("127.0.0.1"), Date.now());
    if (!rate.allowed) throw new Error("RATE_LIMITED");
    await accounts.reserve(identity, value.request);
    process.stdout.write(JSON.stringify({reserved: true, subject}));
  } else if (value.action === "settle") {
    if (typeof value.operation !== "string" ||
        typeof value.validatedSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.validatedSha256)) {
      throw new Error("RESEARCH_RECEIPT_REQUIRED");
    }
    // Local operator-only, synthetic research acceptance; no user delivery.
    await accounts.settle(identity, value.operation, "completed");
    process.stdout.write(JSON.stringify({settled: true, subject}));
  } else {
    throw new Error("UNSUPPORTED_ACTION");
  }
}

main().catch((error: unknown) => {
  const code = record(error) && typeof error.code === "string" ?
    error.code : "RESEARCH_ADMISSION_HOLD";
  process.stderr.write(JSON.stringify({held: code}));
  process.exitCode = 2;
}).finally(async () => {
  try {
    await getFirestore().terminate();
  } catch {
    // No initialized Admin app, e.g. production guard.
  }
});
