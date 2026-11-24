import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {createHash} from "node:crypto";
import {ChatError, exactKeys, record} from "./inspireChatContract";
import type {ChatRequest} from "./inspireChatContract";

export type Identity = {
  uid: string; registered: boolean; providers: string[];
  email: string | null; createdAt: string;
};
export type Preferences = {
  name: string; address: string; language: string; ageRange: string;
  context: string; desiredSupport: string;
};
export const emptyPreferences: Preferences = {
  name: "", address: "", language: "", ageRange: "",
  context: "", desiredSupport: "",
};

/**
 * Compute the Vietnam calendar month without a browser clock or reset job.
 * @param {number} time Server milliseconds since epoch.
 * @return {object} Month key and next midnight reset in UTC.
 */
export function vietnamMonth(time: number) {
  const date = new Date(time + 7 * 3600000);
  const year = date.getUTCFullYear(); const month = date.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    nextReset: new Date(Date.UTC(year, month + 1, 1) - 7 * 3600000)
      .toISOString(),
  };
}

/**
 * Derive identity from verified Auth records, never payload flags.
 * @param {string} token Firebase ID token.
 * @return {Promise<Identity>} Current verified account metadata.
 */
export async function verifiedIdentity(token: string): Promise<Identity> {
  try {
    const claims = await getAuth().verifyIdToken(token, true);
    const user = await getAuth().getUser(claims.uid);
    if (user.disabled) throw Error("disabled");
    const providers = user.providerData.map((provider) => provider.providerId);
    return {
      uid: user.uid, registered: providers.length > 0,
      providers, email: user.email ?? null,
      createdAt: user.metadata.creationTime,
    };
  } catch {
    throw new ChatError("UNAUTHENTICATED",
      "Vui lòng kết nối lại hoặc đăng nhập để tiếp tục.", "none", 401);
  }
}

/**
 * Allow only optional, user-stated profile fields.
 * @param {unknown} value Untrusted preferences object.
 */
export function validatePreferences(
  value: unknown,
): asserts value is Preferences {
  if (!record(value)) {
    throw new ChatError("PROFILE", "Thông tin tùy chọn không hợp lệ.");
  }
  exactKeys(value, Object.keys(emptyPreferences));
  for (const key of Object.keys(emptyPreferences)) {
    const limit = key === "context" || key === "desiredSupport" ? 1000 : 100;
    if (typeof value[key] !== "string" ||
        (value[key] as string).length > limit) {
      throw new ChatError("PROFILE",
        "Thông tin tùy chọn quá dài hoặc không hợp lệ.");
    }
  }
  if (!["", "under18", "18-29", "30-44", "45-59", "60+"]
    .includes(value.ageRange as string)) {
    throw new ChatError("PROFILE", "Khoảng tuổi không hợp lệ.");
  }
}

/** Server-owned account metadata and atomic completed-reply accounting. */
export class AccountService {
  /** Construct with an injectable server clock. */
  constructor(private now: () => number = Date.now) {}

  /**
   * Select the bucket from verified registration status.
   * @param {Identity} identity Verified caller.
   * @return {string} Lifetime guest or Vietnam month key.
   */
  private period(identity: Identity) {
    return identity.registered ? vietnamMonth(this.now()).key : "guest";
  }

  /**
   * Construct server-only references without client-supplied paths.
   * @param {Identity} identity Verified caller.
   * @param {string} operationId Opaque operation reference.
   * @return {object} Account, alias, period and operation references.
   */
  private refs(identity: Identity, operationId?: string) {
    const db = getFirestore(); const period = this.period(identity);
    const account = db.collection("inspireAccounts").doc(identity.uid);
    const operationKey = createHash("sha256")
      .update(identity.uid + ":" + operationId).digest("hex");
    return {
      account,
      alias: db.collection("inspireIdentityLinks").doc(identity.uid),
      usage: account.collection("usage").doc(period),
      pendingState: account.collection("quotaState").doc("registered"),
      operation: db.collection("inspireOperations").doc(operationKey),
      period,
    };
  }

