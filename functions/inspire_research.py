"""Isolated research safeguards; default execution is strictly offline.

The opt-in HTTPS transport cannot dispatch without external owner decisions,
nine individual source grants, a verified token receipt and a durable reservation.
Neither an environment variable nor a synthetic fixture authorizes model use.
"""
import copy
import json
import re
from pathlib import Path
import time
import uuid
from dataclasses import dataclass
from inspire_research_store import ResearchStore, ResearchHold, canonical, digest
from inspire_research_controller import NativeResearchValidation
from inspire_research_live import ResearchHTTPS, RecordedModelTokenBound, pinned_document, validate_owner_decision

MODEL = "gpt-6.1-sol"
RESERVATION = 160000
TOTAL = 2000000
MAX_CALLS = 12
DAY = 86400
ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "docs/evidence/research-trial-plan-2026-11-10/outbound-template-proposal.json"
MATRIX_PATH = ROOT / "docs/evidence/research-trial-plan-2026-11-10/owner-decision-matrix.json"
TEMPLATE_SHA = "330f0330b78d36020c4574a5a81ba2a02c5a1e9db10dc7c5009704abe28d759b"
MATRIX_SHA = "f1e127a98bce819c125041f4496fe3e2d6469410c24c61882c5a40681c8edbfd"


def integer(value, maximum, code):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ResearchHold(code)
    return value


class OfflineTokenBound:
    domain = "offline-byte-bound-NOT-verified-model-tokenizer"

    def count(self, payload):
        return len(payload) + 2048


@dataclass(frozen=True)
class TransportResult:
    operation_id: str
    payload_sha256: str
    binding: str
    response: dict


