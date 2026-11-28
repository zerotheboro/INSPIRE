/** Local hash-only ledger. No prompts, source passages or outputs on disk. */
import {createHash} from "node:crypto";
import {mkdirSync, realpathSync, existsSync, readFileSync, openSync,
  writeSync, fsyncSync, closeSync, unlinkSync, readdirSync} from "node:fs";
import {join, resolve} from "node:path";
import type {ChatRequest} from "./inspireChatContract";
import {validateRequest, record} from "./inspireChatContract";
import {inspectLunaCandidate} from "./inspireLuna";
import type {prepareLunaKnowledgeInput} from "./inspireLuna";
import {assertKnowledgeExport} from "./inspireKnowledge";
import {createLunaController} from "./inspireLunaController";

type Prepared = Awaited<ReturnType<typeof prepareLunaKnowledgeInput>>;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export const chatgptControls = Object.freeze({
  route: "codex-app-server", authentication: "chatgpt-managed",
  model: "gpt-6-luna", maxAttempts: 3, requestedOutputTokens: 512,
  hardOutputCapVerified: false, managedRetriesDisabledVerified: false,
  privateEvaluationLimitException: true,
  displayCharacterLimit: 2000, automaticApplicationRetries: false,
  providerRetriesOutsideApplicationControl: true,
  toolIsolationVerified: false,
  noAdditionalChargeVerified: false, ownerSessionReleased: false,
  ownerBillingConfirmed: true, ownerBillingConfirmedOn: "2026-11-24",
  liveDispatchEnabled: false,
});

/** Offline protocol conversion, not a network sender or token guarantee.
 * @param {Prepared} prepared Exact held payload.
 * @param {string} threadId Server-observed thread identity.
 * @return {object} Typed turn/start fields supported by the installed schema.
 */
export function chatgptTurnInput(prepared: Prepared, threadId: string) {
  return {threadId, model: "gpt-6-luna",
    clientUserMessageId: prepared.operationId,
    input: [{type: "text", text: prepared.text, text_elements: []}]};
}

/** Consume only a complete bound turn; partials/tools/retry events fail closed.
 * @param {Prepared} prepared Exact held input.
 * @param {string} threadId Thread from the trusted server-side RPC correlation.
 * @param {string} turnId Turn from the same RPC correlation.
 * @param {unknown[]} events Recorded notifications, injected offline only.
 * @return {object} Bound candidate for the native Controller.
 */
export function decodeChatgptTurn(prepared: Prepared, threadId: string,
  turnId: string, events: unknown[]) {
  if (!threadId || !turnId || events.length !== 1) {
    throw Error("CHATGPT_PROTOCOL_HOLD");
  }
  const event = events[0];
  if (!record(event) || event.method !== "turn/completed" ||
      !record(event.params) || event.params.threadId !== threadId ||
      !record(event.params.turn)) throw Error("CHATGPT_PROTOCOL_HOLD");
  const turn = event.params.turn;
  if (turn.id !== turnId || turn.status !== "completed" || turn.error ||
      (turn.itemsView !== undefined && turn.itemsView !== "full") ||
      !Array.isArray(turn.items) || turn.items.length !== 1) {
    throw Error("CHATGPT_PROTOCOL_HOLD");
  }
  const item = turn.items[0];
  if (!record(item) || item.type !== "agentMessage" ||
      typeof item.id !== "string" || item.moderation || item.memoryCitation ||
      item.delivery || item.questions ||
      (item.phase !== undefined && item.phase !== null &&
        item.phase !== "final_answer")) throw Error("CHATGPT_PROTOCOL_HOLD");
  const packet = {operationId: prepared.operationId, binding: prepared.binding,
    payloadSHA: prepared.payloadSHA, model: prepared.model, text: item.text};
  inspectLunaCandidate(prepared, packet);
  return packet;
}

/** Private persistent identity and conservative attempt allocation.
 * @param {string} directory Local nonsynced directory, temp directory in tests.
 * @param {Function} allowance Separate operator grant, never client fields.
 * @return {object} Hash-only ledger. Corrupt/partial records fail closed.
 */