  /**
   * Return only the verified owner's account, quota and optional preferences.
   * @param {Identity} identity Verified caller.
   * @return {Promise<object>} Account view with server-computed allowance.
   */
  async account(identity: Identity) {
    const refs = this.refs(identity); const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const alias = await tx.get(refs.alias);
      if (alias.exists && !identity.registered) {
        throw new ChatError("ACCOUNT_LINKED",
          "Danh tính khách này đã liên kết tài khoản. Vui lòng đăng nhập.",
          "none", 403);
      }
      tx.set(refs.account, {
        uid: identity.uid, registered: identity.registered,
        providers: identity.providers, email: identity.email,
        authCreatedAt: identity.createdAt,
        updatedAt: Timestamp.fromMillis(this.now()),
      }, {merge: true});
    });
    const [usage, preferences, pendingState] = await Promise.all([
      refs.usage.get(),
      db.collection("inspirePreferences").doc(identity.uid).get(),
      refs.pendingState.get(),
    ]);
    const completed = usage.data()?.completed ?? 0;
    const reserved = identity.registered ?
      pendingState.data()?.pending ?? 0 : usage.data()?.reserved ?? 0;
    const limit = identity.registered ? 30 : 10;
    return {
      uid: identity.uid, registered: identity.registered, email: identity.email,
      providers: identity.providers,
      quota: {
        limit, completed, pending: reserved,
        remaining: Math.max(0, limit - completed - reserved),
        period: refs.period,
        nextReset: identity.registered ?
          vietnamMonth(this.now()).nextReset : null,
      },
      preferences: preferences.exists ?
        preferences.data() as Preferences : {...emptyPreferences},
    };
  }

  /**
   * Save only the authenticated owner's allowlisted preferences.
   * @param {Identity} identity Verified caller.
   * @param {unknown} value Untrusted optional fields.
   * @return {Promise<Preferences>} Validated user-stated fields.
   */
  async savePreferences(identity: Identity, value: unknown) {
    validatePreferences(value);
    await getFirestore().collection("inspirePreferences")
      .doc(identity.uid).set(value);
    return value;
  }

  /**
   * Link a guest using proof of both identities without transferring balance.
   * @param {Identity} current Verified registered caller.
   * @param {string} previousToken Previous guest's ID token.
   */
  async linkGuest(current: Identity, previousToken: string) {
    if (!current.registered) {
      throw new ChatError("LINK",
        "Cần đăng nhập tài khoản để liên kết.", "none", 403);
    }
    const old = await verifiedIdentity(previousToken);
    if (old.uid === current.uid) return;
    if (old.registered) {
      throw new ChatError("LINK",
        "Không thể gộp hai tài khoản đã đăng ký.", "none", 403);
    }
    const ref = getFirestore().collection("inspireIdentityLinks").doc(old.uid);
    await getFirestore().runTransaction(async (tx) => {
      const prior = await tx.get(ref);
      if (prior.exists && prior.data()?.linkedTo !== current.uid) {
        throw new ChatError("LINK",
          "Danh tính đã liên kết với tài khoản khác.", "none", 409);
      }
      tx.set(ref, {
        linkedTo: current.uid, linkedAt: Timestamp.fromMillis(this.now()),
      });
    });
  }

  /**
   * Atomically reserve capacity and reject previously recorded operations.
   * @param {Identity} identity Verified caller.
   * @param {ChatRequest} request Validated request.
   */
  async reserve(identity: Identity, request: ChatRequest) {
    const refs = this.refs(identity, request.operationId);
    const db = getFirestore();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(request)).digest("hex");
    await db.runTransaction(async (tx) => {
      const [operation, usage, alias, state] = await Promise.all([
        tx.get(refs.operation), tx.get(refs.usage),
        tx.get(refs.alias), tx.get(refs.pendingState),
      ]);
      if (alias.exists && !identity.registered) {
        throw new ChatError("ACCOUNT_LINKED",
          "Vui lòng đăng nhập tài khoản đã liên kết.", "none", 403);
      }
      if (operation.exists) {
        const previous = operation.data()!;
        if (previous.fingerprint !== fingerprint) {
          throw new ChatError("OPERATION_CONFLICT",
            "Mã lượt gửi đã được dùng cho nội dung khác.", "none", 409);
        }
        throw new ChatError("RESULT_UNAVAILABLE",
          "Lượt gửi đã được ghi nhận nhưng kết quả không còn " +
          "trong phiên này. " +
          "Không tự chạy lại hoặc tính thêm lượt.", "none", 409);
      }
      const completed = usage.data()?.completed ?? 0;
      const reserved = usage.data()?.reserved ?? 0;
      const pending = identity.registered ?
        state.data()?.pending ?? 0 : reserved;
      if (completed + pending >= (identity.registered ? 30 : 10)) {
        const message = identity.registered ?
          "Bạn đã dùng hết lượt phản hồi của tháng này, " +
          "hoặc có lượt đang chờ xác minh." :
          "Bạn đã dùng hết 10 lượt khách, hoặc có lượt đang chờ xác minh. " +
          "Đăng nhập để dùng hạn mức tài khoản.";
        throw new ChatError("QUOTA_EXHAUSTED", message, "new-attempt", 429);
      }
      tx.set(refs.usage, {
        completed, reserved: reserved + 1, period: refs.period,
      });
      if (identity.registered) {
        tx.set(refs.pendingState, {pending: pending + 1});
      }
      tx.create(refs.operation, {
        uid: identity.uid, period: refs.period, fingerprint,
        epoch: request.epoch, status: "pending",
        createdAt: Timestamp.fromMillis(this.now()),
      });
    });
  }

  /**
   * Idempotently settle a trusted outcome, retaining unknown reservations.
   * @param {Identity} identity Verified operation owner.
   * @param {string} operationId Opaque operation reference.
   * @param {string} outcome Trusted completion/failure or unknown state.
   */
  async settle(
    identity: Identity, operationId: string,
    outcome: "completed" | "failed" | "unknown",
  ) {
    const {operation} = this.refs(identity, operationId);
    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(operation);
      if (!snap.exists || snap.data()?.uid !== identity.uid) {
        throw new ChatError("OPERATION",
          "Không xác minh được lượt gửi.", "none", 409);
      }
      const data = snap.data()!;
      if (["completed", "failed"].includes(data.status)) {
        if (data.status !== outcome) {
          throw new ChatError("RECONCILIATION",
            "Kết quả cần được xác minh riêng.", "none", 409);
        }
        return;
      }
      const account = db.collection("inspireAccounts").doc(identity.uid);
      const usage = account.collection("usage").doc(data.period);
      const stored = await tx.get(usage);
      const completed = stored.data()?.completed ?? 0;
      const reserved = stored.data()?.reserved ?? 0;
      const registered = data.period !== "guest";
      const chargedPeriod = registered ? vietnamMonth(this.now()).key : "guest";
      const chargedUsage = account.collection("usage").doc(chargedPeriod);
      const charged = chargedPeriod === data.period ?
        stored : await tx.get(chargedUsage);
      const pendingRef = account.collection("quotaState").doc("registered");
      const state = registered ? await tx.get(pendingRef) : undefined;
      tx.update(operation, {
        status: outcome, updatedAt: Timestamp.fromMillis(this.now()),
        ...(outcome === "completed" ? {chargedPeriod} : {}),
      });
      if (outcome !== "unknown") {
        tx.set(usage, {
          period: data.period,
          completed: completed +
            (outcome === "completed" && chargedPeriod === data.period ? 1 : 0),
          reserved: Math.max(0, reserved - 1),
        });
        if (outcome === "completed" && chargedPeriod !== data.period) {
          tx.set(chargedUsage, {
            period: chargedPeriod,
            completed: (charged.data()?.completed ?? 0) + 1,
            reserved: charged.data()?.reserved ?? 0,
          });
        }
        if (registered) {
          tx.set(pendingRef, {
            pending: Math.max(0, (state?.data()?.pending ?? 0) - 1),
          });
        }
      }
    });
  }
}
