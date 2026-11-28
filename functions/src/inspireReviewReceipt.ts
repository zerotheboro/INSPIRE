import {validateRequest} from "./inspireChatContract";

/** Browser boundary: never serialize a model envelope or source passage.
 * @param {unknown} value Server-produced held preview (or missing trace).
 * @return {object|null} Only validated scalar identifiers, counts and hashes.
 */
export function browserReceipt(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(v);
  const sha = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  if (!id(r.operationId) || !id(r.conversationId) || !sha(r.payloadSHA) ||
      !sha(r.binding) || !Number.isInteger(r.sourceCount) ||
      Number(r.sourceCount) < 0 || Number(r.sourceCount) > 3) {
    throw Error("BROWSER_RECEIPT_HOLD");
  }
  const accounting = r.accounting as Record<string, unknown> | undefined;
  if (r.ownerAuthorized === true) validateRequest(r.ownerRequest);
  return {mode: "private-model", previewOnly: true, operationId: r.operationId,
    executionAvailable: r.executionAvailable === true,
    conversationId: r.conversationId, sourceCount: r.sourceCount,
    payloadSHA: r.payloadSHA, binding: r.binding,
    actualExecutionEligible: false,
    publicDelivery: false, automaticRetries: false,
    ...(r.ownerAuthorized === true ? {ownerAuthorized: true,
      ownerRequest: structuredClone(r.ownerRequest)} : {}),
    ...(typeof r.keyConfigured === "boolean" ?
      {keyConfigured: r.keyConfigured} : {}),
    ...(accounting && Number.isInteger(accounting.used) ?
      {accounting: {used: Number(accounting.used),
        maxAttempts: accounting.maxAttempts === 50 ? 50 : 3}} : {}),
    ...(Number.isSafeInteger(r.reservedNanoUSD) ?
      {reservedNanoUSD: Number(r.reservedNanoUSD)} : {})};
}
