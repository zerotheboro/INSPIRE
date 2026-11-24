"""Explicit-owner research boundary and one-shot HTTPS sender. Never auto-enabled.

No credentials are loaded until an authorized, reserved dispatch. Owner records
and token-count receipts are operator-supplied with out-of-band SHA-256 pins; this
module does not create approvals or claim that a model/tokenizer is verified.
"""
import http.client
import json
import os
from pathlib import Path
import ssl
from inspire_research_store import ResearchHold, canonical, digest


def pinned_document(path, expected_sha256):
    raw = Path(path).read_bytes()
    if digest(raw) != expected_sha256:
        raise ResearchHold("EXTERNAL_OWNER_DOCUMENT_HASH_MISMATCH")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ResearchHold("INVALID_OWNER_DOCUMENT")
    return value


def validate_owner_decision(value, trial, ledger_id, manifest, sources, now):
    keys = {"type", "owner_decision_reference", "trial_id", "ledger_id", "manifest_hash", "subject", "model",
            "valid_from", "expires_at", "max_calls", "max_microUSD", "permissions", "source_decisions",
            "reviewers", "retention_days", "pricing_evidence_reference", "all_in_input_micro_per_token",
            "all_in_output_micro_per_token", "fixed_fee_micro_per_call"}
    if set(value) != keys or value["type"] != "EXTERNAL_OWNER_RESEARCH_DECISION":
        raise ResearchHold("OWNER_DECISION_SCHEMA_HOLD")
    if (not isinstance(value["owner_decision_reference"], str) or not value["owner_decision_reference"].strip() or
            value["trial_id"] != trial["id"] or value["ledger_id"] != ledger_id or value["manifest_hash"] != manifest or
            value["subject"] != trial["subject"] or not trial["subject"] or value["model"] != "gpt-6.1-sol"):
        raise ResearchHold("OWNER_DECISION_SCOPE_HOLD")
    if not (type(value["valid_from"]) in {int, float} and type(value["expires_at"]) in {int, float} and
            value["valid_from"] <= now < value["expires_at"] <= value["valid_from"] + 7200):
        raise ResearchHold("OWNER_DECISION_TIME_HOLD")
    for key, maximum in [("max_calls", 12), ("max_microUSD", 2000000), ("retention_days", 7)]:
        if type(value[key]) is not int or not 1 <= value[key] <= maximum:
            raise ResearchHold("OWNER_DECISION_LIMIT_HOLD")
    if value["permissions"] != {"synthetic_research_generation": True, "quarantined_review": True,
                                "research_context_acceptance": True, "website_delivery": False, "intervention": False}:
        raise ResearchHold("RESEARCH_PERMISSION_SCOPE_HOLD")
    if (not isinstance(value["reviewers"], list) or len(value["reviewers"]) != 2 or
            any(not isinstance(x, str) or not x.strip() for x in value["reviewers"]) or len(set(value["reviewers"])) != 2):
        raise ResearchHold("TWO_NAMED_REVIEWERS_REQUIRED")
    if not value["pricing_evidence_reference"]:
        raise ResearchHold("PRICING_EVIDENCE_REQUIRED")
    for key, minimum in [("all_in_input_micro_per_token", 5), ("all_in_output_micro_per_token", 10), ("fixed_fee_micro_per_call", 0)]:
        if type(value[key]) is not int or not minimum <= value[key] <= 100000:
            raise ResearchHold("UNVERIFIED_ALL_IN_RATE")
    if set(value["source_decisions"]) != {s["decision_id"] for s in sources}:
        raise ResearchHold("NINE_INDIVIDUAL_SOURCE_DECISIONS_REQUIRED")
    for source in sources:
        decision = value["source_decisions"][source["decision_id"]]
        if (set(decision) != {"internal", "export", "source_sha256", "section_sha256", "role", "authority_reference"} or
                type(decision["internal"]) is not bool or type(decision["export"]) is not bool or
                decision["source_sha256"] != source["source_sha256"] or decision["section_sha256"] != source["section_sha256"] or
                decision["role"] != source["proposed_use"] or not decision["authority_reference"]):
            raise ResearchHold("INDIVIDUAL_SOURCE_SCOPE_HOLD")
    return value


class RecordedModelTokenBound:
    """Trusted operator imports hash-bound receipts from an independently verified
    offline tokenizer. Missing or unverified receipts always block; no guessing,
    external count endpoint or vocabulary download is attempted.
    """
    domain = "operator-pinned-model-token-receipt"
    def __init__(self, store, now):
        self.store, self.now = store, now
    def count(self, payload):
        with self.store.transaction() as db:
            return self.count_in(db, payload)
    def count_in(self, db, payload, trial_id=None):
        proof = self.store.get(db, "token-receipt", digest(payload))
        if (not proof or self.now() >= proof["expires_at"] or proof["model"] != "gpt-6.1-sol" or
                proof["ledger_id"] != self.store.anchor["id"] or (trial_id is not None and proof["trial_id"] != trial_id)):
            raise ResearchHold("VERIFIED_MODEL_TOKEN_RECEIPT_REQUIRED")
        return proof["input_upper_bound"]


class ResearchHTTPS:
    domain = "live"
    def __init__(self, key_provider=None):
        self.key_provider = key_provider or (lambda: os.environ.get("OPENAI_API_KEY"))
        self.authorize = None  # Installed only by ResearchRunner, not model data.
    def credential_ready(self):
        if not self.key_provider():
            raise ResearchHold("SERVER_API_KEY_REQUIRED_NOT_LOADED")
    def send(self, payload, operation_id, input_bound, binding):
        if not self.authorize:
            raise ResearchHold("NO_PRE_DISPATCH_AUTHORIZER")
        self.authorize(payload, operation_id, binding)
        return self._one_request(payload, operation_id, binding)
    def _one_request(self, payload, operation_id, binding):
        # No retries, redirects, proxy inheritance, model-selected URLs or tools.
        key = self.key_provider()
        if not key or any(c in key for c in "\r\n"):
            raise ResearchHold("SERVER_API_KEY_REQUIRED")
        connection = http.client.HTTPSConnection("api.openai.com", 443, timeout=60, context=ssl.create_default_context())
        try:
            connection.request("POST", "/v1/responses", body=payload, headers={"Content-Type": "application/json",
                               "Authorization": "Bearer " + key, "X-Client-Request-Id": operation_id})
            response = connection.getresponse()
            raw = response.read(512001)
            if response.status != 200 or len(raw) > 512000:
                raise ResearchHold("PROVIDER_HTTP_OR_SIZE_HOLD_NO_RETRY")
            from inspire_research import TransportResult
            return TransportResult(operation_id, digest(payload), binding, json.loads(raw.decode("utf8")))
        finally:
            connection.close()
