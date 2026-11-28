/** Narrow app-server transport. Runtime generation remains held. */
import {spawn} from "node:child_process";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import {TextDecoder} from "node:util";
import {record} from "./inspireChatContract";
import {assertKnowledgeExport} from "./inspireKnowledge";
import {chatgptTurnInput, decodeChatgptTurn, chatgptControls} from
  "./inspireChatgptSession";
import type {prepareLunaKnowledgeInput} from "./inspireLuna";
import {isolatedChatgptEnvironment, privateToolPolicy} from
  "./inspireChatgptProfile";

type Prepared = Awaited<ReturnType<typeof prepareLunaKnowledgeInput>>;
export type ChatgptChannel = {
  rpc(method: string, params: unknown): Promise<unknown>;
  completed(thread: string, turn: string): Promise<unknown[]>;
  close(): void;
};

/** Hydrate a summary only from its exact completed stream item.
 * @param {unknown[]} completed Complete agent item notifications.
 * @param {unknown[]} final Complete bound turn notifications.
 * @return {unknown[]} Full event for the existing strict decoder.
 */
export function hydrateChatgptFinal(completed: unknown[], final: unknown[]) {
  if (final.length !== 1 || !record(final[0]) ||
      !record(final[0].params) || !record(final[0].params.turn)) {
    throw Error("CHATGPT_FINAL_HOLD");
  }
  const event = structuredClone(final[0]);
  const params = event.params as Record<string, unknown>;
  const turn = params.turn as Record<string, unknown>;
  if (turn.itemsView !== "summary") return final;
  if (completed.length !== 1 || !record(completed[0]) ||
      !record(completed[0].params)) throw Error("CHATGPT_SUMMARY_HOLD");
  const p = completed[0].params;
  if (p.threadId !== params.threadId || p.turnId !== turn.id ||
      !record(p.item) || p.item.type !== "agentMessage" ||
      !Array.isArray(turn.items) || turn.items.length !== 1 ||
      JSON.stringify(turn.items[0]) !== JSON.stringify(p.item)) {
    throw Error("CHATGPT_SUMMARY_BINDING_HOLD");
  }
  turn.itemsView = "full";
  turn.items = [structuredClone(p.item)];
  return [event];
}

/** Exact proposed thread settings. These are NOT proof of tool isolation.
 * @param {Prepared} p Server-constructed, permission-filtered payload.
 * @return {object} Installed-protocol fields; no invented token/retry setting.
 */
export function chatgptThreadInput(p: Prepared) {
  return {model: "gpt-6-luna", modelProvider: "openai", ephemeral: true,
    allowProviderModelFallback: false, approvalPolicy: "never",
    sandbox: "read-only", environments: [], runtimeWorkspaceRoots: [],
    selectedCapabilityRoots: [], dynamicTools: [],
    config: {"forced_login_method": "chatgpt", "web_search": "disabled",
      "skills.include_instructions": false, "skills.bundled.enabled": false,
      "plugins._default.enabled": false,
      ...Object.fromEntries(Object.entries(privateToolPolicy)
        .map(([key, value]) => ["features." + key, value]))},
    baseInstructions: JSON.parse(p.text).instructions,
    developerInstructions: ""};
}

/** One turn, no resume/retry/fallback. Only mock channels are admitted today.
 * @param {Function} open Trusted channel factory, never browser-supplied.
 * @return {Function} Sender injected into the existing durable runner.
 */
export function createChatgptProtocolSender(open: () => ChatgptChannel) {
  return async (p: Prepared) => {
    const channel = open();
    try {
      await channel.rpc("initialize", {clientInfo: {
        name: "inspire_private", version: "1.0",
      }, capabilities: {experimentalApi: true}});
      const account = await channel.rpc("account/read", {refreshToken: false});
      if (!record(account) || !record(account.account) ||
          account.account.type !== "chatgpt") throw Error("CHATGPT_AUTH_HOLD");
      const thread = await channel.rpc("thread/start", chatgptThreadInput(p));
      if (!record(thread) || !record(thread.thread) ||
          typeof thread.thread.id !== "string" || !thread.thread.id ||
          thread.thread.ephemeral !== true || thread.model !== p.model ||
          thread.modelProvider !== "openai" ||
          thread.approvalPolicy !== "never" ||
          JSON.stringify(thread.instructionSources) !== "[]" ||
          JSON.stringify(thread.runtimeWorkspaceRoots) !== "[]" ||
          !record(thread.sandbox) || thread.sandbox.type !== "readOnly" ||
          thread.sandbox.networkAccess !== false) {
        throw Error("CHATGPT_THREAD_ISOLATION_HOLD");
      }
      // Metadata/thread creation must not create a permission-check gap.
      await assertKnowledgeExport(JSON.parse(p.text).supportingKnowledge);
      const start = await channel.rpc("turn/start",
        chatgptTurnInput(p, thread.thread.id));
      if (!record(start) || !record(start.turn) ||
          typeof start.turn.id !== "string" || !start.turn.id ||
          !["inProgress", "completed"].includes(String(start.turn.status))) {
        throw Error("CHATGPT_TURN_HOLD");
      }
      return decodeChatgptTurn(p, thread.thread.id, start.turn.id,
        await channel.completed(thread.thread.id, start.turn.id));
    } finally {
      channel.close();
    }
  };
}