export function chatgptLedger(directory = join(
  process.env.LOCALAPPDATA ?? "", "INSPIRE-ChatGPT"),
allowance?: (owner?: string) => number) {
  const root = resolve(directory);
  const ensure = () => {
    if (process.env.NODE_ENV === "production" ||
        /onedrive|dropbox|google drive|^\\\\/i.test(root) ||
        root.toLowerCase().startsWith(resolve(".").toLowerCase())) {
      throw Error("CHATGPT_STORAGE_HOLD");
    }
    mkdirSync(root, {recursive: true, mode: 0o700});
    if (realpathSync(root).toLowerCase() !== root.toLowerCase()) {
      throw Error("CHATGPT_STORAGE_HOLD");
    }
  };
  const read = (name: string) => {
    const file = join(root, name);
    if (realpathSync(file).toLowerCase() !== file.toLowerCase()) throw Error();
    return JSON.parse(readFileSync(file, "utf8"));
  };
  const write = (name: string, value: unknown) => {
    const fd = openSync(join(root, name), "wx", 0o600);
    try {
      writeSync(fd, JSON.stringify(value)); fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const identify = (owner: string, request: ChatRequest, p: Prepared) => {
    ensure(); validateRequest(request);
    allowance?.(owner);
    if (request.kind !== "send" || sha(p.text) !== p.payloadSHA ||
        sha(JSON.stringify([request, p.payloadSHA])) !== p.binding ||
        p.operationId !== request.operationId || p.model !== "gpt-6-luna" ||
        JSON.stringify(JSON.parse(p.text).messages) !==
        JSON.stringify(request.messages)) {
      throw Error("CHATGPT_BINDING_HOLD");
    }
    const fingerprint = {owner: sha(owner),
      requestHash: sha(JSON.stringify(request)),
      payloadSHA: p.payloadSHA, binding: p.binding,
      operationId: request.operationId, sessionId: request.sessionId,
      conversationId: request.conversationId};
    const name = "request-" + sha(owner + ":" + request.operationId) + ".json";
    return {fingerprint, name};
  };
  return {
    prepare(owner: string, request: ChatRequest, p: Prepared) {
      const {fingerprint, name} = identify(owner, request, p);
      if (existsSync(join(root, "owner.json")) &&
          read("owner.json").owner !== fingerprint.owner) {
        throw Error("CHATGPT_SESSION_OWNER_HOLD");
      }
      if (!existsSync(join(root, name))) {
        if (readdirSync(root).filter((s) =>
          s.startsWith("request-")).length >= 1000) {
          throw Error("CHATGPT_PREVIEW_CAPACITY_HOLD");
        }
        try {
          write(name, fingerprint);
        } catch {
          if (!existsSync(join(root, name))) throw Error();
        }
      }
      if (JSON.stringify(read(name)) !== JSON.stringify(fingerprint)) {
        throw Error("CHATGPT_BINDING_HOLD");
      }
      return fingerprint;
    },
    consume(owner: string, request: ChatRequest, p: Prepared) {
      const fingerprint = this.prepare(owner, request, p);
      // Exclusive lock is intentionally retained after a process crash.
      // It cannot silently restart an unresolved dispatch.
      write("allocation.lock", {binding: p.binding});
      try {
        // Previewing never claims the session. First attempted dispatch does.
        if (!existsSync(join(root, "owner.json"))) {
          write("owner.json", {owner: fingerprint.owner});
        }
        if (read("owner.json").owner !== fingerprint.owner) {
          throw Error("CHATGPT_SESSION_OWNER_HOLD");
        }
        const maximum = allowance?.(owner) ?? 3;
        const slots = Array.from({length: maximum}, (_, i) => i + 1)
          .filter((i) => existsSync(join(root, "attempt-" + i + ".json")));
        for (const i of slots) {
          const attempt = read("attempt-" + i + ".json");
          if (attempt.binding === p.binding) throw Error("OUTCOME_UNRESOLVED");
          if (!existsSync(join(root, "receipt-" + i + ".json"))) {
            throw Error("OUTCOME_UNRESOLVED");
          }
          const receipt = read("receipt-" + i + ".json");
          if (receipt.binding !== attempt.binding ||
              receipt.outcome !== "validated") {
            throw Error("OUTCOME_UNRESOLVED");
          }
        }
        if (slots.length >= maximum) throw Error("CHATGPT_SESSION_EXHAUSTED");
        const slot = slots.length + 1;
        write("attempt-" + slot + ".json", {...fingerprint,
          outcome: "unknown", slot});
        return slot;
      } finally {
        unlinkSync(join(root, "allocation.lock"));
      }
    },
    receipt(slot: number, p: Prepared, outputHash: string) {
      const attempt = read("attempt-" + slot + ".json");
      if (attempt.binding !== p.binding || !/^[a-f0-9]{64}$/.test(outputHash)) {
        throw Error("CHATGPT_RECEIPT_HOLD");
      }
      write("receipt-" + slot + ".json", {binding: p.binding,
        outcome: "validated", outputHash});
    },
    status() {
      ensure();
      const attempts = readdirSync(root)
        .filter((s) => /^attempt-\d+\.json$/.test(s));
      const unresolved = attempts.filter((s) => !existsSync(
        join(root, s.replace("attempt-", "receipt-")))).length;
      return {maxAttempts: allowance?.() ?? 3,
        used: attempts.length, unresolved,
        recoveryHold: unresolved > 0 ||
          existsSync(join(root, "allocation.lock")),
        persisted: "identity-and-hashes-only"};
    },
  };
}

/** Offline-injectable dispatch seam; production default has no sender.
 * @param {object} options Explicit test dependencies; never HTTP/client fields.
 * @return {object} Bound, non-retrying execution with held live dispatch.
 */
export function createChatgptRunner(options: {
  ledger: ReturnType<typeof chatgptLedger>;
  controller?: ReturnType<typeof createLunaController>;
  recheck?: typeof assertKnowledgeExport;
  offlineSender?: (p: Prepared) => Promise<unknown>;
}) {
  const controller = options.controller ?? createLunaController();
  const recheck = options.recheck ?? assertKnowledgeExport;
  return {controller,
    async execute(owner: string, requestInput: ChatRequest, input: Prepared) {
      const request = structuredClone(requestInput);
      const p = structuredClone(input);
      options.ledger.prepare(owner, request, p);
      if (!options.offlineSender || process.env.NODE_ENV === "production") {
        throw Error("CHATGPT_DISPATCH_BLOCKED");
      }
      const slot = options.ledger.consume(owner, request, p);
      const bound = {request, binding: p.binding, payloadSHA: p.payloadSHA};
      await controller.preflight(bound);
      // Last asynchronous permission check before the single injected send.
      await recheck(JSON.parse(p.text).supportingKnowledge);
      const packet = await options.offlineSender(structuredClone(p));
      const candidate = inspectLunaCandidate(p, packet);
      await controller.validate(bound, candidate.text);
      options.ledger.receipt(slot, p, candidate.sha256);
      return candidate.text;
    },
  };
}
