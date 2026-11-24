import {spawn, ChildProcessWithoutNullStreams} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createInterface} from "node:readline";
import {ConfirmedNoReply, UnknownReplyOutcome} from "./inspireKnowledge";
import type {ModelAdapter, ModelContext} from "./inspireKnowledge";
import type {ChatRequest} from "./inspireChatContract";

type Packet = Record<string, unknown>;
/**
 * Serialize only fixed DTO keys in the same canonical form as the Controller.
 * @param {unknown} value JSON DTO.
 * @return {unknown} Recursively key-sorted value.
 */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, sorted(item)]));
  }
  return value;
}
/**
 * Construct a lazy, network-disabled bridge to the original private Controller.
 * @param {Map<string,string>} faults Test faults, never request fields.
 * @return {object} Offline adapter with private evidence and lifecycle methods.
 */
export function createController040Adapter(faults = new Map<string, string>()) {
  let child: ChildProcessWithoutNullStreams | undefined;
  let ready: Promise<void> | undefined;
  let epoch: string | undefined;
  let lost = false;
  let sequence = 0;
  const pending = new Map<number, {
    resolve:(packet: Packet) => void; reject: (error: Error) => void;
  }>();
  const evidence: Packet[] = [];
  /**
   * Start once; process loss is never healed by silently rebuilding state.
   * @return {Promise<void>} Ready handshake.
   */
  function start(): Promise<void> {
    if (ready) return ready;
    const python = process.env.INSPIRE_CONTROLLER_PYTHON ||
      resolve(".tools.local/python312/python.exe");
    const root = resolve(".private.local/controller040-preview/INSPIRE_AI_040");
    if (!existsSync(python) || !existsSync(root)) {
      return Promise.reject(
        new ConfirmedNoReply("CONTROLLER_DEPENDENCY_MISSING"));
    }
    const manifest = readFileSync(
      resolve(root, "manifests/package_manifest.json"));
    const expected =
      "7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a";
    if (createHash("sha256").update(manifest).digest("hex") !== expected) {
      return Promise.reject(new ConfirmedNoReply("CONTROLLER_MANIFEST_HOLD"));
    }
    ready = new Promise((resolveReady, rejectReady) => {
      child = spawn(python, ["-X", "utf8",
        resolve("functions/controller040_bridge.py"), root], {
        windowsHide: true,
        env: {SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
          TEMP: process.env.TEMP, TMP: process.env.TMP,
          PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1"},
        stdio: "pipe",
      });
      const startup = setTimeout(() => {
        lost = true; child?.kill();
        rejectReady(new ConfirmedNoReply("CONTROLLER_STARTUP_HOLD"));
      }, 20000);
      createInterface({input: child.stdout}).on("line", (line) => {
        try {
          const packet = JSON.parse(line) as Packet;
          if (packet.ready === true) {
            epoch = String(packet.epoch); clearTimeout(startup); resolveReady();
          } else {
            const request = pending.get(Number(packet.id));
            pending.delete(Number(packet.id)); request?.resolve(packet);
          }
        } catch {/* Never turn invalid subprocess text into a chat message. */}
      });
      child.stderr.resume();
      child.on("error", () => {
        clearTimeout(startup); lost = true;
        rejectReady(new ConfirmedNoReply("CONTROLLER_STARTUP_HOLD"));
      });
      child.on("exit", () => {
        clearTimeout(startup); lost = true;
        rejectReady(new ConfirmedNoReply("CONTROLLER_PROCESS_LOST"));
        for (const request of pending.values()) {
          request.reject(new UnknownReplyOutcome("CONTROLLER_PROCESS_LOST"));
        }
        pending.clear();
      });
    });
    return ready;
  }
  const adapter: ModelAdapter & {
    evidence(): Packet[]; close(): void;
  } = {
    mode: "simulation",
    async reply(context: ModelContext, request?: ChatRequest) {
      if (process.env.NODE_ENV === "production" || !request || lost) {
        throw new ConfirmedNoReply("CONTROLLER_SCOPE_OR_STATE_HOLD");
      }
      await start();
      const frozen = {request: {...request, kind: "send"}, context};
      const binding = createHash("sha256")
        .update(JSON.stringify(sorted(frozen))).digest("hex");
      const id = ++sequence;
      const fault = faults.get(request.operationId);
      faults.delete(request.operationId);
      const packet = await new Promise<Packet>((resolvePacket, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id); lost = true; child?.kill();
          reject(new UnknownReplyOutcome("CONTROLLER_RESULT_UNKNOWN"));
        }, 20000);
        pending.set(id, {
          resolve(value) {
            clearTimeout(timer); resolvePacket(value);
          },
          reject(error) {
            clearTimeout(timer); reject(error);
          },
        });
        const payload = JSON.stringify({id, ...frozen, binding, fault});
        child!.stdin.write(payload + "\n");
      });
      evidence.push(packet);
      if (packet.binding !== binding || packet.epoch !== epoch ||
          packet.operationId !== request.operationId ||
          packet.conversationId !== request.conversationId ||
          packet.actual_execution_eligible !== false ||
          packet.deployment_permission !== false) {
        throw new UnknownReplyOutcome("CONTROLLER_BINDING_HOLD");
      }
      if (packet.status === "confirmed-no-reply") {
        throw new ConfirmedNoReply("CONTROLLER_VALIDATION_OR_TECHNICAL_HOLD");
      }
      if (packet.status !== "completed" || typeof packet.text !== "string") {
        throw new UnknownReplyOutcome("CONTROLLER_OUTCOME_HOLD");
      }
      const digest = createHash("sha256").update(packet.text).digest("hex");
      const receipt = packet.receipt as Packet | undefined;
      if (digest !== packet.response_sha256 ||
          receipt?.response_sha256 !== digest ||
          receipt?.decision_fingerprint !== packet.decision_fingerprint ||
          receipt?.action_id !== request.operationId) {
        throw new UnknownReplyOutcome("CONTROLLER_FINAL_OUTPUT_HOLD");
      }
      return packet.text;
    },
    evidence: () => structuredClone(evidence),
    close() {
      lost = true; child?.kill();
    },
  };
  return adapter;
}
