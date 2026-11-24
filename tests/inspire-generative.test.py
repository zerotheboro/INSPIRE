"""Offline interface and original generated-text Controller tests; no API calls."""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import socket
import unittest
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / ".private.local/controller040-preview/INSPIRE_AI_040"


def no_network(*args, **kwargs):
    raise AssertionError("Network forbidden in offline candidate tests")


socket.socket.connect = no_network
socket.socket.connect_ex = no_network
socket.create_connection = no_network
manifest = (PACKAGE / "manifests/package_manifest.json").read_bytes()
assert hashlib.sha256(manifest).hexdigest() == "7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a"
for record in json.loads(manifest)["files"]:
    path = (PACKAGE / record["path"]).resolve()
    assert path.is_relative_to(PACKAGE.resolve())
    data = path.read_bytes()
    assert len(data) == record["bytes"] and hashlib.sha256(data).hexdigest() == record["sha256"]
sys.path[:0] = [str(ROOT / "functions"), str(PACKAGE)]
from inspire_generative_adapter import DisabledGenerativeAdapter, CandidateHold, MODEL, sha
from studio.conversation import ConversationController, model_messages
from studio.adapters import ModelError
from integrity_eval.runtime import Session, Decision
from integrity_eval.output_validation import ExactOutputValidator
from integrity_eval.responses import TEMPLATES

OUT = ROOT / "docs/evidence/generative-preparation"
OUT.mkdir(parents=True, exist_ok=True)
TRACE = []
PREFERENCES = {"name": "Tên giả định", "address": "Bác – cháu", "language": "vi",
               "ageRange": "", "context": "Bối cảnh tổng hợp.", "desiredSupport": "Ngắn gọn."}
PROFILE = {"display_name": "Tên giả định", "addressing": "bac_chau", "language": "vi-VN"}
PASSAGE = "Đoạn tham chiếu tổng hợp cho kiểm thử: tên gọi cảm xúc có thể được người kể đính chính."
SOURCE = {"documentId": "SYNTHETIC-PERMITTED-INTERFACE", "version": 1,
          "hash": sha(PASSAGE.encode()), "sectionId": "fixture-1", "title": "SYNTHETIC TEST ONLY",
          "text": PASSAGE, "sourceStatus": "published-supporting"}


def state(messages=None):
    request = {"kind": "send", "epoch": "synthetic-epoch", "sessionId": "synthetic-session",
               "operationId": str(uuid4()), "conversationId": "synthetic-conversation",
               "messages": messages or [{"id": "u1", "role": "user", "text": "Chiều nay tôi chăm cây mai."}]}
    context = {"operatingInstructions": ["SYNTHETIC interface rule; not canonical INSPIRE Core."],
               "messages": deepcopy(request["messages"]), "userStatedPreferences": deepcopy(PREFERENCES),
               "supportingKnowledge": [deepcopy(SOURCE)]}
    return request, context


def dialogue(request):
    return [{"role": m["role"], "text": m["text"],
             **({"correction_of": m["correctionOf"]} if m.get("correctionOf") else {})}
            for m in request["messages"]]


def response(text):
    return {"id": "synthetic-response-" + str(uuid4()), "status": "completed", "model": MODEL,
            "output": [{"type": "message", "status": "completed", "role": "assistant",
                        "content": [{"type": "output_text", "text": text}]}]}


class OfflineHarness(DisabledGenerativeAdapter):
    """Only in tests. Supplies fresh candidate text, never an answer catalogue."""
    def __init__(self, request, context, complete):
        super().__init__(request, context)
        self.complete, self.calls, self.last_input = complete, 0, None

    def generate(self, messages, profile):
        self.last_input = self.prepare_offline(messages, profile)
        self.calls += 1
        raw = self.complete(self.last_input)
        return self.accept_offline_candidate(self.last_input, raw,
                                            binding=self.last_input.binding,
                                            operation_id=self.request["operationId"])


