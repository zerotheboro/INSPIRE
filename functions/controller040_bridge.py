"""Scope A JSON-lines bridge to the unmodified private 0.4.0 Controller.

No server/frontend from the package is started. No model/provider or permission
record is created. All sockets are disabled before importing package modules.
"""
import sys
sys.dont_write_bytecode = True
import os
import json
import secrets
import socket
import hashlib
from pathlib import Path
from dataclasses import asdict


def no_network(*args, **kwargs):
    raise RuntimeError("NETWORK_DISABLED_SCOPE_A_BRIDGE")


socket.socket.connect = no_network
socket.socket.connect_ex = no_network
socket.create_connection = no_network
root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
for record in json.loads((root / "manifests/package_manifest.json").read_text(encoding="utf-8"))["files"]:
    file = (root / record["path"]).resolve()
    if not file.is_relative_to(root):
        raise RuntimeError("PACKAGE_PATH_HOLD")
    data = file.read_bytes()
    if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise RuntimeError("PACKAGE_INTEGRITY_HOLD")

from studio import conversation as conversation
from studio.adapters import SimulationAdapter, Generation, ModelError
from integrity_eval.runtime import Session, MockSink
from integrity_eval.permissions import PermissionInspector
from integrity_eval.triage import ResearchSignalDetector
from deep_eval.sources import canonical, digest

events = []


def event(stage, **detail):
    events.append({"stage": stage, **detail})


original_load = conversation.load_cards
original_ledger = conversation.validate_ledger


def traced_load():
    cards = original_load()
    event("Source Verification", result="HASH_AND_EXCERPT_CHECKS_EXECUTED", cards=len(cards))
    return cards


def traced_ledger(*args):
    result = original_ledger(*args)
    event("Ledger Validation", result="STRUCTURAL_AND_QUOTE_CHECKS_EXECUTED", semantic_validation=False)
    return result


conversation.load_cards = traced_load
conversation.validate_ledger = traced_ledger


class Inspector(PermissionInspector):
    def inspect(self, scope):
        value = super().inspect(scope)
        event("Permission Inspector", **value.as_dict())
        return value


class Policy(conversation.ConversationPolicy):
    def eligible(self, decision):
        result = super().eligible(decision)
        event("Mock Policy", eligible=result, policy_epoch=self.epoch,
              actual_execution_eligible=False, actual_permission_record_supplied=False)
        return result


class Guard(conversation.ScopeGuard):
    def check(self, text, **kwargs):
        super().check(text, **kwargs)
        event("Scope Guard", result="FORMAT_CHECK_EXECUTED", origin=kwargs["origin"],
              mock_branch_skips_semantic_rules=kwargs["origin"] == "MOCK", clinical_validation=False)


class Validator(conversation.GeneratedValidator):
    def validate(self, decision, body):
        result = super().validate(decision, body)
        event("Output Validation", result="EXACT_BYTES_ATTESTED", sha256=digest(body))
        return result

    def verify(self, decision, body, attestation):
        try:
            super().verify(decision, body, attestation)
        except Exception:
            event("Output Recheck", result="REJECTED_CHANGED_OR_EXPIRED_BYTES")
            raise
        event("Output Recheck", result="EXACT_ATTESTED_BYTES_VERIFIED", sha256=digest(body))


class Triage(ResearchSignalDetector):
    def evaluate(self, *args):
        result = super().evaluate(*args)
        event("Safety Triage", result="PACKAGE_HEURISTIC_EXECUTED", priority=result.priority,
              clinical_validation=False)
        return result


class Sink(MockSink):
    def submit(self, *args):
        receipt = super().submit(*args)
        event("Mock Sink", result="SOURCE_POLICY_REVISION_AND_RECEIPT_CHECKS_EXECUTED", receipt=asdict(receipt))
        return receipt


class Case(Session):
    def commit(self, *args):
        super().commit(*args)
        event("State Commit", result="RECEIPT_LEDGER_AND_REVISION_CHECKS_EXECUTED", revision=self.revision)


class Offline(SimulationAdapter):
    def __init__(self):
        self.context = None
        self.fault = None

    def generate(self, messages, profile):
        # A structured input, not concatenated instructions. The original MOCK
        # generator ignores supporting knowledge; no grounded answer is claimed.
        constructed_input = {"controller_messages": messages, "website_context": self.context}
        event("Offline Adapter Input", roles=[message["role"] for message in messages],
              dialogue=[message for message in messages if message["role"] != "system"],
              website_sources=[{k: section[k] for k in ("documentId", "version", "hash", "sectionId", "sourceStatus", "text")}
                               for section in self.context["supportingKnowledge"]],
              constructed_input_sha256=digest(canonical(constructed_input)),
              website_context_sha256=digest(canonical(self.context)),
              system_prompt_sha256=digest(messages[0]["content"].encode()),
              working_sections_present={section: ("# " + section + ".") in messages[0]["content"]
                                        for section in ("XCII", "XCIII", "CLVI", "CLVII", "CLIX", "CLXIII")},
              working_parent_source_sha256="931985119075683652b770b93f1f08c889b1acc3e74fa5dd6dcbd5caf22f8ef3",
              working_parent_status="PROPOSAL_PENDING_REVIEW_NOT_PERMISSION",
              uses_knowledge_for_generative_answer=False)
        if self.fault == "technical_before_generate":
            raise ModelError("OFFLINE_TECHNICAL_FAILURE")
        if self.fault == "invalid_output":
            return Generation("", "MOCK", "injected-invalid-offline-output")
        # Original package implementation, not evaluation answers or fixtures.
        return super().generate(messages, profile)


