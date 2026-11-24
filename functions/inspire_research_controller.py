"""Reuse original 0.4.0 checks on a sealed, already-quarantined candidate.

No provider adapter or website delivery is reachable here. MockSink is a native
control-test receipt, never permission to generate or deliver an actual reply.
"""
from dataclasses import asdict
import hashlib
import json
import secrets
from pathlib import Path
import sys
from inspire_research_store import ResearchHold, canonical, digest

_loaded = False


def original_modules():
    global _loaded
    root = Path(__file__).resolve().parents[1] / ".private.local/controller040-preview/INSPIRE_AI_040"
    if not _loaded:
        manifest = (root / "manifests/package_manifest.json").read_bytes()
        if digest(manifest) != "7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a":
            raise ResearchHold("CONTROLLER_MANIFEST_HOLD")
        for row in json.loads(manifest)["files"]:
            path = (root / row["path"]).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ResearchHold("CONTROLLER_PATH_HOLD")
            data = path.read_bytes()
            if len(data) != row["bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
                raise ResearchHold("CONTROLLER_SOURCE_INTEGRITY_HOLD")
        sys.dont_write_bytecode = True
        sys.path.insert(0, str(root))
        _loaded = True
    from studio.conversation import ConversationController
    from studio.adapters import Generation
    from integrity_eval.runtime import Session
    from deep_eval.contract import Utterance
    return ConversationController, Generation, Session, Utterance


class NativeResearchValidation:
    def validate(self, text, request, previous, binding, *, profile=None, origin="RESEARCH_OFFLINE_CANDIDATE", model="gpt-6.1-sol"):
        Controller, Generation, Session, Utterance = original_modules()
        if len(text.encode("utf-16-le")) // 2 > 2000 or not text.strip() or any(ord(c) < 32 and c not in "\n\r\t" for c in text):
            raise ResearchHold("RESEARCH_OUTPUT_LENGTH_OR_CONTROL_HOLD")

        class SealedCandidate:
            def generate(self, messages, profile):
                # Native model_messages may contain proposal excerpts internally.
                # They are NEVER sent to the research transport from this path.
                return Generation(text, origin, model)

        session = Session(request["sessionId"] + ":" + request["conversationId"])
        if previous:
            if previous["session_id"] != session.session_id:
                raise ResearchHold("CONTROLLER_STATE_BINDING_HOLD")
            session.revision = previous["revision"]
            session.history = [Utterance.model_validate(u) for u in previous["history"]]
            session.ledger_history = previous["ledger_history"]
            session.unresolved_safety_followup = previous["unresolved_safety_followup"]
        controller = Controller({"sealed-quarantine": SealedCandidate()}, secrets.token_bytes(32))
        dialogue = [{"role": m["role"], "text": m["text"],
                     **({"correction_of": m["correctionOf"]} if "correctionOf" in m else {})}
                    for m in request["messages"]]
        prepared = controller.prepare(session, dialogue[-1]["text"], dialogue,
                                      profile or {"language": "vi-VN", "addressing": "neutral", "display_name": ""},
                                      "sealed-quarantine", action_id=request["operationId"], binding=binding)
        if prepared["generation"]["origin"] != origin:
            raise ResearchHold("NATIVE_SAFETY_GATE_HELD_CANDIDATE")
        self.before_finish(controller, prepared)
        result = controller.finish(session, prepared)
        if (result["actual_execution_eligible"] is not False or
                result["text"] != text.strip() or result["response_sha256"] != digest(result["text"].encode())):
            raise ResearchHold("CONTROLLER_EXACT_OUTPUT_HOLD")
        state = {"session_id": session.session_id, "revision": session.revision,
                 "history": [u.model_dump() for u in session.history],
                 "ledger_history": session.ledger_history,
                 "unresolved_safety_followup": session.unresolved_safety_followup}
        proof = {"origin": result["model_origin"], "validated_sha256": result["response_sha256"],
                 "candidate_sha256_before_native_strip": digest(text.encode()),
                 "decision_fingerprint": result["decision_fingerprint"], "mock_control_receipt": result["receipt"],
                 "permission_observation": prepared["permission_observation"],
                 "actual_execution_eligible": False, "user_delivery": False,
                 "checks_executed": ["Source/excerpt integrity", "Research triage", "Quote-bound ledger",
                                     "Non-MOCK ScopeGuard", "PermissionInspector (actual execution held)",
                                     "GeneratedValidator HMAC", "MockSink exact bytes/source/policy recheck",
                                     "Native receipt-bound Session.commit"],
                 "not_established": ["Clinical validation", "Actual model or user-delivery permission"]}
        return {"text": result["text"], "state": state, "proof": proof}

    def before_finish(self, controller, prepared):
        """No-op extension point used only by negative-control tests."""
