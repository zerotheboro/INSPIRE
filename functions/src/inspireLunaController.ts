import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {TextDecoder} from "node:util";
import {record} from "./inspireChatContract";
import {ConfirmedNoReply, UnknownReplyOutcome} from "./inspireKnowledge";
import {lunaHash} from "./inspireLunaApi";
import type {LunaPrepared} from "./inspireLunaApi";
type ControllerInput = Pick<LunaPrepared, "request" | "binding" | "payloadSHA">;

/** Original native generated checks, distinct from catalogue mock eligibility.
 * @return {object} Preflight/candidate validation and process-local state.
 */
export function createLunaController() {
  const states = new Map<string, unknown>();
  const receipts: Record<string, unknown>[] = [];
  /** Check original native controls with no credential in the child process.
   * @param {ControllerInput} prepared Exact proposal.
   * @param {string} text Candidate, absent for the disposable preflight probe.
   * @return {Promise<object>} Receipt-bound private evidence.
   */
  async function check(prepared: ControllerInput, text?: string) {
    const preflight = text === undefined;
    const key = prepared.request.sessionId + ":" +
      prepared.request.conversationId;
    const packet: unknown = await new Promise((done, reject) => {
      const child = spawn(process.env.INSPIRE_CONTROLLER_PYTHON ||
        resolve(".tools.local/python312/python.exe"), ["-X", "utf8",
        resolve("functions/inspire_luna_bridge.py")], {
        windowsHide: true, stdio: "pipe",
        env: {SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
          TEMP: process.env.TEMP, TMP: process.env.TMP,
          PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1"},
      });
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => {
        child.kill(); reject(new Error("NATIVE_TIMEOUT"));
      }, 20000);
      child.stdout.on("data", (part: Buffer) => {
        size += part.length;
        if (size > 1000000) child.kill();
        else chunks.push(part);
      });
      child.stderr.resume();
      child.on("error", () => {
        clearTimeout(timer); reject(new Error("NATIVE_UNAVAILABLE"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0 || size > 1000000) throw Error();
          done(JSON.parse(new TextDecoder("utf-8", {fatal: true})
            .decode(Buffer.concat(chunks))));
        } catch {
          reject(new Error("NATIVE_PROTOCOL_HOLD"));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({
        kind: preflight ? "preflight" : "validate",
        request: prepared.request, previous: states.get(key) ?? null,
        binding: prepared.binding, text: text ?? null}));
    }).catch(() => null);
    if (!record(packet) || packet.ok !== true ||
        packet.binding !== prepared.binding ||
        packet.operationId !== prepared.request.operationId ||
        !record(packet.proof) ||
        packet.proof.actual_execution_eligible !== false ||
        packet.proof.user_delivery !== false ||
        (!preflight && (packet.text !== text ||
          packet.proof.validated_sha256 !== lunaHash(text!)))) {
      if (preflight) {
        throw new ConfirmedNoReply("LUNA_CONTROLLER_PREFLIGHT_HOLD");
      }
      throw new UnknownReplyOutcome("LUNA_CONTROLLER_OUTPUT_HOLD");
    }
    receipts.push({phase: preflight ? "preflight" : "candidate",
      operationId: prepared.request.operationId, binding: prepared.binding,
      payloadSHA: prepared.payloadSHA, ...packet.proof});
    if (!preflight) states.set(key, packet.state);
    return packet.proof;
  }
  return {preflight: (p: ControllerInput) => check(p),
    validate: (p: ControllerInput, text: string) => check(p, text),
    evidence: () => structuredClone(receipts)};
}