/** Construct the stdio implementation only after missing controls are solved.
 * @param {string} binary Trusted installed Codex executable.
 * @param {string} profile Isolated profile, never the main Codex profile.
 * @return {ChatgptChannel} Unreachable while the route is held.
 */
export function openChatgptStdio(binary: string,
  profile = process.env.INSPIRE_CHATGPT_PROFILE ?? ""): ChatgptChannel {
  // No environment flag, conversational approval, old grant or API key can
  // bypass this. The owner waived provider token/retry guarantees for private
  // evaluation only. Tool isolation and a separate run release remain required.
  if (process.env.NODE_ENV === "production" ||
      !chatgptControls.privateEvaluationLimitException ||
      !chatgptControls.toolIsolationVerified ||
      !chatgptControls.liveDispatchEnabled ||
      !chatgptControls.ownerSessionReleased) {
    throw Error("CHATGPT_PROVIDER_CONTROLS_UNSUPPORTED");
  }
  const child = spawn(binary, ["app-server", "--stdio"], {
    windowsHide: true, stdio: "pipe", cwd: profile,
    env: isolatedChatgptEnvironment(profile),
  });
  return chatgptStdioChannel(child);
}

/** Bounded UTF-8 JSONL RPC, exercised with offline duplex streams.
 * @param {ChildProcessWithoutNullStreams} child Trusted process or fake.
 * @return {ChatgptChannel} Correlated reader with no retry/output logging.
 */
export function chatgptStdioChannel(child: ChildProcessWithoutNullStreams):
ChatgptChannel {
  child.stderr.resume();
  const decoder = new TextDecoder("utf-8", {fatal: true});
  const waiting = new Map<number, {
    resolve(v: unknown): void; reject(e: Error): void;
  }>();
  const notifications: unknown[] = [];
  let sequence = 0;
  let buffer = "";
  let bytes = 0;
  let failure: Error | undefined;
  let wake = () => {};
  const fail = () => {
    failure = Error("CHATGPT_TRANSPORT_OUTCOME_UNKNOWN");
    for (const p of waiting.values()) p.reject(failure);
    waiting.clear(); wake(); child.kill();
  };
  const timer = setTimeout(fail, 95000);
  child.on("error", fail);
  child.on("exit", fail);
  child.stdin.on("error", fail);
  child.stdout.on("data", (chunk: Buffer) => {
    try {
      bytes += chunk.length;
      if (bytes > 1000000) throw Error();
      buffer += decoder.decode(chunk, {stream: true});
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const value = JSON.parse(line);
        if (!record(value)) throw Error();
        if ("id" in value) {
          const pending = waiting.get(Number(value.id));
          if (!pending || value.method || value.error) throw Error();
          waiting.delete(Number(value.id)); pending.resolve(value.result);
        } else {
          if (notifications.length >= 5000) throw Error();
          notifications.push(value); wake();
        }
      }
    } catch {
      fail();
    }
  });
  return {
    async rpc(method, params) {
      if (failure) throw failure;
      if (!["initialize", "account/read", "thread/start", "turn/start"]
        .includes(method)) throw Error("CHATGPT_METHOD_HOLD");
      const id = ++sequence;
      const result = new Promise((resolve, reject) => {
        waiting.set(id, {resolve, reject});
        child.stdin.write(JSON.stringify({id, method, params}) + "\n");
      });
      const value = await result;
      if (method === "initialize") {
        child.stdin.write(JSON.stringify({method: "initialized",
          params: {}}) + "\n");
      }
      return value;
    },
    async completed(thread, turn) {
      const final: unknown[] = [];
      const completed: unknown[] = [];
      for (;;) {
        if (failure) throw failure;
        for (const value of notifications.splice(0)) {
          if (!record(value) || !record(value.params)) throw Error();
          const p = value.params;
          if (["thread/tokenUsage/updated", "account/rateLimits/updated",
            "thread/status/changed", "remoteControl/status/changed"]
            .includes(String(value.method))) continue;
          if (value.method === "thread/started") {
            if (!record(p.thread) || p.thread.id !== thread) throw Error();
            continue;
          }
          if (p.threadId !== thread) throw Error("CHATGPT_EVENT_BINDING_HOLD");
          if (value.method === "turn/started" ||
              value.method === "turn/completed") {
            if (!record(p.turn) || p.turn.id !== turn) throw Error();
            if (value.method === "turn/completed") final.push(value);
          } else if (["item/started", "item/completed"].includes(
            String(value.method))) {
            if (p.turnId !== turn || !record(p.item) ||
                !["userMessage", "agentMessage"].includes(
                  String(p.item.type))) throw Error("CHATGPT_TOOL_HOLD");
            if (value.method === "item/completed" &&
                p.item.type === "agentMessage") completed.push(value);
          } else if (value.method === "item/agentMessage/delta") {
            if (p.turnId !== turn) throw Error();
          } else throw Error("CHATGPT_UNSUPPORTED_EVENT_HOLD");
        }
        if (final.length) return hydrateChatgptFinal(completed, final);
        await new Promise<void>((resolve) => {
          wake = resolve;
          if (failure || notifications.length) resolve();
        });
      }
    },
    close() {
      clearTimeout(timer); child.stdin.end(); child.kill();
    },
  };
}
