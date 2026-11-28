/** Internal emulator-only shelf. No HTTP route, sender or grant writer.
 * Authentication, review scope and source export are independent gates.
 */
import {createHash} from "node:crypto";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {verifiedIdentity} from "./inspireAccount";
import {requireLocalEmulators} from "./inspireLocalService";
import {exactKeys, record, validateMessages} from "./inspireChatContract";
import {retrieveKnowledge, assertKnowledgeExport} from "./inspireKnowledge";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** Prepare data for server-side offline inspection only.
 * @param {string} token Firebase emulator credential, not a body field.
 * @param {unknown} input Only ordered messages. Scope comes from the server.
 * @return {Promise<object>} Internal untrusted references, never permissions.
 */
export async function stageReviewExtracts(token: string, input: unknown) {
  requireLocalEmulators();
  const db = getFirestore();
  let subject = "unverified";
  const audit = (decision: string, hashes: string[]) =>
    db.collection("inspireReviewAudit").add({subject, decision, hashes,
      at: FieldValue.serverTimestamp(), purpose: "local-synthetic-review"});
  try {
    const identity = await verifiedIdentity(token);
    subject = hash(identity.uid);
    if (!record(input)) throw Error("REVIEW_INPUT_HOLD");
    exactKeys(input, ["messages"]);
    validateMessages(input.messages);
    const ref = db.doc("inspireReviewReaders/" + subject);
    const readGrant = async () => {
      const grant = (await ref.get()).data();
      if (!grant || grant.uid !== identity.uid || grant.active !== true ||
          grant.purpose !== "local-synthetic-review" ||
          grant.nonConfidential !== true ||
          !Number.isSafeInteger(grant.until) ||
          grant.until <= Date.now() || typeof grant.documentId !== "string" ||
          !/^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/.test(grant.documentId) ||
          !Number.isSafeInteger(grant.version) || grant.version < 1 ||
          typeof grant.hash !== "string" ||
          !/^[a-f0-9]{64}$/.test(grant.hash) ||
          !Array.isArray(grant.sections) || !grant.sections.length ||
          !grant.sections.every((s: unknown) =>
            typeof s === "string" && /^[a-f0-9]{64}$/.test(s))) {
        throw Error("REVIEW_SCOPE_HOLD");
      }
      return grant;
    };
    const grant = await readGrant();
    const selected = (await retrieveKnowledge(input.messages, true,
      grant.documentId)).filter((s) => s.hash === grant.hash &&
      s.version === grant.version && s.documentId === grant.documentId &&
      grant.sections.includes(s.sectionHash));
    await assertKnowledgeExport(selected);
    const current = await readGrant();
    if (current.hash !== grant.hash || current.version !== grant.version ||
        current.documentId !== grant.documentId ||
        !selected.every((s) => current.sections.includes(s.sectionHash))) {
      throw Error("REVIEW_SCOPE_CHANGED");
    }
    await audit("staged-offline", selected.map((s) => s.sectionHash!));
    return {kind: "untrusted-reference-data", sections: selected,
      dispatchAllowed: false as const};
  } catch {
    await audit("held", []);
    throw Error("REVIEW_HELD");
  }
}
