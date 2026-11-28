/** Private session accounting; authority is local operator data, never HTTP. */
import {existsSync, readFileSync, openSync, writeSync, closeSync, fsyncSync,
  mkdirSync, unlinkSync, realpathSync, renameSync} from "node:fs";
import {getFirestore} from "firebase-admin/firestore";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {ChatError, exactKeys, record} from "./inspireChatContract";
import type {ChatRequest} from "./inspireChatContract";
import {LUNA_API, lunaHash, lunaLocalDirectory} from "./inspireLunaApi";
import type {LunaPrepared} from "./inspireLunaApi";

type Authority = {schema: string; sessionId: string; approved: boolean;
  purpose: "verification" | "father"; uid: string | null;
  maxAttempts: number; maxCostNanoUSD: number; expiresAt: string | null;
  messagesSHA: string | null; ownerDecision: string; model: string};
type Entry = {type: string; operationId: string; binding: string;
  contentSHA?: string; hold?: number; [key: string]: unknown};

/** New session grants never consult or reset any legacy one-attempt grant.
 * @param {string} directory Nonsynced operator-owned session directory.
 * @param {function(): number} now Trusted server clock.
 * @return {object} Durable reservations and safe diagnostics.
 */
export function lunaSessionBudget(directory =
join(lunaLocalDirectory(), "private-session"), now = Date.now) {
  const hold = (code: string, message: string, status = 403): never => {
    throw new ChatError(code, message, "none", status);
  };
  const authority = (): Authority => {
    if (process.env.NODE_ENV === "production") {
      return hold("PRODUCTION_CLOSED", "AI công khai vẫn đóng.");
    }
    let value: unknown;
    try {
      const actual = realpathSync(directory);
      if (actual.toLowerCase() !== resolve(directory).toLowerCase() ||
          /onedrive|dropbox|google drive|\\\\/i.test(actual)) throw Error();
      value = JSON.parse(readFileSync(join(directory, "policy.json"), "utf8"));
    } catch {
      return hold("SESSION_NOT_RELEASED",
        "Phiên AI riêng chưa được mở. Nhờ con kiểm tra giúp.");
    }
    if (!record(value)) return hold("SESSION_POLICY_HOLD", "Hồ sơ phiên sai.");
    exactKeys(value, ["schema", "sessionId", "approved", "purpose", "uid",
      "maxAttempts", "maxCostNanoUSD", "expiresAt", "messagesSHA",
      "ownerDecision", "model"]);
    const p = value as Authority;
    if (p.schema !== "inspire-private-budget-v1" || p.approved !== true ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(p.sessionId) ||
        !["verification", "father"].includes(p.purpose) ||
        (p.uid !== null && typeof p.uid !== "string") ||
        !Number.isSafeInteger(p.maxAttempts) || p.maxAttempts < 1 ||
        p.maxAttempts > 1000 || !Number.isSafeInteger(p.maxCostNanoUSD) ||
        p.maxCostNanoUSD < 1 || !p.ownerDecision?.trim() ||
        p.model !== LUNA_API.model ||
        !(p.purpose === "father" && p.expiresAt === null ||
          typeof p.expiresAt === "string" &&
          now() < Date.parse(p.expiresAt)) ||
        now() >= Date.parse(LUNA_API.pricingExpires) ||
        (p.purpose === "verification" &&
          (p.maxAttempts !== 1 || p.maxCostNanoUSD > 10000000 ||
            !p.uid || !/^[a-f0-9]{64}$/.test(p.messagesSHA ?? "")))) {
      return hold("SESSION_POLICY_HOLD",
        "Phiên AI chưa có quyền hoặc giới hạn còn hiệu lực.");
    }
    return p;
  };
  const folder = (p: Authority) => {
    const dir = join(directory, p.sessionId);
    if (!existsSync(dir)) mkdirSync(dir, {mode: 0o700});
    if (realpathSync(dir).toLowerCase() !== resolve(dir).toLowerCase()) {
      return hold("SESSION_STORAGE_HOLD", "Kho phiên không hợp lệ.");
    }
    return dir;
  };
  const entries = (p: Authority): Entry[] => {
    const file = join(folder(p), "events.jsonl");
    if (!existsSync(file)) return [];
    const text = readFileSync(file, "utf8");
    if (!text.endsWith("\n")) {
      return hold("SESSION_STORAGE_HOLD", "Sổ phiên cần đối soát.");
    }
    let previous = "0";
    return text.trimEnd().split("\n").map((line) => {
      const packet = JSON.parse(line);
      const bytes = JSON.stringify([previous, packet.event]);
      if (packet.sha !== lunaHash(bytes)) {
        return hold("SESSION_STORAGE_HOLD", "Sổ phiên không toàn vẹn.");
      }
      previous = packet.sha;
      return packet.event as Entry;
    });
  };
  const append = (p: Authority, event: Entry) => {
    const file = join(folder(p), "events.jsonl");
    const old = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = old.trimEnd().split("\n");
    const previous = old ? JSON.parse(lines[lines.length - 1]).sha : "0";
    const fd = openSync(file, "a", 0o600);
    try {
      writeSync(fd, JSON.stringify({event,
        sha: lunaHash(JSON.stringify([previous, event]))}) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const locked = <T>(p: Authority, action: (all: Entry[]) => T): T => {
    const file = join(folder(p), "writer.lock");
    let fd: number;
    try {
      fd = openSync(file, "wx", 0o600);
    } catch {
      return hold("SESSION_STORAGE_LOCKED",
        "Sổ phiên đang bận hoặc cần đối soát. Không tự gửi lại.");
    }
    try {
      return action(entries(p));
    } finally {
      closeSync(fd); unlinkSync(file);
    }
  };
  const permit = (uid: string, request?: ChatRequest) => {
    const p = authority();
    const file = join(folder(p), "identity.json");
    if (p.uid !== null && p.uid !== uid) {
      return hold("SESSION_IDENTITY",
        "Phiên AI cho tài khoản này chưa được mở. Nhờ con kiểm tra giúp.");
    }
    if (p.uid === null && !existsSync(file)) {
      try {
        const fd = openSync(file, "wx", 0o600);
        try {
          writeSync(fd, JSON.stringify({uid})); fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (p.uid === null && JSON.parse(readFileSync(file, "utf8")).uid !== uid) {
      return hold("SESSION_IDENTITY", "Phiên đã gắn với tài khoản khác.");
    }
    if (request && p.messagesSHA &&
        lunaHash(JSON.stringify(request.messages)) !== p.messagesSHA) {
      return hold("SESSION_SCOPE", "Lượt này ngoài phạm vi xác minh đã cấp.");
    }
    return p;
  };
  const migrationFile = join(directory, "uid-migration.json");
  const migration = (p: Authority, uid: string) => {
    if (!existsSync(migrationFile)) return null;
    const m = JSON.parse(readFileSync(migrationFile, "utf8"));
    if (m.fromUID === uid) return null;
    if (m.schema !== "inspire-owner-uid-migration-v1" ||
        m.approved !== true || m.sessionId !== p.sessionId ||
        p.purpose !== "father" || !m.ownerDecision ||
        (m.toUID !== null && m.toUID !== uid) || m.phase === "complete") {
      return null;
    }
    if (lunaHash(readFileSync(join(folder(p), "events.jsonl"), "utf8")) !==
        m.ledgerSHA) return null;
    const current = JSON.parse(readFileSync(join(folder(p),
      "identity.json"), "utf8")).uid;
    return current === m.fromUID || current === m.toUID ? m : null;
  };
  const atomic = (file: string, value: unknown) => {
    const pending = file + ".pending";
    const fd = openSync(pending, "wx", 0o600);
    try {
      writeSync(fd, JSON.stringify(value)); fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(pending, file);
  };
  const event = (prepared: LunaPrepared, type: string,
    details: Record<string, unknown> = {}) => {
    const p = authority();
    locked(p, (all) => {
      const first = all.find((e) => e.type === "reserve" &&
        e.operationId === prepared.request.operationId);
      if (!first || first.binding !== prepared.binding) {
        return hold("SESSION_BINDING", "Lượt gửi không khớp sổ phiên.");
      }
      append(p, {type, operationId: prepared.request.operationId,
        binding: prepared.binding, ...details});
    });
  };
  return {
    permit,
    async assertUnsent(uid: string, operationId: string) {
      const p = permit(uid);
      if (entries(p).some((e) => e.type === "reserve" &&
          e.operationId === operationId)) {
        return hold("RESULT_UNKNOWN", "Lượt này đã có dự phòng. " +
          "Không tự gọi lại OpenAI.", 409);
      }
      const owners = [uid];
      if (existsSync(migrationFile)) {
        const m = JSON.parse(readFileSync(migrationFile, "utf8"));
        if (m.sessionId === p.sessionId && m.toUID === uid) {
          owners.push(m.fromUID);
        }
      }
      for (const owner of owners) {
        const op = await getFirestore().doc("inspireOperations/" +
          lunaHash(owner + ":" + operationId)).get();
        if (op.exists) {
          return hold("RESULT_UNKNOWN",
            "Lượt này đã được ghi nhận. Không tạo lại phản hồi.", 409);
        }
      }
    },
    async migrateIdentity(uid: string) {
      const p = authority();
      const m = migration(p, uid);
      if (!m) return;
      const lock = join(folder(p), "writer.lock");
      const fd = openSync(lock, "wx", 0o600);
      try {
        // Durable target selection precedes all writes. A crash can only resume
        // this same UID; another browser cannot consume the migration again.
        if (m.toUID === null) {
          m.toUID = uid; m.phase = "selected"; atomic(migrationFile, m);
        }
        const db = getFirestore();
        const marker = db.doc("inspireUIDMigrations/" +
          lunaHash(p.sessionId + ":" + m.fromUID));
        const oldUsage = db.doc("inspireAccounts/" + m.fromUID +
          "/usage/guest");
        const newUsage = db.doc("inspireAccounts/" + uid + "/usage/guest");
        const oldOps = await db.collection("inspireOperations")
          .where("uid", "==", m.fromUID).get();
        await db.runTransaction(async (tx) => {
          const [done, old, current] = await Promise.all([
            tx.get(marker), tx.get(oldUsage), tx.get(newUsage),
          ]);
          if (done.exists) {
            if (done.data()?.toUID !== uid) throw Error("MIGRATION_CONFLICT");
            return;
          }
          // Copied tombstones deny all old operation IDs under the new UID.
          // Unknown operations remain unknown; no output is regenerated.
          const ledger = entries(p).filter((e) => e.type === "reserve");
          const copies = ledger.map((e) => ({e, ref: db.doc(
            "inspireOperations/" + lunaHash(uid + ":" + e.operationId))}));
          const existing = await Promise.all(copies.map((c) => tx.get(c.ref)));
          tx.set(newUsage, {period: "guest",
            completed: (current.data()?.completed ?? 0) +
              (old.data()?.completed ?? 0),
            reserved: (current.data()?.reserved ?? 0) +
              (old.data()?.reserved ?? 0)}, {merge: true});
          copies.forEach((c, i) => {
            if (existing[i].exists) return;
            const prior = oldOps.docs.find((d) => d.id ===
              lunaHash(m.fromUID + ":" + c.e.operationId));
            tx.create(c.ref, {...(prior?.data() ?? {status: "unknown"}),
              uid, period: "guest", fingerprint: "migrated:" + c.e.binding});
          });
          tx.set(db.doc("inspireIdentityLinks/" + m.fromUID),
            {linkedTo: uid, ownerMigration: true});
          tx.create(marker, {fromUID: m.fromUID, toUID: uid,
            sessionId: p.sessionId, ledgerSHA: m.ledgerSHA});
        });
        atomic(join(folder(p), "identity.json"), {uid});
        m.phase = "complete"; atomic(migrationFile, m);
      } finally {
        closeSync(fd); unlinkSync(lock);
      }
    },
    reserve(prepared: LunaPrepared, uid: string) {
      const p = permit(uid, prepared.request);
      if (lunaHash(prepared.body) !== prepared.payloadSHA ||
          JSON.stringify(prepared.payload) !== prepared.body ||
          prepared.inputTokenBound !==
            Buffer.byteLength(prepared.body) + 4096 ||
          prepared.reservedNanoUSD !== prepared.inputTokenBound *
            LUNA_API.reserveInputNanoUSD +
            LUNA_API.maxOutputTokens * LUNA_API.outputNanoUSD ||
          prepared.binding !== lunaHash(JSON.stringify([
            prepared.request, prepared.payloadSHA]))) {
        return hold("SESSION_BINDING", "Nội dung lượt gửi đã thay đổi.");
      }
      const contentSHA = lunaHash(JSON.stringify(prepared.request.messages
        .map((m) => [m.role, m.text, m.correctionOf ?
          prepared.request.messages.findIndex((x) =>
            x.id === m.correctionOf) : null])));
      const totalHold = prepared.reservedNanoUSD +
        prepared.inputTokenBound * LUNA_API.reserveInputNanoUSD;
      const key = process.env.OPENAI_API_KEY?.trim() ?? "";
      if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
        return hold("OPENAI_AUTH", "Khóa API chưa được cấu hình hợp lệ.");
      }
      locked(p, (all) => {
        const reserved = all.filter((e) => e.type === "reserve");
        if (reserved.some((e) => e.operationId ===
            prepared.request.operationId || (e.contentSHA === contentSHA &&
              !all.some((v) => v.type === "validated" &&
                v.operationId === e.operationId)))) {
          return hold("OUTCOME_UNKNOWN",
            "Lượt trước đã được giữ. Không tự tạo lại kết quả.", 409);
        }
        const held = reserved.reduce((n, e) => n + Number(e.hold), 0);
        if (reserved.length >= p.maxAttempts) {
          return hold("SESSION_ATTEMPTS_EXHAUSTED",
            "Phiên đã dùng hết số lượt AI được cấp.", 429);
        }
        if (held + totalHold > p.maxCostNanoUSD) {
          return hold("SESSION_BUDGET_EXHAUSTED",
            "Ngân sách còn lại không đủ dự phòng cho câu hỏi này. " +
            "Chưa gửi tới OpenAI.", 429);
        }
        append(p, {type: "reserve", operationId: prepared.request.operationId,
          binding: prepared.binding, contentSHA, hold: totalHold,
          payloadSHA: prepared.payloadSHA,
          sourceCount: prepared.references.length,
          references: prepared.references.map(({documentId, version, hash,
            sectionId, sectionHash}) => ({documentId, version, hash,
            sectionId, sectionHash})), at: now()});
      });
      return key;
    },
    counted(prepared: LunaPrepared, input: number) {
      if (!Number.isSafeInteger(input) || input < 0 ||
          input > prepared.inputTokenBound) {
        return hold("TOKEN_BOUND_HOLD", "Input vượt dự phòng. Chưa gọi AI.");
      }
      event(prepared, "counted", {inputTokens: input});
    },
    dispatch: (prepared: LunaPrepared) => event(prepared, "dispatch"),
    provider(prepared: LunaPrepared, raw: unknown) {
      const r = record(raw) ? raw : {};
      const usage = record(r.usage) ? r.usage : {};
      const details = record(usage.input_tokens_details) ?
        usage.input_tokens_details : {};
      const number = (n: unknown) =>
        Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : null;
      event(prepared, "provider", {status: r.status, responseId: r.id,
        inputTokens: number(usage.input_tokens),
        outputTokens: number(usage.output_tokens),
        cachedTokens: number(details.cached_tokens),
        cacheWriteTokens: number(details.cache_write_tokens),
        candidateEnvelopeSHA: lunaHash(JSON.stringify(raw))});
      if (number(usage.input_tokens) === null ||
          Number(usage.input_tokens) > prepared.inputTokenBound ||
          number(usage.output_tokens) === null ||
          Number(usage.output_tokens) > LUNA_API.maxOutputTokens) {
        return hold("USAGE_ACCOUNTING_HOLD",
          "Số token provider trả về không khớp dự phòng.", 503);
      }
    },
    quarantine(prepared: LunaPrepared, raw: unknown) {
      const child = spawnSync(process.env.INSPIRE_CONTROLLER_PYTHON ||
        resolve(".tools.local/python312/python.exe"), ["-X", "utf8",
        resolve("functions/inspire_luna_output.py")], {
        windowsHide: true, encoding: "utf8", timeout: 20000,
        input: JSON.stringify({action: "store", key: prepared.binding,
          value: raw}), maxBuffer: 1000000,
        env: {SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
          TEMP: process.env.TEMP, TMP: process.env.TMP,
          PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8"},
      });
      if (child.status !== 0) {
        return hold("QUARANTINE_HOLD",
          "Chưa lưu riêng được kết quả. Không tự gọi lại AI.", 503);
      }
    },
    validated: (prepared: LunaPrepared, text: string) =>
      event(prepared, "validated", {outputSHA: lunaHash(text)}),
    failed(prepared: LunaPrepared, error: unknown) {
      try {
        const detail = (error as {cause?: {providerStatus?: unknown;
          providerCode?: unknown}})?.cause;
        event(prepared, "held", {code: error instanceof ChatError ?
          error.code : "OUTCOME_UNKNOWN",
        providerStatus: typeof detail?.providerStatus === "number" ?
          detail.providerStatus : null,
        providerCode: typeof detail?.providerCode === "string" ?
          detail.providerCode : null});
      } catch {/* A durable reserve remains held on any storage failure. */}
    },
    status(uid?: string) {
      try {
        const p = authority(); const all = entries(p);
        const reserved = all.filter((e) => e.type === "reserve");
        const identityFile = join(folder(p), "identity.json");
        const allowed = uid && (p.uid === uid || (p.uid === null &&
          (!existsSync(identityFile) ||
            JSON.parse(readFileSync(identityFile, "utf8")).uid === uid)));
        const providers = all.filter((e) => e.type === "provider");
        const validations = all.filter((e) => e.type === "validated");
        const held = all.filter((e) => e.type === "held");
        const pendingMigration = !allowed && !!uid && !!migration(p, uid);
        const heldTotal = reserved.reduce((n, e) => n + Number(e.hold), 0);
        const exhausted = reserved.length >= p.maxAttempts ?
          "SESSION_ATTEMPTS_EXHAUSTED" : heldTotal >= p.maxCostNanoUSD ?
            "SESSION_BUDGET_EXHAUSTED" : null;
        return {released: !!allowed && !exhausted,
          ...(pendingMigration ? {pendingMigration: true} : {}),
          ...(exhausted ? {reason: exhausted} : {}),
          ...(!allowed && !pendingMigration ? {reason: uid ?
            "SESSION_IDENTITY" :
            "IDENTITY_REQUIRED"} : {}), purpose: p.purpose,
          maxAttempts: p.maxAttempts,
          expiresAt: p.expiresAt,
          reservedAttempts: reserved.length,
          generationDispatches: all.filter((e) => e.type === "dispatch").length,
          budgetNanoUSD: p.maxCostNanoUSD,
          heldNanoUSD: reserved.reduce((n, e) => n + Number(e.hold), 0),
          lastProvider: providers[providers.length - 1],
          lastValidation: validations[validations.length - 1],
          lastHeld: held[held.length - 1]};
      } catch (error) {
        return {released: false,
          reason: error instanceof ChatError ? error.code :
            "SESSION_STORAGE_HOLD",
          message: error instanceof ChatError ? error.message :
            "Không đọc được hồ sơ phiên riêng."};
      }
    },
  };
}
