import {ChatError, exactKeys, record, validateRequest} from
  "./inspireChatContract";
import type {ChatRequest} from "./inspireChatContract";
import type {Identity} from "./inspireAccount";
import {emptyPreferences} from "./inspireAccount";
import {createLocalService} from "./inspireLocalService";
import {retrieveKnowledge, ConfirmedNoReply, UnknownReplyOutcome,
  assertKnowledgeExport, knowledgeReadiness} from "./inspireKnowledge";
import {createLunaController} from "./inspireLunaController";
import {decodeLunaApi, lunaOneShot, prepareLunaApi, recheckLunaSources,
  sendLunaApi, countLunaInput} from "./inspireLunaApi";
import {lunaSessionBudget} from "./inspireLunaBudget";
import type {LunaPrepared} from "./inspireLunaApi";
import {prepareLunaKnowledgeInput} from "./inspireLuna";
import {chatgptLedger, chatgptControls, createChatgptRunner} from
  "./inspireChatgptSession";
import type {evaluationAllowance} from "./inspireEvaluationAllowance";

/** Preferred ChatGPT route. Preparation is connected; dispatch stays closed.
 * @param {object} dependencies Offline storage override, never client input.
 * @return {object} Existing identity/quota facade with a durable bound preview.
 */
export function createPrivateChatgptService(dependencies: {
  ledger?: ReturnType<typeof chatgptLedger>;
  sourceFree?: boolean;
  offlineSender?: Parameters<typeof createChatgptRunner>[0]["offlineSender"];
  rateCheck?: Parameters<typeof createLocalService>[2];
  evaluation?: ReturnType<typeof evaluationAllowance>;
} = {}) {
  const ledger = dependencies.evaluation?.ledger ??
    dependencies.ledger ?? chatgptLedger();
  const runner = createChatgptRunner({ledger,
    offlineSender: dependencies.offlineSender});
  const plans = new Map<string, {owner: string; request: ChatRequest;
    prepared: Awaited<ReturnType<typeof prepareLunaKnowledgeInput>>}>();
  const sessions = new Map<string, {owner: string; epoch: string}>();
  const facade = createLocalService({mode: "model", async reply(_ctx, request) {
    const plan = request && plans.get(request.operationId);
    if (!plan) throw new UnknownReplyOutcome("CHATGPT_PLAN_LOST");
    return runner.execute(plan.owner, plan.request, plan.prepared);
  }}, Date.now, dependencies.rateCheck, true, dependencies.sourceFree,
  dependencies.evaluation?.accounting);
  return {...facade, controller: runner.controller,
    async handlePrivate(data: unknown, identity: Identity,
      ip = "local-unknown") {
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
      if (data.kind === "execute" && dependencies.offlineSender &&
          process.env.NODE_ENV !== "production") {
        // Only trusted offline tests supply a sender. Runtime has no release.
        // Replay goes directly to the existing engine: never rebuild a plan.
        if (data.request.kind === "replay") {
          return facade.handle(data.request, identity, ip);
        }
        const plan = plans.get(data.request.operationId);
        if (!plan || plan.owner !== identity.uid ||
            JSON.stringify(plan.request) !== JSON.stringify(data.request)) {
          throw new ChatError("OPERATION_CONFLICT",
            "Không xác minh được nội dung đã chuẩn bị.", "none", 409);
        }
        return facade.handle(data.request, identity, ip);
      }
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
      dependencies.evaluation?.assertOwner(identity.uid);
      if (!dependencies.evaluation && account.quota.remaining <= 0) {
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
      }, request, dependencies.sourceFree);
      await assertKnowledgeExport(
        JSON.parse(prepared.text).supportingKnowledge);
      ledger.prepare(identity.uid, request, prepared);
      if (!previous) {
        plans.set(request.operationId, {
          owner: identity.uid, request: structuredClone(request), prepared,
        });
      }
      return {mode: "private-model", previewOnly: true,
        executionAvailable: !!dependencies.offlineSender &&
          process.env.NODE_ENV !== "production",
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
  sourceFree?: boolean;
  store?: ReturnType<typeof lunaOneShot>;
  controller?: ReturnType<typeof createLunaController>;
  send?: typeof sendLunaApi;
  now?: () => number;
  rateCheck?: Parameters<typeof createLocalService>[2];
  conversation?: ReturnType<typeof lunaSessionBudget>;
  countInput?: typeof countLunaInput;
  quarantine?: (prepared: LunaPrepared, raw: unknown) => void;
} = {}) {
  const now = dependencies.now ?? Date.now;
  const store = dependencies.store ?? lunaOneShot();
  const controller = dependencies.controller ?? createLunaController();
  const send = dependencies.send ?? sendLunaApi;
  const conversation = dependencies.conversation ??
    (process.env.INSPIRE_PRIVATE_CONVERSATION === "1" ?
      lunaSessionBudget() : undefined);
  const countInput = dependencies.countInput ?? countLunaInput;
  const plans = new Map<string, {
    uid: string; prepared: LunaPrepared; started: boolean; at: number;
    ownerReleased?: boolean;
    conversation?: boolean;
  }>();
  const preparing = new Map<string, {
    uid: string; request: ChatRequest;
    result: Promise<LunaPrepared>;
  }>();
  const facade = createLocalService({mode: "model",
    async reply(_context, request) {
      if (process.env.INSPIRE_PRIVATE_CONVERSATION === "1" &&
          !(await knowledgeReadiness()).ready) {
        throw new ConfirmedNoReply("KNOWLEDGE_NOT_READY");
      }
      const plan = plans.get(request!.operationId);
      if (!plan) throw new UnknownReplyOutcome("LUNA_PLAN_LOST");
      const p = plan.prepared;
      try {
        await controller.preflight(p);
        await recheckLunaSources(p);
      } catch (error) {
        throw new ConfirmedNoReply("LUNA_PRE_DISPATCH_HOLD", error);
      }
      // All checks, quotas and rate reservations precede credential access.
      let key: string;
      try {
        key = plan.conversation ? conversation!.reserve(p, plan.uid) :
          store.consume(p);
      } catch (error) {
        if (plan.conversation) {
          throw new ConfirmedNoReply("SESSION_PRE_DISPATCH_HOLD", error);
        }
        throw error;
      }
      let raw: unknown;
      try {
        if (plan.conversation) {
          conversation!.counted(p, await countInput(p, key));
          if (process.env.INSPIRE_PRIVATE_CONVERSATION === "1" &&
              !(await knowledgeReadiness()).ready) {
            throw new ChatError("KNOWLEDGE_NOT_READY",
              "Kho tri thức đang tạm dừng. Chưa gọi tạo sinh.", "none", 503);
          }
          await recheckLunaSources(p);
          conversation!.dispatch(p);
        }
        raw = await send(p, key);
        if (plan.conversation) {
          conversation!.provider(p, raw);
          (dependencies.quarantine ?? conversation!.quarantine)(p, raw);
        }
      } catch (error) {
        if (plan.conversation) conversation!.failed(p, error);
        if (error instanceof ChatError) throw error;
        throw new UnknownReplyOutcome("LUNA_PROVIDER_OUTCOME_UNKNOWN");
      }
      const candidate = decodeLunaApi(raw);
      if (!plan.conversation) store.receipt(p, candidate.usage);
      await controller.validate(p, candidate.text);
      if (plan.conversation) conversation!.validated(p, candidate.text);
      // This is a quarantined private evaluation surface, not actual execution
      // or public delivery permission. Native observations stay held.
      return candidate.text;
    // The adapter uses the frozen plan above, not this facade's context.
    // Retrieval happens during preview; dispatch rechecks those exact sources.
    // A second, unused search could invalidate a still-valid approved plan.
    }}, now, dependencies.rateCheck, true, true);

  const handlers = {...facade, controller,
    async handlePrivate(data: unknown, identity: Identity, ip: string) {
      if (!record(data)) throw new ChatError("INVALID_REQUEST", "Yêu cầu sai.");
      if (data.kind === "session") {
        exactKeys(data, ["kind"]);
        await conversation?.migrateIdentity?.(identity.uid);
        await facade.accounts.account(identity);
        return {...facade.session(identity),
          ...(conversation ? {budget: conversation.status(identity.uid)} : {})};
      }
      if (data.kind === "budget-status") {
        exactKeys(data, ["kind"]);
        await conversation?.migrateIdentity?.(identity.uid);
        return {budget: conversation?.status(identity.uid) ??
          {released: false}};
      }
      const automatic = data.kind === "conversation";
      if (data.kind === "recover-unsent") {
        exactKeys(data, ["kind", "request"]);
        validateRequest(data.request);
        if (!conversation) {
          throw new ChatError("SESSION_NOT_RELEASED",
            "Không tìm thấy quyền phiên riêng.", "none", 403);
        }
        await conversation.migrateIdentity(identity.uid);
        if (operations.has(data.request.operationId) ||
            preparing.has(data.request.operationId) ||
            plans.get(data.request.operationId)?.started) {
          throw new ChatError("RESULT_UNKNOWN",
            "Lượt này đang xử lý hoặc đã bắt đầu. Không tạo lại kết quả.",
            "none", 409);
        }
        await conversation.assertUnsent(identity.uid, data.request.operationId);
        const session = facade.session(identity);
        return {notDispatched: true,
          request: {...data.request, kind: "send", epoch: session.epoch,
            sessionId: session.sessionId}};
      }
      const ownerPreview = data.kind === "owner-preview";
      let input = data;
      if (automatic) {
        exactKeys(data, ["kind", "request"]);
        validateRequest(data.request);
        // Binding recovery is independent of send/replay. A replay still goes
        // through the same durable operation, budget and epoch guards below.
        await conversation?.migrateIdentity?.(identity.uid);
        if (process.env.INSPIRE_PRIVATE_CONVERSATION === "1" &&
            !(await knowledgeReadiness()).ready) {
          throw new ChatError("KNOWLEDGE_NOT_READY",
            "Kho tri thức chưa sẵn sàng. Chưa gửi tới AI.", "none", 503);
        }
        if (!conversation) {
          throw new ChatError("SESSION_NOT_RELEASED",
            "Phiên AI riêng chưa được mở. Nhờ con kiểm tra giúp.", "none", 403);
        }
        conversation.permit(identity.uid, data.request);
        const cached = plans.get(data.request.operationId);
        input = {kind: cached ? "execute" : "preview",
          request: {...data.request, kind: "send"}};
      }
      if (ownerPreview) {
        exactKeys(data, ["kind"]);
        const claim = store.ownerRequest(identity.uid,
          () => facade.session(identity));
        if (claim.epoch !== facade.epoch) {
          throw new ChatError("SESSION_LOST",
            "Backend đã đổi phiên sau khi chuẩn bị. Không tự đổi binding.",
            "none", 409);
        }
        input = {kind: "preview", request: claim};
      }
      exactKeys(input, ["kind", "request"]);
      if (!["preview", "execute"].includes(String(input.kind))) {
        throw new ChatError("INVALID_REQUEST", "Thao tác chưa được hỗ trợ.");
      }
      validateRequest(input.request);
      const request: ChatRequest = {...input.request, kind: "send"};
      let existing = plans.get(request.operationId);
      if (existing && (existing.uid !== identity.uid ||
          JSON.stringify(existing.prepared.request) !==
          JSON.stringify(request))) {
        throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
      }
      const pending = preparing.get(request.operationId);
      if (pending && (pending.uid !== identity.uid ||
          JSON.stringify(pending.request) !== JSON.stringify(request))) {
        throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
      }
      if (input.kind === "preview") {
        if (input.request.kind !== "send") {
          throw new ChatError("REPLAY_ONLY",
            "Không tạo lại đầu vào khi phát lại.");
        }
        for (const [key, plan] of plans) {
          if (now() - plan.at > 1800000) plans.delete(key);
        }
        const account = await facade.accounts.account(identity);
        if (account.quota.remaining <= 0) {
          throw new ChatError("QUOTA", "Tài khoản đã hết lượt.", "none", 429);
        }
        // Re-read after account IO: another preview may have finished while
        // awaiting it. Share cold retrieval and never reset `started` to false.
        const ready = plans.get(request.operationId);
        if (ready && (ready.uid !== identity.uid ||
            JSON.stringify(ready.prepared.request) !==
            JSON.stringify(request))) {
          throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
        }
        let prepared = ready?.prepared;
        if (!prepared) {
          let work = preparing.get(request.operationId);
          if (!work) {
            if (plans.size + preparing.size >= 100) {
              throw new ChatError("CAPACITY", "Phòng thử đã đầy.", "none", 503);
            }
            const result = Promise.resolve().then(async () => {
              const value = prepareLunaApi({
                messages: request.messages, operatingInstructions: [],
                userStatedPreferences: {...emptyPreferences},
                supportingKnowledge: dependencies.sourceFree ? [] :
                  await retrieveKnowledge(request.messages, true),
              }, request, automatic);
              await recheckLunaSources(value);
              plans.set(request.operationId, {
                uid: identity.uid, prepared: value, started: false, at: now(),
              });
              return value;
            });
            work = {uid: identity.uid,
              request: structuredClone(request), result};
            preparing.set(request.operationId, work);
          }
          // A different caller may have started this preparation during IO.
          if (work.uid !== identity.uid ||
              JSON.stringify(work.request) !== JSON.stringify(request)) {
            throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
          }
          try {
            prepared = await work.result;
          } finally {
            if (preparing.get(request.operationId) === work) {
              preparing.delete(request.operationId);
            }
          }
        }
        await recheckLunaSources(prepared);
        if (automatic) {
          existing = plans.get(request.operationId)!;
          existing.conversation = true;
        }
        if (ownerPreview) {
          const plan = plans.get(request.operationId)!;
          if (plan.started) {
            throw new ChatError("OWNER_ATTEMPT_STARTED",
              "Attempt đã bắt đầu. Không chuẩn bị hoặc gửi lại.", "none", 409);
          }
          await controller.preflight(prepared);
          // Only the server-installed owner record can issue this exact grant.
          store.authorizeOwner(prepared, identity.uid);
          plan.ownerReleased = true;
        }
        if (!automatic) {
          return {mode: "private-model", previewOnly: true,
            operationId: request.operationId,
            conversationId: request.conversationId,
            payload: prepared.payload, payloadSHA: prepared.payloadSHA,
            binding: prepared.binding,
            reservedNanoUSD: prepared.reservedNanoUSD,
            inputTokenBound: prepared.inputTokenBound,
            sourceCount: prepared.references.length,
            keyConfigured: store.configured(),
            authorizationRequired: true, automaticRetries: false,
            actualExecutionEligible: false, publicDelivery: false,
            ...(ownerPreview ? {ownerAuthorized: true, executionAvailable: true,
              ownerRequest: request} : {})};
        }
      }
      if (!existing || now() - existing.at > 1800000) {
        throw new ChatError("RESULT_UNKNOWN",
          "Không còn xác định được lượt trước. Không tự tạo lại phản hồi.",
          "none", 409);
      }
      if (!existing.started && !existing.conversation &&
          !store.authorized(existing.prepared)) {
        throw new ChatError("AUTHORIZATION_REQUIRED",
          "Con cần duyệt đúng nội dung và chi phí trước khi gửi. " +
          "Chưa có yêu cầu nào tới OpenAI.", "replay", 403);
      }
      const kind = existing.started ? "replay" : "send";
      existing.started = true;
      try {
        const response = await facade.handle({...request, kind}, identity, ip);
        return automatic ? {response, diagnostics: {
          budget: conversation!.status(identity.uid),
          operationId: request.operationId,
          payloadSHA: existing.prepared.payloadSHA,
          binding: existing.prepared.binding,
          sourceCount: existing.prepared.references.length,
          controller: controller.evidence().filter((e) =>
            e.operationId === request.operationId).map((e) => ({
            phase: e.phase, operationId: e.operationId, binding: e.binding,
            payloadSHA: e.payloadSHA, checksExecuted: e.checks_executed,
            validatedSHA: e.validated_sha256,
            actualExecutionEligible: e.actual_execution_eligible,
          })),
          references: existing.prepared.references.map(({documentId,
            version, hash, sectionId, sectionHash}) => ({documentId,
            version, hash, sectionId, sectionHash}))}} : response;
      } catch (error) {
        if (existing.conversation) {
          conversation!.failed(existing.prepared, error);
          const held = (error as {cause?: {cause?: unknown}}).cause?.cause;
          if (held instanceof ChatError) {
            throw new ChatError(held.code, held.message, "none", held.status);
          }
        }
        if ((existing.ownerReleased || existing.conversation) &&
            error instanceof ChatError) {
          throw new ChatError(error.code, error.message, "none", error.status);
        }
        throw error;
      }
    },
  };
  const operations = new Map<string, {uid: string; fingerprint: string;
    result: Promise<object>}>();
  return {...handlers,
    async handlePrivate(data: unknown, identity: Identity,
      ip: string): Promise<object> {
      if (!record(data) || data.kind !== "conversation") {
        return handlers.handlePrivate(data, identity, ip);
      }
      exactKeys(data, ["kind", "request"]);
      validateRequest(data.request);
      if (process.env.INSPIRE_PRIVATE_CONVERSATION === "1" &&
          !(await knowledgeReadiness()).ready) {
        throw new ChatError("KNOWLEDGE_NOT_READY",
          "Kho tri thức chưa sẵn sàng. Chưa gửi tới AI.", "none", 503);
      }
      const request = data.request;
      const fingerprint = JSON.stringify({...request, kind: "send"});
      const previous = operations.get(request.operationId);
      if (previous) {
        if (previous.uid !== identity.uid ||
            previous.fingerprint !== fingerprint) {
          throw new ChatError("OPERATION_CONFLICT", "Lượt gửi không khớp.");
        }
        return previous.result;
      }
      if (request.kind === "replay") {
        throw new ChatError("RESULT_UNKNOWN",
          "Không còn kết quả để đối chiếu. Không tự tạo lại.", "none", 409);
      }
      if (operations.size >= 1000) {
        throw new ChatError("CAPACITY", "Phòng trò chuyện đang đầy.");
      }
      // Register before account/retrieval IO, including pending replays.
      const input = structuredClone(data);
      const result = Promise.resolve().then(async () => {
        await conversation?.migrateIdentity?.(identity.uid);
        conversation?.permit(identity.uid, request);
        return handlers.handlePrivate(input, identity, ip);
      });
      operations.set(request.operationId, {uid: identity.uid,
        fingerprint, result});
      return result;
    },
  };
}
