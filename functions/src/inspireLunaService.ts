import {ChatError, exactKeys, record, validateRequest} from
  "./inspireChatContract";
import type {ChatRequest} from "./inspireChatContract";
import type {Identity} from "./inspireAccount";
import {emptyPreferences} from "./inspireAccount";
import {createLocalService} from "./inspireLocalService";
import {retrieveKnowledge, ConfirmedNoReply, UnknownReplyOutcome,
  assertKnowledgeExport} from "./inspireKnowledge";
import {createLunaController} from "./inspireLunaController";
import {decodeLunaApi, lunaOneShot, prepareLunaApi, recheckLunaSources,
  sendLunaApi} from "./inspireLunaApi";
import type {LunaPrepared} from "./inspireLunaApi";
import {prepareLunaKnowledgeInput} from "./inspireLuna";
import {chatgptLedger, chatgptControls, createChatgptRunner} from
  "./inspireChatgptSession";

/** Preferred ChatGPT route. Preparation is connected; dispatch stays closed.
 * @param {object} dependencies Offline storage override, never client input.
 * @return {object} Existing identity/quota facade with a durable bound preview.
 */
export function createPrivateChatgptService(dependencies: {
  ledger?: ReturnType<typeof chatgptLedger>;
} = {}) {
  const ledger = dependencies.ledger ?? chatgptLedger();
  const runner = createChatgptRunner({ledger}); // Deliberately no live sender.
  const plans = new Map<string, {owner: string; request: ChatRequest;
    prepared: Awaited<ReturnType<typeof prepareLunaKnowledgeInput>>}>();
  const sessions = new Map<string, {owner: string; epoch: string}>();
  const facade = createLocalService({mode: "model", async reply(_ctx, request) {
    const plan = request && plans.get(request.operationId);
    if (!plan) throw new UnknownReplyOutcome("CHATGPT_PLAN_LOST");
    return runner.execute(plan.owner, plan.request, plan.prepared);
  }}, Date.now, undefined, true);
  return {...facade, controller: runner.controller,
    async handlePrivate(data: unknown, identity: Identity) {
      if (!record(data)) throw new ChatError("INVALID_REQUEST", "Yêu cầu sai.");
      if (data.kind === "session") {
        exactKeys(data, ["kind"]);
        await facade.accounts.account(identity);
        const session = facade.session(identity);
        sessions.set(session.sessionId, {owner: identity.uid,
          epoch: session.epoch});
        return session;
      }
      exactKeys(data, ["kind", "request"]);
      validateRequest(data.request);
      if (data.kind !== "preview" || data.request.kind !== "send") {
        throw new ChatError("CHATGPT_DISPATCH_BLOCKED",
          "Chưa mở gửi tới ChatGPT. Không tự gửi lại hoặc tạo lại phản hồi.",
          "none", 403);
      }
      const request = data.request;
      const session = sessions.get(request.sessionId);
      if (!session || session.owner !== identity.uid ||
          session.epoch !== request.epoch) {
        throw new ChatError("SESSION_LOST",
          "Phiên trước không còn xác minh được. Không tự tạo lại phản hồi.",
          "none", 409);
      }
      const account = await facade.accounts.account(identity);
      if (account.quota.remaining <= 0) {
        throw new ChatError("QUOTA", "Tài khoản đã hết lượt.", "none", 429);
      }
      const previous = plans.get(request.operationId);
      if (previous && (previous.owner !== identity.uid ||
          JSON.stringify(previous.request) !== JSON.stringify(request))) {
        throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
      }
      if (!previous && plans.size >= 100) {
        throw new ChatError("CAPACITY", "Phòng thử đã đầy.", "none", 503);
      }
      const prepared = previous?.prepared ?? await prepareLunaKnowledgeInput({
        messages: request.messages, operatingInstructions: [],
        userStatedPreferences: account.preferences, supportingKnowledge: [],
      }, request);
      await assertKnowledgeExport(
        JSON.parse(prepared.text).supportingKnowledge);
      ledger.prepare(identity.uid, request, prepared);
      if (!previous) {
        plans.set(request.operationId, {
          owner: identity.uid, request: structuredClone(request), prepared,
        });
      }
      return {mode: "private-model", previewOnly: true,
        operationId: request.operationId,
        conversationId: request.conversationId,
        payload: JSON.parse(prepared.text), payloadSHA: prepared.payloadSHA,
        binding: prepared.binding, sourceCount: prepared.sourceCount,
        controls: chatgptControls, accounting: ledger.status(),
        automaticRetries: false, actualExecutionEligible: false,
        publicDelivery: false};
    },
  };
}

/** Local evaluation service. Neither startup, preview nor replay generates.
 * @param {object} dependencies Offline substitutes, supplied only by tests.
 * @return {object} Private endpoint facade using existing auth/quotas/epochs.
 */