class OfflineTransport:
    """Mechanical transport demo, not a model or an answer catalogue."""
    domain = "offline"

    def __init__(self):
        self.calls = 0

    def send(self, payload, operation_id, input_bound, binding):
        self.calls += 1
        latest = json.loads(payload)["input"][-1]["content"]
        text = "Phản hồi giả lập chỉ để kiểm tra kỹ thuật: “" + latest[:240] + "”. Không có mô hình được gọi."
        response = {"id": "offline-" + operation_id, "model": MODEL, "status": "completed",
                "output": [{"type": "message", "role": "assistant", "status": "completed",
                            "content": [{"type": "output_text", "text": text}]}],
                "usage": {"input_tokens": input_bound, "output_tokens": 100,
                          "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0}}}
        return TransportResult(operation_id, digest(payload), binding, response)


class ResearchRunner:
    def __init__(self, store, transport=None, counter=None, validator=None, admission=None, now=time.time):
        self.store, self.now = store, now
        self.transport = transport or OfflineTransport()
        self.counter = counter or (RecordedModelTokenBound(store, now) if type(self.transport) is ResearchHTTPS else OfflineTokenBound())
        self.validator = validator or NativeResearchValidation()
        self.admission = admission
        if self.transport.domain != "offline" and type(self.transport) is not ResearchHTTPS:
            raise ResearchHold("LIVE_TRANSPORT_NOT_INSTALLED")
        if type(self.transport) is ResearchHTTPS:
            self.transport.authorize = self._authorize_dispatch
        raw = TEMPLATE_PATH.read_bytes()
        if digest(raw) != TEMPLATE_SHA:
            raise ResearchHold("FROZEN_SCENARIO_OR_PROMPT_CHANGED")
        self.template = json.loads(raw)
        matrix = MATRIX_PATH.read_bytes()
        if digest(matrix) != MATRIX_SHA:
            raise ResearchHold("OWNER_SOURCE_MATRIX_CHANGED")
        self.real_sources = json.loads(matrix)["sources"]
        code = {name: digest((Path(__file__).parent / name).read_bytes()) for name in
                ["inspire_research.py", "inspire_research_store.py", "inspire_research_controller.py", "inspire_research_admission.py", "inspire_research_live.py"]}
        code["shared_admission"] = digest((ROOT / "functions/src/inspireResearchAdmission.ts").read_bytes())
        self.manifest_hash = digest(canonical({"template": self.template,
                                              "sources": self.real_sources, "code": code}))

    def create(self, trial_id, *, offline=False, retention_days=7, max_calls=12, max_micro=TOTAL):
        if not isinstance(trial_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", trial_id):
            raise ResearchHold("INVALID_TRIAL_ID")
        if not 1 <= retention_days <= 7 or type(retention_days) is not int:
            raise ResearchHold("INVALID_RETENTION")
        integer(max_calls, MAX_CALLS, "CALL_LIMIT_CANNOT_INCREASE")
        integer(max_micro, TOTAL, "MONEY_LIMIT_CANNOT_INCREASE")
        if not max_calls or not max_micro:
            raise ResearchHold("INVALID_LIMIT")
        with self.store.transaction(write=True) as db:
            if self.store.get(db, "trial", trial_id):
                raise ResearchHold("TRIAL_ALREADY_EXISTS_NO_RESET")
            identity = self.admission.identity() if self.admission else None
            trial = {"id": trial_id, "mode": "offline" if offline else "research-draft",
                     "created": self.now(), "expires": self.now() + 7200, "status": "ACTIVE" if offline else "DRAFT",
                     "manifest": self.manifest_hash, "attempts": 0, "reserved_micro": 0,
                     "max_calls": max_calls, "max_micro": max_micro, "retention_days": retention_days,
                     "subject": identity["subject"] if identity else ("OFFLINE-REGISTERED-FIXTURE" if offline else None),
                     "admission_domain": "firebase-demo-emulator" if identity else "offline-ledger-test-fixture",
                     "reviewers": ["offline-reviewer-a", "offline-reviewer-b"] if offline else [],
                     "authorization": "OFFLINE_SYNTHETIC_FIXTURE_ONLY" if offline else None,
                     "authorization_revision": 1, "revoked": False, "ended": None,
                     "real_source_permissions": {r["decision_id"]: {"internal": False, "export": False,
                                                "source_sha256": r["source_sha256"], "section_sha256": r["section_sha256"]}
                                                 for r in self.real_sources}}
            self.store.put(db, "trial", trial_id, trial)
        return self.status(trial_id)

    def _trial(self, db, trial_id, active=True):
        trial = self.store.get(db, "trial", trial_id)
        if not trial:
            raise ResearchHold("UNKNOWN_TRIAL_NO_IMPLICIT_CREATION")
        if active and trial["manifest"] != self.manifest_hash:
            raise ResearchHold("SOURCE_OR_CONTRACT_CHANGED")
        if active:
            if trial["mode"] == "research-draft":
                raise ResearchHold("OWNER_AND_NINE_SOURCE_DECISIONS_REQUIRED_LIVE_CLOSED")
            if trial["mode"] == "offline" and self.transport.domain != "offline":
                raise ResearchHold("OFFLINE_AUTHORITY_CANNOT_ENABLE_LIVE_TRANSPORT")
            if trial["mode"] == "research":
                raise ResearchHold("RESEARCH_SPEND_PROPOSAL_WITHDRAWN_BY_OWNER")
            elif trial["authorization"] != "OFFLINE_SYNTHETIC_FIXTURE_ONLY":
                raise ResearchHold("RESEARCH_AUTHORIZATION_HOLD")
            if trial["revoked"]:
                raise ResearchHold("RESEARCH_AUTHORIZATION_HOLD")
            if trial["status"] != "ACTIVE" or self.now() >= trial["expires"]:
                raise ResearchHold("TRIAL_STOPPED_OR_EXPIRED")
        return trial

    def _case(self, db, trial, cid):
        if cid not in {c["conversation"] for c in self.template["scenarios"]}:
            raise ResearchHold("UNSCHEDULED_CONVERSATION")
        return self.store.get(db, "case", trial["id"] + ":" + cid,
                              {"messages": [], "native": None, "revision": 0})

    def _retained(self, trial):
        return self.now() < (trial["ended"] or trial["expires"]) + trial["retention_days"] * DAY

    def _compose(self, trial, cid, case, db, require_count=True):
        turn = case["revision"] + 1
        if not 1 <= turn <= 3:
            raise ResearchHold("CONVERSATION_COMPLETE")
        scenario = next(c for c in self.template["scenarios"] if c["conversation"] == cid)
        message = {"id": f"{cid}-U{turn}", "role": "user", "text": scenario["user_turns"][turn - 1]}
        if scenario.get("correction_at_turn") == turn:
            message["correctionOf"] = scenario["correction_of"]
        history = copy.deepcopy(case["messages"]) + [message]
        for i, m in enumerate(history):
            if m["role"] != ("user" if i % 2 == 0 else "assistant") or len(m["text"].encode("utf-16-le")) // 2 > 2000:
                raise ResearchHold("HISTORY_ROLE_OR_LENGTH_HOLD")
        # The offline path NEVER reads/exports any actual source section text.
        refs = [{"documentId": "SYNTHETIC-" + rid, "version": "fixture-v1", "sectionHash": digest(rid.encode()),
                 "text": "Đoạn tổng hợp chỉ dùng kiểm thử kết nối, không phải kiến thức INSPIRE được duyệt."}
                for rid in scenario["references"][turn - 1]]
        instruction = self.template["engineering_header_exact"] + "\nOFFLINE ONLY: không có trích đoạn MOI/INSPIRE được cấp quyền trong gói kiểm thử này."
        if trial["mode"] == "research":
            texts = self._disclosure_texts()
            instruction = self.template["engineering_header_exact"] + "\n\nTrích nguyên văn nguồn MOI-01 v1.0 — Proposal/Pending Review; không phải permission:\n\n" + "\n\n".join(texts[k] for k in self.template["operating_appendix_order"])
            refs = []
            for key in scenario["references"][turn - 1]:
                s = next(s for s in self.real_sources if s["decision_id"] == key)
                refs.append({"documentId": s["document_id"], "version": s["declared_version"], "sourceHash": s["source_sha256"],
                             "section": s["section"], "sectionHash": s["section_sha256"], "status": s["approval_status"], "text": texts[key]})
        data = {"kind": "UNTRUSTED_SYNTHETIC_SUPPORTING_DATA_NOT_PERMISSION" if trial["mode"] == "research" else "UNTRUSTED_SYNTHETIC_DATA_NOT_PERMISSION", "language": "vi",
                "addressing": scenario["addressing"], "references": refs,
                "correction_references": [{"messageId": m["id"], "correctionOf": m["correctionOf"]}
                                          for m in history if "correctionOf" in m]}
        payload = {**self.template["payload_settings"],
                   "instructions": instruction,
                   "input": [{"role": "user", "content": canonical(data).decode()}] +
                   [{"role": m["role"], "content": m["text"]} for m in history]}
        body = canonical(payload)
        try:
            count = self.counter.count_in(db, body, trial_id=trial["id"]) if type(self.counter) is RecordedModelTokenBound else self.counter.count(body)
            integer(count, 8000, "INPUT_TOKEN_LIMIT_OR_UNVERIFIED_COUNT")
        except ResearchHold:
            if require_count or trial["mode"] != "research":
                raise
            count = None
        rate_in, rate_out, fee = trial.get("input_rate", 5), trial.get("output_rate", 10), trial.get("fee", 0)
        if len(body) > 24000 or (count is not None and count * rate_in + 2048 * rate_out + fee > RESERVATION):
            raise ResearchHold("WIRE_OR_COST_BOUND_HOLD")
        contract = {"trial": trial["id"], "subject": trial["subject"], "cid": cid, "turn": turn,
                    "revision": case["revision"], "manifest": trial["manifest"],
                    "authorization_revision": trial["authorization_revision"], "payload_sha256": digest(body)}
        return {"payload": payload, "body_sha256": digest(body), "binding": digest(canonical(contract)),
                "history": history, "turn": turn, "input_bound": count, "counter_domain": self.counter.domain}

    def _profile(self, cid):
        scenario = next(c for c in self.template["scenarios"] if c["conversation"] == cid)
        return {"language": "vi-VN", "display_name": "", "addressing": scenario["addressing"]}

    def preview(self, trial_id, cid):
        self.purge(trial_id)
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id)
            case = self._case(db, trial, cid)
            value = self._compose(trial, cid, case, db, require_count=False)
            value.update(expires=min(self.now() + 120, trial["expires"]), issued=self.now())
            self.store.put(db, "preview", trial_id + ":" + cid, value)
            return {"mode": trial["mode"], "trial": trial_id, "conversation": cid,
                    "turn": value["turn"], "body_sha256": value["body_sha256"], "binding": value["binding"],
                    "expires": value["expires"], "payload": value["payload"],
                    "input_bound": value["input_bound"], "counter_domain": value["counter_domain"],
                    "actual_INSPIRE_export_authorized": trial["mode"] == "research",
                    "token_proof_ready": value["input_bound"] is not None}

    def _admit_offline(self, db, trial):
        key = "OFFLINE-REGISTERED-FIXTURE"
        account = self.store.get(db, "offline-admission", key, {"completed": 0, "pending": 0, "timestamps": []})
        if account["completed"] + account["pending"] >= 30:
            raise ResearchHold("OFFLINE_ACCOUNT_QUOTA_EXHAUSTED")
        stamps = [t for t in account["timestamps"] if self.now() - t < DAY]
        if len(stamps) >= 30 or sum(self.now() - t < 600 for t in stamps) >= 10:
            raise ResearchHold("OFFLINE_IP_RATE_LIMIT")
        account["pending"] += 1
        account["timestamps"] = stamps + [self.now()]
        self.store.put(db, "offline-admission", key, account)

    def execute(self, trial_id, cid, *, preview_hash, operation_id=None, crash=None):
        """One durable attempt. `crash` is a private test hook, not a CLI field."""
        operation_id = operation_id or str(uuid.uuid4())
        if not isinstance(operation_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", operation_id):
            raise ResearchHold("INVALID_OPERATION_ID")
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id)
            if self.store.get(db, "operation", operation_id):
                raise ResearchHold("USE_EXPLICIT_REPLAY_NO_REDISPATCH")
            if trial.get("inflight"):
                raise ResearchHold("UNRESOLVED_OR_UNREVIEWED_ATTEMPT")
            case = self._case(db, trial, cid)
            expected = self._compose(trial, cid, case, db)
            preview = self.store.get(db, "preview", trial_id + ":" + cid)
            if (not preview or self.now() >= preview["expires"] or preview_hash != preview["body_sha256"] or
                    expected["binding"] != preview["binding"] or expected["body_sha256"] != preview_hash):
                raise ResearchHold("EXACT_PREVIEW_REQUIRED_OR_STALE")
            slot = f"{trial_id}:{cid}:{expected['turn']}"
            if self.store.get(db, "slot", slot):
                raise ResearchHold("SLOT_ALREADY_RESERVED_NO_REPLACEMENT")
            if trial["attempts"] >= trial["max_calls"] or trial["reserved_micro"] + RESERVATION > trial["max_micro"]:
                raise ResearchHold("HARD_CALL_OR_MONEY_LIMIT")
            if trial["mode"] == "research":
                self.transport.credential_ready()
            if trial["admission_domain"] == "offline-ledger-test-fixture":
                self._admit_offline(db, trial)
            elif not self.admission:
                raise ResearchHold("VERIFIED_EMULATOR_IDENTITY_REQUIRED")
            attempt = {"operation": operation_id, "trial": trial_id, "cid": cid, "turn": expected["turn"],
                       "status": "DISPATCH_INTENT", "reserved_micro": RESERVATION, "created": self.now(),
                       "binding": expected["binding"], "body_sha256": preview_hash, "input_bound": expected["input_bound"],
                       "expires": trial["expires"], "payload_record": operation_id}
            trial["attempts"] += 1
            trial["reserved_micro"] += RESERVATION
            trial["inflight"] = operation_id
            self.store.put(db, "trial", trial_id, trial)
            self.store.put(db, "slot", slot, {"operation": operation_id})
            self.store.put(db, "operation", operation_id, {"trial": trial_id})
            self.store.put(db, "attempt", trial_id + ":" + operation_id, attempt)
            self.store.put(db, "payload", operation_id, expected)
        if crash:
            crash("after-reservation")
        try:
            request = {"kind": "send", "epoch": trial_id, "sessionId": trial_id, "operationId": operation_id,
                       "conversationId": cid, "messages": expected["history"]}
            if trial["admission_domain"] == "firebase-demo-emulator":
                self.admission.reserve(request, trial["subject"])
            envelope = self.transport.send(canonical(expected["payload"]), operation_id, expected["input_bound"], expected["binding"])
            if crash:
                crash("after-transport")
            if (not isinstance(envelope, TransportResult) or envelope.operation_id != operation_id or
                    envelope.payload_sha256 != expected["body_sha256"] or envelope.binding != expected["binding"]):
                raise ResearchHold("TRANSPORT_RESPONSE_REQUEST_BINDING_HOLD")
            response = envelope.response
            text, usage = self._decode(response, expected["input_bound"], trial)
            # Persist candidate before invoking any native validation checks.
            with self.store.transaction(write=True) as db:
                self.store.put(db, "candidate", operation_id, {"text": text, "request": request,
                               "provider_response_id": response["id"], "usage": usage, "received": self.now()})
            validated = self.validator.validate(text, request, case["native"], expected["binding"], profile=self._profile(cid),
                                                origin="RESEARCH_MODEL_CANDIDATE" if trial["mode"] == "research" else "RESEARCH_OFFLINE_CANDIDATE")
            with self.store.transaction(write=True) as db:
                trial = self._trial(db, trial_id)
                current = self.store.get(db, "attempt", trial_id + ":" + operation_id)
                current.update(status="QUARANTINED_PENDING_REVIEW", usage=usage,
                               validated_sha256=digest(validated["text"].encode()), reviews={})
                self.store.put(db, "validated", operation_id, validated)
                self.store.put(db, "attempt", trial_id + ":" + operation_id, current)
            return self.replay(trial_id, operation_id)
        except Exception as error:
            code = str(error) if isinstance(error, ResearchHold) and re.fullmatch(r"[A-Z0-9_]{1,160}", str(error)) else "TECHNICAL_FAILURE_DETAIL_WITHHELD"
            self._halt(trial_id, operation_id, type(error).__name__, code)
            raise ResearchHold("ATTEMPT_HELD_NO_RETRY_OR_REFUND") from error

    def _decode(self, response, input_bound, trial):
        if not isinstance(response, dict) or response.get("status") != "completed" or response.get("model") != MODEL:
            raise ResearchHold("WRONG_MODEL_OR_INCOMPLETE")
        if not isinstance(response.get("id"), str):
            raise ResearchHold("MISSING_PROVIDER_RECEIPT")
        chunks = []
        if not isinstance(response.get("output"), list):
            raise ResearchHold("MALFORMED_RESPONSE")
        for item in response["output"]:
            if isinstance(item, dict) and item.get("type") == "reasoning":
                continue  # Do not persist reasoning content.
            if (not isinstance(item, dict) or item.get("type") != "message" or item.get("role") != "assistant" or
                    item.get("status") != "completed" or not isinstance(item.get("content"), list)):
                raise ResearchHold("UNSUPPORTED_OUTPUT_OR_TOOL")
            for part in item["content"]:
                if not isinstance(part, dict) or part.get("type") != "output_text" or not isinstance(part.get("text"), str):
                    raise ResearchHold("REFUSAL_OR_INVALID_OUTPUT")
                chunks.append(part["text"])
        usage = response.get("usage")
        if not isinstance(usage, dict):
            raise ResearchHold("USAGE_REQUIRED")
        inp = integer(usage.get("input_tokens"), input_bound, "INPUT_USAGE_EXCEEDS_BOUND")
        output = integer(usage.get("output_tokens"), 2048, "OUTPUT_USAGE_EXCEEDS_CAP")
        details = usage.get("input_tokens_details") or {}
        cached = integer(details.get("cached_tokens", 0), inp, "INVALID_CACHED_USAGE")
        writes = integer(details.get("cache_write_tokens", 0), inp - cached, "INVALID_CACHE_WRITE_USAGE")
        cost = (inp - cached - writes) * 2000 + cached * 100 + writes * 5000 + output * 10000
        upper = inp * trial.get("input_rate", 5) + output * trial.get("output_rate", 10) + trial.get("fee", 0)
        if upper > RESERVATION:
            raise ResearchHold("USAGE_COST_EXCEEDS_RESERVATION")
        return "".join(chunks), {"reported_input_tokens": inp, "reported_output_tokens": output,
                                "conservative_upper_micro": upper,
                                "estimated_model_nanoUSD": cost, "not_an_invoice": True}

    def _halt(self, trial_id, op, error_type, code):
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            attempt = self.store.get(db, "attempt", trial_id + ":" + op)
            trial.update(status="HALTED", ended=self.now())
            attempt.update(status="UNKNOWN_OR_REJECTED", error_type=error_type,
                           error_code=code[:160])
            self.store.put(db, "trial", trial_id, trial)
            self.store.put(db, "attempt", trial_id + ":" + op, attempt)

    def recover(self, trial_id):
        """A committed intent is never interpreted as permission to retry."""
        with self.store.transaction() as db:
            trial = self._trial(db, trial_id, active=False)
            op = trial.get("inflight")
            attempt = self.store.get(db, "attempt", trial_id + ":" + op) if op else None
        if attempt and attempt["status"] in {"DISPATCH_INTENT", "DISPATCHING"}:
            self._halt(trial_id, op, "ProcessLoss", "OUTCOME_UNKNOWN_AFTER_RESTART")
        return self.status(trial_id)

    def replay(self, trial_id, operation_id):
        self.purge(trial_id)
        with self.store.transaction() as db:
            trial = self._trial(db, trial_id, active=False)
            attempt = self.store.get(db, "attempt", trial_id + ":" + operation_id)
            if not attempt:
                raise ResearchHold("RESULT_UNKNOWN_NO_GENERATION")
            if not self._retained(trial):
                raise ResearchHold("QUARANTINE_EXPIRED")
            if trial["manifest"] != self.manifest_hash:
                raise ResearchHold("SOURCE_OR_CONTRACT_CHANGED")
            validated = self.store.get(db, "validated", operation_id)
            if not validated or digest(validated["text"].encode()) != attempt.get("validated_sha256"):
                raise ResearchHold("RESULT_UNKNOWN_OR_BINDING_HOLD")
            return {"operation": operation_id, "status": attempt["status"], "text": validated["text"],
                    "sha256": attempt["validated_sha256"], "usage": attempt["usage"], "proof": validated["proof"],
                    "domain": "OFFLINE_QUARANTINED_RESEARCH_ONLY" if trial["mode"] == "offline" else "MODEL_CANDIDATE_QUARANTINE", "user_delivery": False}

    def review(self, trial_id, operation_id, reviewer, *, accept, scores, flags, expected_sha256):
        if type(accept) is not bool or set(scores) != {"naturalness", "relevance", "continuity", "preferences"}:
            raise ResearchHold("INVALID_REVIEW")
        for value in scores.values():
            integer(value, 5, "INVALID_SCORE")
            if value < 1:
                raise ResearchHold("INVALID_SCORE")
        if set(flags) != {"invented_facts", "invented_sources", "unsafe", "authority_claim", "privacy_leak"} or any(type(v) is not bool for v in flags.values()):
            raise ResearchHold("INVALID_SAFETY_REVIEW")
        self.purge(trial_id)
        # Revalidation uses only the sealed existing candidate, never transport.
        with self.store.transaction() as db:
            trial = self._trial(db, trial_id)
            attempt = self.store.get(db, "attempt", trial_id + ":" + operation_id)
            if not attempt or attempt["status"] != "QUARANTINED_PENDING_REVIEW" or reviewer not in trial["reviewers"]:
                raise ResearchHold("REVIEWER_OR_ATTEMPT_HOLD")
            if expected_sha256 != attempt["validated_sha256"]:
                raise ResearchHold("REVIEW_OUTPUT_BINDING_HOLD")
            candidate = self.store.get(db, "candidate", operation_id)
            case = self._case(db, trial, attempt["cid"])
        validated = self.validator.validate(candidate["text"], candidate["request"], case["native"], attempt["binding"],
                                            profile=self._profile(attempt["cid"]),
                                            origin="RESEARCH_MODEL_CANDIDATE" if trial["mode"] == "research" else "RESEARCH_OFFLINE_CANDIDATE")
        if digest(validated["text"].encode()) != expected_sha256:
            raise ResearchHold("REVALIDATED_BYTES_CHANGED")
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id)
            attempt = self.store.get(db, "attempt", trial_id + ":" + operation_id)
            if attempt["status"] != "QUARANTINED_PENDING_REVIEW" or reviewer in attempt["reviews"]:
                raise ResearchHold("REVIEW_ALREADY_RECORDED")
            attempt["reviews"][reviewer] = {"accept": accept, "scores": scores, "flags": flags,
                                              "domain": "OFFLINE_TEST_REVIEW_NOT_LANGUAGE_QUALITY_EVIDENCE" if trial["mode"] == "offline" else "OPERATOR_RECORDED_RESEARCH_REVIEW"}
            if not accept or any(flags.values()) or min(scores.values()) < 3:
                attempt["status"] = "REJECTED_BY_REVIEW"
                trial.update(status="HALTED", ended=self.now())
            elif len(attempt["reviews"]) == 2:
                if trial["admission_domain"] == "firebase-demo-emulator":
                    if not self.admission:
                        raise ResearchHold("VERIFIED_EMULATOR_IDENTITY_REQUIRED")
                    self.admission.settle(operation_id, trial["subject"], expected_sha256)
                case["revision"] += 1
                case["messages"] = candidate["request"]["messages"] + [
                    {"id": "A-" + operation_id, "role": "assistant", "text": validated["text"]}]
                case["native"] = validated["state"]
                self.store.put(db, "case", trial_id + ":" + attempt["cid"], case)
                attempt["status"] = "ACCEPTED_FOR_OFFLINE_RESEARCH_CONTEXT" if trial["mode"] == "offline" else "ACCEPTED_FOR_RESEARCH_CONTEXT"
                trial["inflight"] = None
                if trial["admission_domain"] == "offline-ledger-test-fixture":
                    account = self.store.get(db, "offline-admission", trial["subject"])
                    account["pending"] -= 1
                    account["completed"] += 1
                    self.store.put(db, "offline-admission", trial["subject"], account)
                if trial["attempts"] == trial["max_calls"]:
                    trial.update(status="FINISHED", ended=self.now())
            self.store.put(db, "attempt", trial_id + ":" + operation_id, attempt)
            self.store.put(db, "trial", trial_id, trial)
        return self.status(trial_id)

    def revoke(self, trial_id):
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            trial.update(revoked=True, authorization_revision=trial["authorization_revision"] + 1,
                         status="HALTED", ended=self.now())
            self.store.put(db, "trial", trial_id, trial)

    def purge(self, trial_id):
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if self._retained(trial):
                return
            for kind, key in db.execute("SELECT kind,id FROM records").fetchall():
                if kind == "attempt" and key.startswith(trial_id + ":"):
                    a = self.store.get(db, kind, key)
                    for content_kind in ["payload", "candidate", "validated"]:
                        self.store.purge_record(db, content_kind, a["operation"])
                    a.pop("reviews", None)
                    a.pop("error_code", None)
                    a["status"] = "CONTENT_EXPIRED_BUDGET_TOMBSTONE_RETAINED"
                    self.store.put(db, kind, key, a)
                elif kind in {"preview", "case", "approval-disclosure"} and key.startswith(trial_id + ":"):
                    self.store.purge_record(db, kind, key)
                elif kind == "source-disclosure" and key == trial_id:
                    self.store.purge_record(db, kind, key)
                elif kind == "owner-document" and key == trial_id:
                    self.store.purge_record(db, kind, key)
                elif kind == "token-receipt":
                    proof = self.store.get(db, kind, key)
                    if proof and proof["trial_id"] == trial_id:
                        self.store.purge_record(db, kind, key)
            trial.update(status="EXPIRED", ended=trial["ended"] or trial["expires"])
            self.store.put(db, "trial", trial_id, trial)

    def watch_retention(self, trial_id, *, sleep=time.sleep):
        """Local foreground purge worker; no task/service is installed implicitly."""
        while True:
            self.purge(trial_id)
            state = self.status(trial_id)
            if state["status"] == "EXPIRED":
                return state
            with self.store.transaction() as db:
                trial = self._trial(db, trial_id, active=False)
                deadline = (trial["ended"] or trial["expires"]) + trial["retention_days"] * DAY
            sleep(max(0.01, min(60, deadline - self.now())))

    def status(self, trial_id):
        with self.store.transaction() as db:
            trial = self._trial(db, trial_id, active=False)
            attempts = []
            for (key,) in db.execute("SELECT id FROM records WHERE kind='attempt'"):
                if key.startswith(trial_id + ":"):
                    attempts.append(self.store.get(db, "attempt", key))
            ratings = [r for a in attempts for r in a.get("reviews", {}).values()]
            means = {k: sum(r["scores"][k] for r in ratings) / len(ratings) for k in
                     ["naturalness", "relevance", "continuity", "preferences"]} if ratings else {}
            quality = (len(attempts) == 12 and len(ratings) == 24 and all(v >= 4 for v in means.values()) and
                       all(min(r["scores"].values()) >= 3 and not any(r["flags"].values()) for r in ratings))
            return {"trial": trial_id, "mode": trial["mode"], "status": trial["status"],
                    "attempts": trial["attempts"], "reserved_microUSD": trial["reserved_micro"],
                    "remaining_attempts": max(0, trial["max_calls"] - trial["attempts"]),
                    "admission_domain": trial["admission_domain"],
                    "inflight": trial.get("inflight"), "real_source_permissions": trial["real_source_permissions"],
                    "evaluation": {"means": means, "rubric_fixture_pass": quality,
                                   "rubric_pass": quality if trial["mode"] == "research" else None,
                                   "genuine_conversation_quality_established": False,
                                   "review_domain": "OFFLINE_TEST_INPUTS_ONLY" if trial["mode"] == "offline" else "NAMED_RESEARCH_REVIEW"},
                    "live_enabled": False,  # Proposed spending was withdrawn.
                    "ledger_id": self.store.anchor["id"], "manifest_hash": trial["manifest"],
                    "actual_execution_eligible": False, "website_delivery": False}

    def import_owner_decision(self, trial_id, path, expected_sha256, decision_reference):
        """Only a local owner/operator may invoke this after explicit decisions.
        No model/public route invokes it. SHA and reference must come from the
        owner outside the document; no approval file is generated by this code.
        """
        value = pinned_document(path, expected_sha256)
        if value.get("owner_decision_reference") != decision_reference or not decision_reference:
            raise ResearchHold("OWNER_OUT_OF_BAND_REFERENCE_REQUIRED")
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if trial["mode"] != "research-draft" or trial["attempts"] or trial["admission_domain"] != "firebase-demo-emulator":
                raise ResearchHold("OWNER_IMPORT_REQUIRES_UNUSED_BOUND_RESEARCH_DRAFT")
            grant = validate_owner_decision(value, trial, self.store.anchor["id"], self.manifest_hash, self.real_sources, self.now())
            trial.update(authorization="EXTERNAL_OWNER_RESEARCH_DECISION", owner_document_sha256=expected_sha256,
                         owner_reference=decision_reference, owner_valid_from=grant["valid_from"], expires=grant["expires_at"],
                         max_calls=min(trial["max_calls"], grant["max_calls"]), max_micro=min(trial["max_micro"], grant["max_microUSD"]),
                         retention_days=min(trial["retention_days"], grant["retention_days"]), reviewers=grant["reviewers"],
                         real_source_permissions=grant["source_decisions"], input_rate=grant["all_in_input_micro_per_token"],
                         output_rate=grant["all_in_output_micro_per_token"], fee=grant["fixed_fee_micro_per_call"],
                         authorization_revision=trial["authorization_revision"] + 1)
            self.store.put(db, "owner-document", trial_id, grant)
            self.store.put(db, "trial", trial_id, trial)
        return self.status(trial_id)

    def release(self, trial_id, expected_owner_sha256):
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if (trial["mode"] != "research-draft" or trial.get("owner_document_sha256") != expected_owner_sha256 or
                    not expected_owner_sha256 or trial["revoked"] or self.now() >= trial["expires"] or
                    self.now() < trial.get("owner_valid_from", float("inf")) or
                    not all(s["internal"] and s["export"] for s in trial["real_source_permissions"].values())):
                raise ResearchHold("EXPLICIT_OWNER_RELEASE_AND_ALL_NINE_GRANTS_REQUIRED")
            # Owner rejected this proposed spend plan on 11 November 2026.
            # Preserve historical/offline evidence without releasing paid calls.
            raise ResearchHold("RESEARCH_SPEND_PROPOSAL_WITHDRAWN_BY_OWNER")

    def import_token_receipt(self, trial_id, path, expected_sha256):
        proof = pinned_document(path, expected_sha256)
        keys = {"type", "trial_id", "ledger_id", "model", "payload_sha256", "input_upper_bound", "expires_at", "tokenizer_evidence_reference", "includes_model_framing"}
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if (set(proof) != keys or proof["type"] != "EXTERNALLY_VERIFIED_MODEL_TOKEN_BOUND" or
                    proof["trial_id"] != trial_id or proof["ledger_id"] != self.store.anchor["id"] or proof["model"] != MODEL or
                    proof["includes_model_framing"] is not True or not proof["tokenizer_evidence_reference"] or
                    not isinstance(proof["payload_sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", proof["payload_sha256"]) or
                    type(proof["expires_at"]) not in {int, float} or not self.now() < proof["expires_at"] <= trial["expires"]):
                raise ResearchHold("EXTERNAL_TOKEN_RECEIPT_SCOPE_HOLD")
            integer(proof["input_upper_bound"], 8000, "TOKEN_RECEIPT_LIMIT_HOLD")
            if not proof["input_upper_bound"]:
                raise ResearchHold("TOKEN_RECEIPT_LIMIT_HOLD")
            self.store.put(db, "token-receipt", proof["payload_sha256"], proof)

    def _authorize_dispatch(self, payload, operation, binding):
        """Consume one intent immediately before the HTTPS sender can read a key."""
        with self.store.transaction(write=True) as db:
            owner = self.store.get(db, "operation", operation)
            if not owner:
                raise ResearchHold("NO_DURABLE_DISPATCH_RESERVATION")
            trial = self._trial(db, owner["trial"])
            attempt = self.store.get(db, "attempt", trial["id"] + ":" + operation)
            if (trial["mode"] != "research" or attempt["status"] != "DISPATCH_INTENT" or
                    attempt["binding"] != binding or attempt["body_sha256"] != digest(payload)):
                raise ResearchHold("ONE_SHOT_DISPATCH_PERMISSION_HOLD")
            proof = self.store.get(db, "token-receipt", digest(payload))
            if not proof or proof["trial_id"] != trial["id"] or self.now() >= proof["expires_at"]:
                raise ResearchHold("FRESH_MODEL_TOKEN_RECEIPT_REQUIRED")
            attempt["status"] = "DISPATCHING"
            self.store.put(db, "attempt", trial["id"] + ":" + operation, attempt)

    def _disclosure_texts(self):
        import re
        package = ROOT / ".private.local/controller040-preview/INSPIRE_AI_040"
        texts = {}
        for source in self.real_sources:
            path = (package / source["source_path"]).resolve()
            if not path.is_relative_to(package.resolve()):
                raise ResearchHold("SOURCE_PATH_HOLD")
            raw = path.read_bytes()
            match = re.search(r"^# " + re.escape(source["section"]) + r"\..*?(?=^# |\Z)",
                              raw.decode("utf-8-sig"), re.M | re.S)
            if digest(raw) != source["source_sha256"] or not match or digest(match.group().encode()) != source["section_sha256"]:
                raise ResearchHold("SOURCE_INTEGRITY_HOLD")
            texts[source["decision_id"]] = match.group()
        return texts

    def source_disclosure(self, trial_id):
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if not self._retained(trial):
                raise ResearchHold("QUARANTINE_EXPIRED")
            texts = self._disclosure_texts()
            value = {"purpose": "OWNER_SOURCE_REVIEW_ONLY_NOT_PERMISSION", "authorized": False,
                     "sources": [{**s, "exact_text": texts[s["decision_id"]],
                                  "internal_authorized": False, "export_authorized": False} for s in self.real_sources]}
            self.store.put(db, "source-disclosure", trial_id, value)
            return value

    def approval_preview(self, trial_id, cid):
        """Owner-requested local disclosure, not runtime source/export consent.

        The output is separately labelled and cannot be submitted to execute().
        It is encrypted in the same private store, never written into the repo.
        """
        with self.store.transaction(write=True) as db:
            trial = self._trial(db, trial_id, active=False)
            if not self._retained(trial):
                raise ResearchHold("QUARANTINE_EXPIRED")
            scenario = next((c for c in self.template["scenarios"] if c["conversation"] == cid), None)
            if not scenario:
                raise ResearchHold("UNSCHEDULED_CONVERSATION")
            texts = self._disclosure_texts()
            instructions = self.template["engineering_header_exact"] + "\n\nTrích nguyên văn nguồn MOI-01 v1.0 — Proposal/Pending Review; không phải permission:\n\n" + "\n\n".join(texts[k] for k in self.template["operating_appendix_order"])
            refs = []
            for key in scenario["references"][0]:
                s = next(s for s in self.real_sources if s["decision_id"] == key)
                refs.append({"documentId": s["document_id"], "version": s["declared_version"], "sourceHash": s["source_sha256"],
                             "section": s["section"], "sectionHash": s["section_sha256"], "status": s["approval_status"], "text": texts[key]})
            data = {"kind": "UNTRUSTED_SYNTHETIC_SUPPORTING_DATA_NOT_PERMISSION", "language": "vi", "addressing": scenario["addressing"],
                    "correction_references": [], "references": refs}
            payload = {**self.template["payload_settings"], "instructions": instructions,
                       "input": [{"role": "user", "content": canonical(data).decode()},
                                 {"role": "user", "content": scenario["user_turns"][0]}]}
            value = {"purpose": "OWNER_DISCLOSURE_ONLY_NOT_DISPATCHABLE", "turn": 1,
                     "payload": payload, "body_sha256": digest(canonical(payload)), "body_bytes": len(canonical(payload)),
                     "permissions": trial["real_source_permissions"], "authorized": False}
            self.store.put(db, "approval-disclosure", trial_id + ":" + cid, value)
            return value
