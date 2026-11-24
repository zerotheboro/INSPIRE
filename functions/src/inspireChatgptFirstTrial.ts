/** Source-free first test. Offline preparation only; no live transport. */
import {createHash} from "node:crypto";
import {mkdirSync, realpathSync, existsSync, readFileSync, openSync,
  writeFileSync, fsyncSync, closeSync} from "node:fs";
import {join, resolve} from "node:path";
import {prepareLunaInput} from "./inspireLuna";
import {emptyPreferences} from "./inspireAccount";
import {chatgptLedger, createChatgptRunner, chatgptTurnInput} from
  "./inspireChatgptSession";
import type {ChatRequest} from "./inspireChatContract";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const question = "Tình huống giả định: Tôi có một ngày nhiều việc. " +
  "Giúp tôi chọn việc nên làm trước.";

/** Deterministic exact content, with no library retrieval or random IDs.
 * @return {object} Frozen proposal, explicitly not a dispatch-ready RPC.
 */
export function firstChatgptProposal() {
  const request: ChatRequest = {kind: "send", epoch: "frozen-review-20261124",
    sessionId: "luna-first-session-20261124",
    operationId: "luna-first-attempt-20261124",
    conversationId: "luna-first-conversation-20261124",
    messages: [{id: "synthetic-first-question", role: "user", text: question}]};
  const base = prepareLunaInput({messages: request.messages,
    userStatedPreferences: emptyPreferences, operatingInstructions: [],
    supportingKnowledge: []}, request);
  const prepared = {...base,
    binding: sha(JSON.stringify([request, base.payloadSHA])),
    excludedSourceCount: undefined, route: "codex-app-server" as const,
    generationEnabled: false, conversationId: request.conversationId,
    sourceCount: 0, evidenceStatus: "no-source",
    billing: "OWNER_VERIFIED_NO_ADDITIONAL_CHARGES_20261124",
    maxOutputTokensRequested: 512, tokenCapEnforcedByProvider: false};
  // threadId is issued by app-server, not an ID that a client can invent.
  const {threadId: _unbound, ...outbound} = chatgptTurnInput(prepared, "");
  void _unbound;
  const proposal = {schema: "inspire-chatgpt-first-trial-v1", request, prepared,
    outbound, outboundSHA: sha(JSON.stringify(outbound)),
    unresolvedRPCFields: ["threadId", "verified isolated thread configuration"],
    completeModelInput: true, dispatchReady: false,
    controls: {maxAttempts: 1, requestedOutputTokens: 512,
      hardOutputCapVerified: false, managedRetriesDisabledVerified: false,
      billing: "owner-confirmed-2026-11-24",
      billingIndependentlyVerified: false,
      apiFallback: false, publicGeneration: false, syntheticOnly: true,
      sourceFree: true, previousSpendingGrantReused: false}};
  return {...proposal, fingerprint: sha(JSON.stringify(proposal))};
}

/** Existing runner and Controller, bounded by a separate first-attempt marker.
 * @param {string} directory Private nonsynced root; temporary root in tests.
 * @param {object} offline Test injection, not reachable from HTTP/config.
 * @return {object} Immutable preparation and non-retrying offline verification.
 */
export function firstChatgptTrial(directory = join(
  process.env.LOCALAPPDATA ?? "", "INSPIRE-ChatGPT-FirstTrial"),
offline: Omit<Parameters<typeof createChatgptRunner>[0], "ledger"> = {}) {
  const root = resolve(directory);
  const proposal = firstChatgptProposal();
  const pending = {schema: "inspire-chatgpt-first-trial-release-v1",
    fingerprint: proposal.fingerprint, payloadSHA: proposal.prepared.payloadSHA,
    outboundSHA: proposal.outboundSHA, binding: proposal.prepared.binding,
    maxAttempts: 1, maxOutputTokens: 512, route: "codex-app-server",
    syntheticOnly: true, sourceFree: true, approved: false};
  const ensure = () => {
    if (process.env.NODE_ENV === "production" ||
        /onedrive|dropbox|google drive|^\\\\/i.test(root) ||
        root.toLowerCase().startsWith(resolve(".").toLowerCase())) {
      throw Error("FIRST_TRIAL_STORAGE_HOLD");
    }
    mkdirSync(root, {recursive: true, mode: 0o700});
    if (realpathSync(root).toLowerCase() !== root.toLowerCase()) {
      throw Error("FIRST_TRIAL_STORAGE_HOLD");
    }
  };
  const read = (name: string) => {
    const path = join(root, name);
    if (realpathSync(path).toLowerCase() !== path.toLowerCase()) throw Error();
    return JSON.parse(readFileSync(path, "utf8"));
  };
  const write = (name: string, value: unknown) => {
    const fd = openSync(join(root, name), "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const compare = (a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw Error("FIRST_TRIAL_BINDING_HOLD");
    }
  };
  const runner = createChatgptRunner({
    ledger: chatgptLedger(join(root, "ledger")), ...offline});
  return {
    freeze() {
      ensure();
      if (!existsSync(join(root, "proposal.json"))) {
        write("proposal.json", proposal);
      }
      compare(read("proposal.json"), proposal);
      if (!existsSync(join(root, "authorization.json"))) {
        write("authorization.json", pending);
      }
      // Never overwrite an existing release or an unresolved attempt.
      const auth = read("authorization.json");
      compare({...auth, approved: false}, pending);
      if (typeof auth.approved !== "boolean") throw Error("AUTHORIZATION_HOLD");
      return structuredClone({proposal, authorization: auth});
    },
    async execute(candidate: unknown) {
      ensure();
      compare(candidate, proposal);
      compare(read("proposal.json"), proposal);
      compare(read("authorization.json"), {...pending, approved: true});
      // A local owner grant cannot supply missing provider guarantees.
      if (!offline.offlineSender) throw Error("CHATGPT_TECHNICAL_HOLD");
      write("first-attempt.json", {fingerprint: proposal.fingerprint,
        attempts: 1, outcome: "unknown", at: Date.now()});
      const text = await runner.execute("synthetic-first-trial",
        proposal.request, proposal.prepared);
      write("receipt.json", {fingerprint: proposal.fingerprint,
        outcome: "validated", outputSHA: sha(text)});
      return text;
    },
    evidence: () => runner.controller.evidence(),
  };
}
