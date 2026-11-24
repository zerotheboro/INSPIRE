"""Actual Windows ACL/DPAPI/SQLite + offline research fault regressions."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import concurrent.futures
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import time
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
from inspire_research_store import ResearchStore, ResearchHold, WindowsProtection, digest, canonical
from inspire_research import ResearchRunner, OfflineTransport, TransportResult, RESERVATION
from inspire_research_controller import NativeResearchValidation
from inspire_research_live import ResearchHTTPS, validate_owner_decision, RecordedModelTokenBound


def deny_network(*args, **kwargs):
    raise AssertionError("All network forbidden in research tests")


socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network
socket.create_connection = deny_network
SCORES = {k: 4 for k in ["naturalness", "relevance", "continuity", "preferences"]}
FLAGS = {k: False for k in ["invented_facts", "invented_sources", "unsafe", "authority_claim", "privacy_leak"]}
EVIDENCE = []


class FastValidation:
    """Ledger test double; native checks tested separately, not claimed here."""
    def validate(self, text, request, previous, binding, **kwargs):
        if not text.strip() or len(text.encode("utf-16-le")) // 2 > 2000:
            raise ResearchHold("INVALID_TEST_CANDIDATE")
        return {"text": text.strip(), "state": None,
                "proof": {"domain": "LEDGER_TEST_DOUBLE_NOT_CONTROLLER", "actual_execution_eligible": False}}


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.clock = time.time()
        self.root = ResearchStore.default_root("offline-test-" + uuid.uuid4().hex)
        self.store = ResearchStore(self.root, create=True, now=lambda: self.clock)
        self.transport = OfflineTransport()
        self.runner = ResearchRunner(self.store, self.transport, validator=FastValidation(), now=lambda: self.clock)
        self.trial = "trial-" + uuid.uuid4().hex
        self.runner.create(self.trial, offline=True)

    def tearDown(self):
        # Only this test-created leaf under the explicit managed base is removed.
        base = WindowsProtection().base.resolve()
        target = self.root.resolve()
        if target.is_relative_to(base) and target.name.startswith("offline-test-") and target.exists():
            WindowsProtection().restrict(target)
            for file in target.iterdir():
                if file.is_file() and not file.is_symlink():
                    file.unlink()
            target.rmdir()

    def send(self, cid="C1", **kwargs):
        p = self.runner.preview(self.trial, cid)
        return self.runner.execute(self.trial, cid, preview_hash=p["body_sha256"], **kwargs)

    def accept(self, value, scores=None):
        for reviewer in ["offline-reviewer-a", "offline-reviewer-b"]:
            self.runner.review(self.trial, value["operation"], reviewer, accept=True,
                               scores=scores or SCORES, flags=FLAGS, expected_sha256=value["sha256"])

    def test_secure_storage_is_outside_workspace_private_acl_and_dpapi_ciphertext(self):
        self.assertFalse(self.root.resolve().is_relative_to(ROOT))
        self.store.protection.verify_acl(self.root, protected=True)
        with self.store.transaction(write=True) as db:
            self.store.put(db, "canary", "one", {"text": "PRIVATE_RESEARCH_CANARY_Đính_chính"})
        data = self.store.db_path.read_bytes()
        self.assertNotIn(b"PRIVATE_RESEARCH_CANARY", data)
        with self.store.transaction() as db:
            self.assertEqual(self.store.get(db, "canary", "one")["text"], "PRIVATE_RESEARCH_CANARY_Đính_chính")
        with self.assertRaises(ResearchHold):
            self.store.protection.crypt(b"corrupt-DPAPI", decrypt=True)

    def test_withdrawn_spend_proposal_cannot_release_even_a_synthetic_grant(self):
        # Pure test substitution, no actual source permissions are granted/stored.
        fake = {"mode": "research-draft", "owner_document_sha256": "synthetic",
                "revoked": False, "expires": self.clock + 60,
                "owner_valid_from": self.clock - 1,
                "real_source_permissions": {"SYNTHETIC-ONLY": {"internal": True, "export": True}}}
        with patch.object(self.runner, "_trial", return_value=fake):
            with self.assertRaisesRegex(ResearchHold, "WITHDRAWN_BY_OWNER"):
                self.runner.release(self.trial, "synthetic")
        self.assertEqual(self.transport.calls, 0)
        self.assertTrue(all(not v["internal"] and not v["export"] for v in
                            self.runner.status(self.trial)["real_source_permissions"].values()))
        with self.store.transaction() as db:
            with patch.object(self.store, "get", return_value={"mode": "research", "manifest": self.runner.manifest_hash}):
                with self.assertRaisesRegex(ResearchHold, "WITHDRAWN_BY_OWNER"):
                    self.runner._trial(db, "SYNTHETIC_ONLY_PREVIOUSLY_RELEASED")

    def test_owner_preview_matches_proposed_runtime_bytes_without_granting_sources(self):
        # Pure local assembly comparison: no grant/import/release or transport.
        # A copied mode selects the proposed appendix format, never an authority.
        for cid in ["C1", "C2", "C3", "C4"]:
            disclosure = self.runner.approval_preview(self.trial, cid)
            with self.store.transaction() as db:
                proposed = self.store.get(db, "trial", self.trial)
                proposed["mode"] = "research"
                assembled = self.runner._compose(proposed, cid, self.runner._case(db, proposed, cid), db, require_count=False)
            self.assertEqual(disclosure["body_sha256"], assembled["body_sha256"])
        self.assertEqual(self.transport.calls, 0)
        state = self.runner.status(self.trial)
        self.assertTrue(all(not x["internal"] and not x["export"] for x in state["real_source_permissions"].values()))

    def test_foreground_retention_worker_purges_at_configured_deadline(self):
        self.send()
        with self.store.transaction() as db:
            trial = self.store.get(db, "trial", self.trial)
            deadline = trial["expires"] + trial["retention_days"] * 86400
        self.clock = deadline - 30
        ticks = []
        def advance(seconds):
            ticks.append(seconds)
            self.clock += seconds
        state = self.runner.watch_retention(self.trial, sleep=advance)
        self.assertEqual(ticks, [30])
        self.assertEqual(state["status"], "EXPIRED")
        self.assertEqual(state["attempts"], 1)
        with self.store.transaction() as db:
            count = db.execute("SELECT count(*) FROM records WHERE kind='candidate' AND content IS NOT NULL").fetchone()[0]
        self.assertEqual(count, 0)

    def test_public_workspace_sync_and_network_locations_are_rejected(self):
        for path in [ROOT / "public/quarantine", ROOT / ".private.local/quarantine", Path(r"\\server\share\research")]:
            with self.assertRaises(ResearchHold):
                ResearchStore(path, create=True)
        with patch.dict(os.environ, {"OneDrive": str(WindowsProtection().base)}):
            with self.assertRaises(ResearchHold):
                ResearchStore(self.root)

    def test_all_real_source_permissions_remain_false_and_draft_cannot_dispatch(self):
        draft = "real-draft"
        state = self.runner.create(draft)
        self.assertEqual(len(state["real_source_permissions"]), 9)
        self.assertTrue(all(not r["internal"] and not r["export"] for r in state["real_source_permissions"].values()))
        for action in [lambda: self.runner.preview(draft, "C1"),
                       lambda: self.runner.execute(draft, "C1", preview_hash="forged")]:
            with self.assertRaisesRegex(ResearchHold, "OWNER_AND_NINE_SOURCE"):
                action()
        disclosure = self.runner.approval_preview(draft, "C1")
        self.assertFalse(disclosure["authorized"])
        self.assertEqual(disclosure["body_sha256"], "06350da5873830a8f1d0cc1fc71880fc9c835d4cfca915c72b4e18c7d5f0f8f0")
        sources = self.runner.source_disclosure(draft)
        self.assertEqual(len(sources["sources"]), 9)
        self.assertTrue(all(not s["export_authorized"] and digest(s["exact_text"].encode()) == s["section_sha256"] for s in sources["sources"]))
        with self.assertRaises(ResearchHold):
            self.runner.execute(draft, "C1", preview_hash=disclosure["body_sha256"])
        self.assertEqual(self.transport.calls, 0)
        self.assertEqual(self.runner.status(draft)["attempts"], 0)

    def test_exact_preview_expiry_auth_revocation_and_live_transport_are_pre_dispatch(self):
        with self.assertRaises(ResearchHold):
            self.runner.execute(self.trial, "C1", preview_hash="no-preview")
        p = self.runner.preview(self.trial, "C1")
        with self.assertRaises(ResearchHold):
            self.runner.execute(self.trial, "C1", preview_hash="different")
        self.clock += 121
        with self.assertRaises(ResearchHold):
            self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"])
        p = self.runner.preview(self.trial, "C1")
        self.runner.revoke(self.trial)
        with self.assertRaises(ResearchHold):
            self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"])
        self.assertEqual(self.transport.calls, 0)
        class NetworkTransport:
            domain = "live"
        with self.assertRaisesRegex(ResearchHold, "LIVE_TRANSPORT"):
            ResearchRunner(self.store, NetworkTransport())

    def test_live_sender_cannot_read_key_from_offline_or_unapproved_authority(self):
        def forbidden_key(): raise AssertionError("Key must not be read")
        transport = ResearchHTTPS(forbidden_key)
        with self.assertRaisesRegex(ResearchHold, "NO_PRE_DISPATCH"):
            transport.send(b"{}", "op", 10, "binding")
        runner = ResearchRunner(self.store, transport, now=lambda: self.clock)
        with self.assertRaises(ResearchHold):
            runner.preview(self.trial, "C1")
        draft = "blocked-live-draft"
        runner.create(draft)
        with self.assertRaises(ResearchHold):
            runner.preview(draft, "C1")
        with self.assertRaises(ResearchHold):
            runner.release(draft, "not-an-owner-decision")
        self.assertEqual(self.runner.status(draft)["attempts"], 0)

    def test_https_implementation_exact_bytes_no_redirect_or_retry_with_fake_connection(self):
        body = canonical({"model": "gpt-6.1-sol", "input": "SYNTHETIC TRANSPORT FIXTURE ONLY"})
        calls = []
        class FakeResponse:
            status = 200
            def read(self, _): return b'{"model":"gpt-6.1-sol","status":"completed","output":[]}'
        class FakeConnection:
            def __init__(self, host, port, **kwargs):
                self.host, self.port = host, port
                self.asserted = host == "api.openai.com" and port == 443
            def request(self, method, path, body, headers):
                calls.append({"method": method, "path": path, "body": body, "headers": headers})
            def getresponse(self): return FakeResponse()
            def close(self): pass
        transport = ResearchHTTPS(lambda: "OFFLINE_SENTINEL_NOT_A_REAL_KEY")
        with patch("inspire_research_live.http.client.HTTPSConnection", FakeConnection):
            value = transport._one_request(body, "operation-fixture", "binding-fixture")
            self.assertEqual(value.payload_sha256, digest(body))
            self.assertEqual(calls[0]["body"], body)
            self.assertEqual(calls[0]["path"], "/v1/responses")
            self.assertEqual(calls[0]["headers"]["X-Client-Request-Id"], "operation-fixture")
            FakeResponse.status = 307
            with self.assertRaises(ResearchHold):
                transport._one_request(body, "second-fixture", "binding")
        self.assertEqual(len(calls), 2)  # One request per invocation; no redirects.

    def test_owner_scope_validator_with_synthetic_catalogue_no_real_grants_created(self):
        sources = [{"decision_id": "SYNTHETIC-"+str(i), "source_sha256": digest(str(i).encode()),
                    "section_sha256": digest(("section"+str(i)).encode()), "proposed_use": "fixture-only"} for i in range(9)]
        trial = {"id": "SYNTHETIC", "subject": "SYNTHETIC-SUBJECT"}
        value = {"type": "EXTERNAL_OWNER_RESEARCH_DECISION", "owner_decision_reference": "SYNTHETIC TEST FIXTURE NOT AN OWNER APPROVAL",
                 "trial_id": trial["id"], "subject": trial["subject"], "ledger_id": "fixture-ledger", "manifest_hash": "fixture-manifest",
                 "model": "gpt-6.1-sol", "valid_from": self.clock-1, "expires_at": self.clock+3600, "max_calls": 12, "max_microUSD": 2000000,
                 "permissions": {"synthetic_research_generation": True, "quarantined_review": True, "research_context_acceptance": True, "website_delivery": False, "intervention": False},
                 "source_decisions": {s["decision_id"]: {"internal": True, "export": True, "source_sha256": s["source_sha256"],
                   "section_sha256": s["section_sha256"], "role": "fixture-only", "authority_reference": "SYNTHETIC ONLY"} for s in sources},
                 "reviewers": ["SYNTHETIC-A", "SYNTHETIC-B"], "retention_days": 7, "pricing_evidence_reference": "SYNTHETIC PRICE FIXTURE",
                 "all_in_input_micro_per_token": 5, "all_in_output_micro_per_token": 10, "fixed_fee_micro_per_call": 0}
        validate_owner_decision(value, trial, "fixture-ledger", "fixture-manifest", sources, self.clock)
        import copy
        for mutate in [lambda v:v.update(max_calls=13), lambda v:v.update(max_microUSD=2000001),
                       lambda v:v.update(model="wrong"), lambda v:v["permissions"].update(website_delivery=True),
                       lambda v:v["source_decisions"].pop("SYNTHETIC-0"), lambda v:v.update(expires_at=self.clock-1)]:
            bad = copy.deepcopy(value); mutate(bad)
            with self.assertRaises(ResearchHold):
                validate_owner_decision(bad, trial, "fixture-ledger", "fixture-manifest", sources, self.clock)
        self.assertTrue(all(not x["export"] for x in self.runner.status(self.trial)["real_source_permissions"].values()))

    def test_model_token_receipts_are_hash_trial_expiry_bound_and_no_online_counter(self):
        payload = b'SYNTHETIC TOKEN COUNT FIXTURE'
        counter = RecordedModelTokenBound(self.store, lambda: self.clock)
        with self.assertRaises(ResearchHold): counter.count(payload)
        proof = {"model": "gpt-6.1-sol", "trial_id": "SYNTHETIC-COUNT", "ledger_id": self.store.anchor["id"],
                 "expires_at": self.clock+60, "input_upper_bound": 20}
        with self.store.transaction(write=True) as db:
            self.store.put(db, "token-receipt", digest(payload), proof)
        self.assertEqual(counter.count(payload), 20)
        with self.store.transaction() as db:
            with self.assertRaises(ResearchHold): counter.count_in(db, payload, trial_id="different")
        self.clock += 61
        with self.assertRaises(ResearchHold): counter.count(payload)

    def test_full_twelve_slots_roles_correction_quality_and_no_thirteenth(self):
        trace = []
        for index, cid in enumerate(["C1", "C2", "C3", "C4"]):
            if index == 2:
                self.clock += 601
            for turn in range(1, 4):
                p = self.runner.preview(self.trial, cid)
                self.assertEqual([m["role"] for m in p["payload"]["input"][1:]], ["user", "assistant"] * (turn - 1) + ["user"])
                self.assertNotIn("Trích nguyên văn nguồn MOI", p["payload"]["instructions"])
                if cid == "C2" and turn >= 2:
                    meta = json.loads(p["payload"]["input"][0]["content"])
                    self.assertEqual(meta["correction_references"], [{"messageId": "C2-U2", "correctionOf": "C2-U1"}])
                result = self.runner.execute(self.trial, cid, preview_hash=p["body_sha256"])
                self.accept(result)
                trace.append({"conversation": cid, "turn": turn, "body_sha256": p["body_sha256"],
                              "validated_sha256": result["sha256"], "reserved_micro": RESERVATION})
        state = self.runner.status(self.trial)
        self.assertEqual(state["attempts"], 12)
        self.assertEqual(state["reserved_microUSD"], 1920000)
        self.assertEqual(self.transport.calls, 12)
        self.assertTrue(state["evaluation"]["rubric_fixture_pass"])
        self.assertFalse(state["evaluation"]["genuine_conversation_quality_established"])
        with self.assertRaises(ResearchHold):
            self.runner.preview(self.trial, "C1")
        EVIDENCE.append({"test": "12-slot-offline-journey", "trace": trace, "state": state})

    def test_money_and_token_caps_fail_before_transport(self):
        other = "tight-budget"
        self.runner.create(other, offline=True, max_micro=159999)
        p = self.runner.preview(other, "C1")
        with self.assertRaisesRegex(ResearchHold, "HARD_CALL_OR_MONEY"):
            self.runner.execute(other, "C1", preview_hash=p["body_sha256"])
        class TooManyTokens:
            domain = "test"
            def count(self, _): return 8001
        r = ResearchRunner(self.store, self.transport, counter=TooManyTokens(), validator=FastValidation(), now=lambda: self.clock)
        with self.assertRaises(ResearchHold):
            r.preview(self.trial, "C1")
        self.assertEqual(self.transport.calls, 0)
        for kwargs in [{"max_calls": 13}, {"max_micro": 2000001}, {"max_calls": True}]:
            with self.assertRaises(ResearchHold):
                self.runner.create("invalid-" + uuid.uuid4().hex, offline=True, **kwargs)

    def test_duplicate_and_explicit_replay_never_generate_or_charge_again(self):
        result = self.send(operation_id="same-operation")
        replay = self.runner.replay(self.trial, "same-operation")
        self.assertEqual(replay, result)
        p = self.runner.preview(self.trial, "C1")
        with self.assertRaises(ResearchHold):
            self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"], operation_id="same-operation")
        with self.assertRaisesRegex(ResearchHold, "RESULT_UNKNOWN"):
            self.runner.replay(self.trial, "not-a-result")
        self.assertEqual(self.transport.calls, 1)
        self.assertEqual(self.runner.status(self.trial)["reserved_microUSD"], 160000)

    def test_failure_halts_without_replacement(self):
        class Failure(OfflineTransport):
            def send(self, *args):
                self.calls += 1
                raise TimeoutError("synthetic transport timeout")
        self.runner.transport = Failure()
        with self.assertRaisesRegex(ResearchHold, "NO_RETRY_OR_REFUND"):
            self.send()
        self.assertEqual(self.runner.transport.calls, 1)
        self.assertEqual(self.runner.status(self.trial)["attempts"], 1)
        with self.assertRaises(ResearchHold):
            self.runner.preview(self.trial, "C1")
        EVIDENCE.append({"test": "timeout", "state": self.runner.status(self.trial)})

    def test_misbound_model_incomplete_tool_and_usage_overrun_are_quarantined_not_retried(self):
        for fault in ["binding", "model", "incomplete", "tools", "usage", "reasoning"]:
            trial = "fault-" + fault
            self.runner.create(trial, offline=True)
            class Broken(OfflineTransport):
                def send(self, *args):
                    envelope = super().send(*args)
                    raw = envelope.response
                    if fault == "binding":
                        return TransportResult("other-operation", envelope.payload_sha256, envelope.binding, raw)
                    if fault == "model": raw["model"] = "another-model"
                    if fault == "incomplete": raw["status"] = "incomplete"
                    if fault == "tools": raw["output"] = [{"type": "function_call"}]
                    if fault == "usage": raw["usage"]["output_tokens"] = 2049
                    if fault == "reasoning":
                        raw["output"].insert(0, {"type": "reasoning", "summary": [{"text": "DO_NOT_PERSIST_REASONING_CANARY"}]})
                    return envelope
            transport = Broken()
            runner = ResearchRunner(self.store, transport, validator=FastValidation(), now=lambda: self.clock)
            p = runner.preview(trial, "C1")
            if fault == "reasoning":
                value = runner.execute(trial, "C1", preview_hash=p["body_sha256"])
                with self.store.transaction() as db:
                    self.assertNotIn("DO_NOT_PERSIST_REASONING_CANARY", json.dumps(self.store.get(db, "candidate", value["operation"])))
            else:
                with self.assertRaises(ResearchHold):
                    runner.execute(trial, "C1", preview_hash=p["body_sha256"])
                self.assertEqual(runner.status(trial)["status"], "HALTED")
            self.assertEqual(transport.calls, 1)
            self.assertEqual(runner.status(trial)["reserved_microUSD"], 160000)

    def test_race_at_final_slot_accepts_twelve_never_thirteen(self):
        for index in range(11):
            if index == 6:
                self.clock += 601
            cid = "C" + str(index // 3 + 1)
            self.accept(self.send(cid))
        p = self.runner.preview(self.trial, "C4")
        def last():
            try:
                r = ResearchRunner(ResearchStore(self.root, now=lambda: self.clock), self.transport,
                                   validator=FastValidation(), now=lambda: self.clock)
                return r.execute(self.trial, "C4", preview_hash=p["body_sha256"])["operation"]
            except ResearchHold:
                return None
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            result = list(pool.map(lambda _: last(), range(2)))
        self.assertEqual(sum(x is not None for x in result), 1)
        self.assertEqual(self.transport.calls, 12)
        self.assertEqual(self.runner.status(self.trial)["reserved_microUSD"], 1920000)

    def test_account_rate_state_persists_between_trials_and_is_not_client_supplied(self):
        for index in range(10):
            trial = "rate-" + str(index)
            self.runner.create(trial, offline=True)
            p = self.runner.preview(trial, "C1")
            value = self.runner.execute(trial, "C1", preview_hash=p["body_sha256"])
            for reviewer in ["offline-reviewer-a", "offline-reviewer-b"]:
                self.runner.review(trial, value["operation"], reviewer, accept=True,
                                   scores=SCORES, flags=FLAGS, expected_sha256=value["sha256"])
        p = self.runner.preview(self.trial, "C1")
        with self.assertRaisesRegex(ResearchHold, "IP_RATE"):
            self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"])
        self.assertEqual(self.runner.status(self.trial)["attempts"], 0)
        self.clock += 601
        self.send()
        self.assertEqual(self.transport.calls, 11)

    def test_missing_ledger_and_acl_widening_and_interrupted_anchor_commit_hold(self):
        ledger = self.store.db_path.read_bytes()
        self.store.db_path.unlink()
        with self.assertRaises(ResearchHold):
            ResearchStore(self.root)
        self.store.db_path.write_bytes(ledger)
        system = Path(os.environ["SystemRoot"]) / "System32/icacls.exe"
        subprocess.run([str(system), str(self.root), "/grant", "*S-1-1-0:R"],
                       capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        with self.assertRaises(ResearchHold):
            ResearchStore(self.root)
        self.store.protection.restrict(self.root)
        p = self.runner.preview(self.trial, "C1")
        with patch.object(self.store, "_anchor_write", side_effect=OSError("injected interrupted commit")):
            with self.assertRaises(ResearchHold):
                self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"])
        self.assertEqual(self.transport.calls, 0)
        with self.assertRaises(ResearchHold):
            ResearchStore(self.root)

    def test_native_semantic_guard_and_revoked_policy_hold_candidates(self):
        class Unsafe(OfflineTransport):
            def send(self, *args):
                envelope = super().send(*args)
                envelope.response["output"][0]["content"][0]["text"] = "Bạn chắc chắn bị trầm cảm."
                return envelope
        self.runner.transport = Unsafe()
        self.runner.validator = NativeResearchValidation()
        with self.assertRaises(ResearchHold):
            self.send()
        self.assertEqual(self.runner.status(self.trial)["status"], "HALTED")
        other = "revoked-policy"
        self.runner.create(other, offline=True)
        class Revoke(NativeResearchValidation):
            def before_finish(self, controller, prepared):
                controller.policy.revoke(prepared["decision"]["template_id"])
        runner = ResearchRunner(self.store, OfflineTransport(), validator=Revoke(), now=lambda: self.clock)
        p = runner.preview(other, "C1")
        with self.assertRaises(ResearchHold):
            runner.execute(other, "C1", preview_hash=p["body_sha256"])

    def test_retention_also_removes_private_source_disclosures(self):
        trial = "disclosure"
        self.runner.create(trial)
        self.runner.approval_preview(trial, "C3")
        self.clock += 7200 + 7 * 86400 + 1
        self.runner.purge(trial)
        with self.store.transaction() as db:
            self.assertIsNone(self.store.get(db, "approval-disclosure", trial + ":C3"))
        with self.assertRaises(ResearchHold):
            self.runner.approval_preview(trial, "C3")

    def test_crash_before_and_after_transport_recovery_does_not_regenerate(self):
        for phase in ["after-reservation", "after-transport"]:
            trial = phase
            self.runner.create(trial, offline=True)
            p = self.runner.preview(trial, "C1")
            def crash(where):
                if where == phase:
                    raise SystemExit("injected process death")
            with self.assertRaises(SystemExit):
                self.runner.execute(trial, "C1", preview_hash=p["body_sha256"], operation_id=phase, crash=crash)
            calls = self.transport.calls
            restarted = ResearchRunner(ResearchStore(self.root, now=lambda: self.clock), self.transport,
                                       validator=FastValidation(), now=lambda: self.clock)
            state = restarted.recover(trial)
            self.assertEqual(state["status"], "HALTED")
            self.assertEqual(state["reserved_microUSD"], 160000)
            with self.assertRaises(ResearchHold):
                restarted.replay(trial, phase)
            with self.assertRaises(ResearchHold):
                restarted.preview(trial, "C1")
            self.assertEqual(calls, self.transport.calls)

    def test_concurrent_duplicates_only_one_durable_attempt(self):
        p = self.runner.preview(self.trial, "C1")
        def run():
            try:
                r = ResearchRunner(ResearchStore(self.root, now=lambda: self.clock), self.transport,
                                   validator=FastValidation(), now=lambda: self.clock)
                r.execute(self.trial, "C1", preview_hash=p["body_sha256"])
                return "accepted"
            except ResearchHold:
                return "held"
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: run(), range(2)))
        self.assertEqual(results.count("accepted"), 1)
        self.assertEqual(self.transport.calls, 1)
        self.assertEqual(self.runner.status(self.trial)["attempts"], 1)

    def test_storage_tamper_missing_ledger_and_rollback_fail_closed(self):
        old = self.store.db_path.read_bytes()
        self.send()
        self.store.db_path.write_bytes(old)
        with self.assertRaisesRegex(ResearchHold, "ROLLBACK_TAMPER"):
            ResearchStore(self.root)
        with self.assertRaisesRegex(ResearchHold, "REFUSE_LEDGER_RESET"):
            ResearchStore(self.root, create=True)

    def test_retention_scrubs_content_preserves_budget_and_blocks_replay(self):
        result = self.send()
        self.clock += 7200 + 7 * 86400 + 1
        self.runner.purge(self.trial)
        with self.assertRaises(ResearchHold):
            self.runner.replay(self.trial, result["operation"])
        state = self.runner.status(self.trial)
        self.assertEqual(state["attempts"], 1)
        self.assertEqual(state["reserved_microUSD"], 160000)
        with self.store.transaction() as db:
            self.assertIsNone(self.store.get(db, "candidate", result["operation"]))
            self.assertIsNone(self.store.get(db, "validated", result["operation"]))
        with self.assertRaises(ResearchHold):
            self.runner.create(self.trial, offline=True)

    def test_review_binding_two_reviewers_rejection_and_no_premature_history_advance(self):
        result = self.send()
        with self.assertRaises(ResearchHold):
            self.runner.review(self.trial, result["operation"], "unconfigured", accept=True,
                               scores=SCORES, flags=FLAGS, expected_sha256=result["sha256"])
        with self.assertRaises(ResearchHold):
            self.runner.review(self.trial, result["operation"], "offline-reviewer-a", accept=True,
                               scores=SCORES, flags=FLAGS, expected_sha256="wrong")
        with self.assertRaises(ResearchHold):
            p = self.runner.preview(self.trial, "C1")
            self.runner.execute(self.trial, "C1", preview_hash=p["body_sha256"])
        self.runner.review(self.trial, result["operation"], "offline-reviewer-a", accept=False,
                           scores=SCORES, flags=FLAGS, expected_sha256=result["sha256"])
        self.assertEqual(self.runner.status(self.trial)["status"], "HALTED")
        self.assertEqual(self.transport.calls, 1)

    def test_native_controller_validates_sealed_candidate_and_correction_without_paid_regeneration(self):
        self.runner.validator = NativeResearchValidation()
        results = []
        for _ in range(3):
            value = self.send("C2")
            self.accept(value)
            self.assertFalse(value["proof"]["actual_execution_eligible"])
            self.assertEqual(value["proof"]["permission_observation"]["evaluation_result"], "HOLD_ACTUAL_EXECUTION")
            results.append(value)
        self.assertEqual(self.transport.calls, 3)
        EVIDENCE.append({"test": "native-control-and-correction", "results": results})

    def test_original_validator_rejects_changed_post_validation_bytes(self):
        class Swap(NativeResearchValidation):
            def before_finish(self, controller, prepared):
                prepared["body"] += " altered-after-validation"
        self.runner.validator = Swap()
        with self.assertRaises(ResearchHold):
            self.send()
        self.assertEqual(self.runner.status(self.trial)["status"], "HALTED")


if __name__ == "__main__":
    out = ROOT / "docs/evidence/research-implementation"
    out.mkdir(parents=True, exist_ok=True)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ResearchTests))
    (out / "offline-trace.json").write_text(json.dumps({"executed": True, "tests": result.testsRun,
        "failures": len(result.failures), "errors": len(result.errors), "skips": len(result.skipped),
        "paid_calls": 0, "real_source_grants_created": 0, "live_enabled": False,
        "scope": "Actual Windows ACL/DPAPI/SQLite plus synthetic transports; not model quality or actual research permission",
        "evidence": EVIDENCE}, ensure_ascii=False, indent=2), encoding="utf8")
    sys.exit(0 if result.wasSuccessful() else 1)