export function createPrivateLunaService(dependencies: {
  store?: ReturnType<typeof lunaOneShot>;
  controller?: ReturnType<typeof createLunaController>;
  send?: typeof sendLunaApi;
  now?: () => number;
  rateCheck?: Parameters<typeof createLocalService>[2];
} = {}) {
  const now = dependencies.now ?? Date.now;
  const store = dependencies.store ?? lunaOneShot();
  const controller = dependencies.controller ?? createLunaController();
  const send = dependencies.send ?? sendLunaApi;
  const plans = new Map<string, {
    uid: string; prepared: LunaPrepared; started: boolean; at: number;
  }>();
  const facade = createLocalService({mode: "model",
    async reply(_context, request) {
      const plan = plans.get(request!.operationId);
      if (!plan) throw new UnknownReplyOutcome("LUNA_PLAN_LOST");
      const p = plan.prepared;
      try {
        await controller.preflight(p);
        await recheckLunaSources(p);
      } catch {
        throw new ConfirmedNoReply("LUNA_PRE_DISPATCH_HOLD");
      }
      // All checks, quotas and rate reservations precede credential access.
      const key = store.consume(p);
      let raw: unknown;
      try {
        raw = await send(p, key);
      } catch {
        throw new UnknownReplyOutcome("LUNA_PROVIDER_OUTCOME_UNKNOWN");
      }
      const candidate = decodeLunaApi(raw);
      store.receipt(p, candidate.usage);
      await controller.validate(p, candidate.text);
      // This is a quarantined private evaluation surface, not actual execution
      // or public delivery permission. Native observations stay held.
      return candidate.text;
    }}, now, dependencies.rateCheck, true);

  return {...facade, controller,
    async handlePrivate(data: unknown, identity: Identity, ip: string) {
      if (!record(data)) throw new ChatError("INVALID_REQUEST", "Yêu cầu sai.");
      if (data.kind === "session") {
        exactKeys(data, ["kind"]);
        await facade.accounts.account(identity);
        return facade.session(identity);
      }
      exactKeys(data, ["kind", "request"]);
      if (!["preview", "execute"].includes(String(data.kind))) {
        throw new ChatError("INVALID_REQUEST", "Thao tác chưa được hỗ trợ.");
      }
      validateRequest(data.request);
      const request: ChatRequest = {...data.request, kind: "send"};
      const existing = plans.get(request.operationId);
      if (existing && (existing.uid !== identity.uid ||
          JSON.stringify(existing.prepared.request) !==
          JSON.stringify(request))) {
        throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
      }
      if (data.kind === "preview") {
        if (data.request.kind !== "send") {
          throw new ChatError("REPLAY_ONLY",
            "Không tạo lại đầu vào khi phát lại.");
        }
        for (const [key, plan] of plans) {
          if (now() - plan.at > 1800000) plans.delete(key);
        }
        if (plans.size >= 100) {
          throw new ChatError("CAPACITY", "Phòng thử đã đầy.", "none", 503);
        }
        const account = await facade.accounts.account(identity);
        if (account.quota.remaining <= 0) {
          throw new ChatError("QUOTA", "Tài khoản đã hết lượt.", "none", 429);
        }
        const prepared = existing?.prepared ?? prepareLunaApi({
          messages: request.messages, operatingInstructions: [],
          userStatedPreferences: {...emptyPreferences},
          supportingKnowledge: await retrieveKnowledge(request.messages, true),
        }, request);
        if (!existing) {
          plans.set(request.operationId, {
            uid: identity.uid, prepared, started: false, at: now(),
          });
        }
        return {mode: "private-model", previewOnly: true,
          operationId: request.operationId,
          conversationId: request.conversationId,
          payload: prepared.payload, payloadSHA: prepared.payloadSHA,
          binding: prepared.binding, reservedNanoUSD: prepared.reservedNanoUSD,
          inputTokenBound: prepared.inputTokenBound,
          sourceCount: prepared.references.length,
          keyConfigured: store.configured(),
          authorizationRequired: true, automaticRetries: false,
          actualExecutionEligible: false, publicDelivery: false};
      }
      if (!existing || now() - existing.at > 1800000) {
        throw new ChatError("RESULT_UNKNOWN",
          "Không còn xác định được lượt trước. Không tự tạo lại phản hồi.",
          "none", 409);
      }
      if (!existing.started && !store.authorized(existing.prepared)) {
        throw new ChatError("AUTHORIZATION_REQUIRED",
          "Con cần duyệt đúng nội dung và chi phí trước khi gửi. " +
          "Chưa có yêu cầu nào tới OpenAI.", "replay", 403);
      }
      const kind = existing.started ? "replay" : "send";
      existing.started = true;
      return facade.handle({...request, kind}, identity, ip);
    },
  };
}