sessions = {}
operations = {}
epoch = secrets.token_hex(16)


def run(packet):
    global events
    events = []
    request, context = packet["request"], packet["context"]
    binding = digest(canonical({"request": request, "context": context}))
    if binding != packet["binding"]:
        raise ValueError("CONTEXT_BINDING_HOLD")
    key = request["sessionId"] + ":" + request["conversationId"]
    op_key = key + ":" + request["operationId"]
    if op_key in operations:
        old = operations[op_key]
        if old["binding"] != binding:
            raise ValueError("OPERATION_BINDING_HOLD")
        return {**old["result"], "bridge_replay": True}
    messages = request["messages"]
    if key not in sessions:
        if len(messages) != 1:
            raise ValueError("CONTROLLER_STATE_LOST")
        if len(sessions) >= 100:
            raise ValueError("CONTROLLER_CAPACITY")
        offline = Offline()
        controller = conversation.ConversationController(
            {"mock": offline}, secrets.token_bytes(32), guard=Guard(),
            detector=Triage(), validator=Validator(secrets.token_bytes(32)),
            policy=Policy(), sink=Sink())
        controller.policy.permission_inspector = Inspector()
        sessions[key] = {"case": Case(key), "controller": controller, "adapter": offline,
                         "prior_input": [], "prior_output": None}
    local = sessions[key]
    if local["prior_input"]:
        expected = local["prior_input"]
        if (len(messages) != len(expected) + 2 or messages[:len(expected)] != expected
                or messages[-2]["role"] != "assistant" or messages[-2]["text"] != local["prior_output"]):
            raise ValueError("CONTROLLER_HISTORY_HOLD")
    fault = packet.get("fault")
    controller, case = local["controller"], local["case"]
    offline = local["adapter"]
    offline.context, offline.fault = context, fault
    preferences = context["userStatedPreferences"]
    styles = {"Bác – cháu": "bac_chau", "Bác – tôi": "bac_toi", "Anh – tôi": "anh_toi", "Chị – tôi": "chi_toi"}
    profile = {"language": "en" if preferences["language"] == "en" else "vi-VN",
               "addressing": styles.get(preferences["address"], "neutral"), "display_name": preferences["name"]}
    dialogue = [{"role": item["role"], "text": item["text"],
                 **({"correction_of": item["correctionOf"]} if "correctionOf" in item else {})} for item in messages]
    prepared = None
    try:
        if fault == "deny_mock":
            controller.policy.revoke("generated_foundational." + profile["language"])
        prepared = controller.prepare(case, messages[-1]["text"], dialogue, profile, "mock",
                                      action_id=request["operationId"], binding=binding)
        if fault == "post_validation_swap":
            prepared["body"] += " CHANGED_AFTER_VALIDATION"
        if fault == "revoke_before_use":
            controller.policy.revoke(prepared["decision"]["template_id"])
        result = controller.finish(case, prepared)
        if result["actual_execution_eligible"] is not False:
            raise ValueError("ACTUAL_PERMISSION_HOLD")
        if digest(result["text"].encode()) != result["response_sha256"]:
            raise ValueError("FINAL_BYTES_HOLD")
        local["prior_input"], local["prior_output"] = messages, result["text"]
        status, text = "completed", result["text"]
        receipt = result["receipt"]
        if fault == "process_loss_after_receipt":
            os._exit(72)  # Internal regression hook, never a browser field.
    except Exception as error:
        receipt = controller.sink.receipts.get(request["operationId"])
        receipt = asdict(receipt) if receipt else None
        status, text = ("unknown" if receipt else "confirmed-no-reply"), None
        event("Technical Hold", error_type=type(error).__name__, code=getattr(error, "code", str(error))[:160],
              no_inference_about_user=True)
    output = {"status": status, "text": text, "binding": binding, "epoch": epoch,
              "operationId": request["operationId"], "conversationId": request["conversationId"],
              "response_sha256": digest(text.encode()) if text is not None else None,
              "decision_fingerprint": receipt["decision_fingerprint"] if receipt else None,
              "receipt": receipt, "checks": list(events), "bridge_replay": False,
              "actual_execution_eligible": False, "deployment_permission": False,
              "controller_revision": case.revision}
    operations[op_key] = {"binding": binding, "result": output}
    return output


print(json.dumps({"ready": True, "epoch": epoch, "scope": "A_SYNTHETIC_ONLY", "network": "disabled"}), flush=True)
for line in sys.stdin.buffer:
    try:
        if len(line) > 512000:
            raise ValueError("RPC_SIZE_HOLD")
        packet = json.loads(line.decode("utf-8", errors="strict"))
        output = run(packet)
        print(json.dumps({"id": packet["id"], **output}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({"id": packet.get("id") if isinstance(locals().get("packet"), dict) else None,
                          "status": "protocol-hold", "error_type": type(error).__name__}), flush=True)