class GenerativeInterfaceTests(unittest.TestCase):
    def test_disabled_adapter_has_no_activation_or_model_path(self):
        request, context = state()
        adapter = DisabledGenerativeAdapter(request, context)
        self.assertFalse(adapter.available())
        with self.assertRaisesRegex(CandidateHold, "GENERATIVE_ADAPTER_DISABLED"):
            adapter.generate([], PROFILE)

    def test_exact_order_corrections_preferences_and_references_in_separate_data(self):
        messages = [{"id": "u1", "role": "user", "text": "Tôi giận người bạn. 🌿"},
                    {"id": "a1", "role": "assistant", "text": "Bạn muốn kể thêm không?"},
                    {"id": "u2", "role": "user", "text": "Tôi sửa lại: là đồng nghiệp, và tôi buồn hơn là giận.", "correctionOf": "u1"}]
        request, context = state(messages)
        adapter = DisabledGenerativeAdapter(request, context)
        native = model_messages(dialogue(request), PROFILE)
        prepared = adapter.prepare_offline(native, PROFILE)
        payload = prepared.payload()
        data = json.loads(payload["input"][0]["content"])
        self.assertEqual(payload["input"][1:], native[1:])
        self.assertEqual(payload["input"][1]["content"], messages[0]["text"])
        self.assertEqual(data["user_stated_preferences"], PREFERENCES)
        self.assertEqual(data["source_references_and_passages"], [SOURCE])
        self.assertEqual(data["correction_references"], [{"messageId": "u2", "correctionOf": "u1"}])
        self.assertNotIn(PASSAGE, payload["instructions"])
        self.assertFalse(payload["store"])
        self.assertEqual(payload["truncation"], "disabled")
        self.assertEqual(payload["tools"], [])
        TRACE.append({"check": "prepared-input", "executed": True, "network": "disabled",
                      "operationId": prepared.operation_id, "binding": prepared.binding,
                      "system_sha256_only_not_original_text": sha(payload["instructions"].encode()),
                      "dialogue": payload["input"][1:], "separate_supporting_data": data,
                      "control_parameters": {k: payload[k] for k in payload if k not in {"instructions", "input"}}})

    def test_rejects_authority_roles_invalid_corrections_replay_and_oversized_wire(self):
        for mutate in [lambda r,c: r.update(quota=999), lambda r,c: r.update(kind="replay"),
                       lambda r,c: r["messages"][0].update(role="system"),
                       lambda r,c: r["messages"][0].update(correctionOf="missing"),
                       lambda r,c: r["messages"][0].update(text="x" * 2001),
                       lambda r,c: c.update(permission=True)]:
            request, context = state(); mutate(request, context)
            context["messages"] = deepcopy(request["messages"])
            with self.assertRaises(CandidateHold):
                DisabledGenerativeAdapter(request, context).prepare_offline(model_messages(dialogue(request), PROFILE), PROFILE)
        request, context = state()
        with self.assertRaisesRegex(CandidateHold, "WIRE_SIZE"):
            DisabledGenerativeAdapter(request, context).prepare_offline(
                [{"role": "system", "content": "x" * 24001}, {"role": "user", "content": request["messages"][0]["text"]}], PROFILE)

    def test_response_binding_incomplete_refusal_and_tool_outputs_fail_closed(self):
        request, context = state(); adapter = DisabledGenerativeAdapter(request, context)
        p = adapter.prepare_offline(model_messages(dialogue(request), PROFILE), PROFILE)
        for mutation in [lambda r: r.update(status="incomplete"), lambda r: r.update(model="other-model"),
                         lambda r: r.update(output=[{"type": "function_call"}]),
                         lambda r: r.update(output=None), lambda r: r.update(output=[None]),
                         lambda r: r["output"][0].update(content=[{"type": "refusal"}])]:
            raw = response("Nội dung tổng hợp."); mutation(raw)
            with self.assertRaises(CandidateHold):
                adapter.accept_offline_candidate(p, raw, binding=p.binding, operation_id=p.operation_id)
        for binding, operation in [("wrong", p.operation_id), (p.binding, "other-request")]:
            with self.assertRaisesRegex(CandidateHold, "BINDING"):
                adapter.accept_offline_candidate(p, response("Nội dung tổng hợp."), binding=binding, operation_id=operation)
        raw = response("Nội dung tổng hợp.")
        raw["output"].insert(0, {"type": "reasoning", "summary": []})
        candidate = adapter.accept_offline_candidate(p, raw, binding=p.binding, operation_id=p.operation_id)
        self.assertEqual(candidate.text, "Nội dung tổng hợp.")

    def test_native_generated_validator_accepts_arbitrary_text_catalogue_validator_stays_exact(self):
        request, context = state()
        text = "  Chiều chăm cây mai có vẻ là một khoảng nghỉ dễ chịu. Mã thử tổng hợp: " + str(uuid4()) + ".  "
        harness = OfflineHarness(request, context, lambda _: response(text))
        controller = ConversationController({"offline-interface": harness}, b"synthetic-test-key")
        session = Session("synthetic-native-" + str(uuid4()))
        prepared = controller.prepare(session, request["messages"][-1]["text"], dialogue(request), PROFILE,
                                      "offline-interface", action_id=request["operationId"], binding="synthetic-bound-context")
        self.assertNotIn(text.strip(), TEMPLATES.values())
        self.assertEqual(prepared["generation"]["origin"], "OFFLINE_CANDIDATE_INTERFACE")
        self.assertEqual(prepared["permission_observation"]["evaluation_result"], "HOLD_ACTUAL_EXECUTION")
        with self.assertRaisesRegex(ValueError, "catalogue"):
            ExactOutputValidator().validate(Decision(**prepared["decision"]), prepared["body"].encode())
        result = controller.finish(session, prepared)
        self.assertEqual(result["text"], text.strip())
        self.assertEqual(result["receipt"]["response_sha256"], sha(result["text"].encode()))
        self.assertEqual(result["receipt"]["decision_fingerprint"], result["decision_fingerprint"])
        self.assertFalse(result["actual_execution_eligible"])
        TRACE.append({"check": "original-generated-controller", "executed": True, "fresh_non_catalogue_candidate": text,
                      "origin": prepared["generation"]["origin"], "semantic_scope_guard_branch": "non-MOCK",
                      "permission": prepared["permission_observation"], "decision": prepared["decision"],
                      "validated_and_mock_delivered_text": result["text"], "receipt": result["receipt"],
                      "delivery_domain": "MockSink ONLY; no actual model/delivery permission",
                      "catalogue_validator_unchanged_and_rejected_candidate": True})

    def test_native_semantic_rule_and_changed_bytes_and_revocation_are_enforced(self):
        request, context = state()
        for text, fault in [("Bạn chắc chắn bị trầm cảm.", "scope"),
                            ("Một lời đáp tổng hợp có dấu tiếng Việt để kiểm thử.", "swap"),
                            ("Một lời đáp tổng hợp có dấu tiếng Việt để kiểm thử.", "revoke")]:
            request["operationId"] = str(uuid4())
            harness = OfflineHarness(request, context, lambda _, text=text: response(text))
            controller = ConversationController({"offline-interface": harness}, b"synthetic-test-key")
            session = Session("synthetic-negative-" + str(uuid4()))
            if fault == "scope":
                with self.assertRaisesRegex(ModelError, "OUTPUT_SCOPE_HOLD"):
                    controller.prepare(session, request["messages"][-1]["text"], dialogue(request), PROFILE,
                                       "offline-interface", action_id=request["operationId"], binding="synthetic-binding")
            else:
                p = controller.prepare(session, request["messages"][-1]["text"], dialogue(request), PROFILE,
                                       "offline-interface", action_id=request["operationId"], binding="synthetic-binding")
                if fault == "swap": p["body"] += " altered-after-validation"
                else: controller.policy.revoke(p["decision"]["template_id"])
                with self.assertRaises((ValueError, ModelError)):
                    controller.finish(session, p)
            self.assertEqual(session.revision, 0)
            self.assertEqual(controller.sink.receipts, {})
            TRACE.append({"check": fault, "executed": True, "result": "HELD_NO_MOCK_DELIVERY", "actual_permission": False})

    def test_technical_failure_does_not_retry_or_manufacture_delivery(self):
        request, context = state()
        def fail(_): raise CandidateHold("SYNTHETIC_TRANSPORT_FAILURE_UNKNOWN")
        harness = OfflineHarness(request, context, fail)
        controller = ConversationController({"offline-interface": harness}, b"synthetic-test-key")
        session = Session("synthetic-failure")
        with self.assertRaisesRegex(CandidateHold, "TRANSPORT_FAILURE_UNKNOWN"):
            controller.prepare(session, request["messages"][-1]["text"], dialogue(request), PROFILE,
                               "offline-interface", action_id=request["operationId"], binding="synthetic-binding")
        self.assertEqual(harness.calls, 1)
        self.assertEqual(controller.sink.receipts, {})
        self.assertEqual(session.revision, 0)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(GenerativeInterfaceTests))
    (OUT / "offline-candidate-trace.json").write_text(json.dumps({"executed": True, "tests": result.testsRun,
        "original_package_payloads_verified": len(json.loads(manifest)["files"]),
        "original_manifest_sha256": hashlib.sha256(manifest).hexdigest(),
        "paid_calls": 0, "live_adapter_enabled": False, "actual_source_export_permission": False,
        "limitations": ["Offline interface/control tests, not generative quality.",
                        "Original proposal system text hashed only, never copied into this evidence.",
                        "MockSink receipt is not permission for generated model output."], "trace": TRACE},
        ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if result.wasSuccessful() else 1)
