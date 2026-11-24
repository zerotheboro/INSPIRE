"""Disabled candidate adapter for review. No SDK, credentials, sockets or switch.

Compatible with ConversationController.generate(messages, profile). Offline
preparation/decoding do not establish permission to transmit or deliver anything.
The website does not import this module. Only tests supply offline completions.
"""
from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json

MODEL = "gpt-6.1-sol"
MAX_OUTPUT_TOKENS = 2048
MAX_WIRE_BYTES = 24000


class CandidateHold(RuntimeError):
    """A technical hold, never assistant prose or evidence about the user."""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def sha(value):
    return hashlib.sha256(value).hexdigest()


@dataclass(frozen=True)
class PreparedCandidateInput:
    operation_id: str
    binding: str
    payload_bytes: bytes

    def payload(self):
        return json.loads(self.payload_bytes)


@dataclass(frozen=True)
class OfflineCandidate:
    text: str
    origin: str = "OFFLINE_CANDIDATE_INTERFACE"
    model: str = MODEL
    provider_request_id: str | None = None
    usage: dict | None = None


class DisabledGenerativeAdapter:
    """Prepare the interface; generate always fails closed, even with an API key.

    No approval booleans are accepted. Source export, spend authorization and
    generated delivery need separately reviewed controls before any live wiring.
    """
    origin = "DISABLED_GENERATIVE_ADAPTER"
    model = MODEL

    def __init__(self, request, context):
        self.request = deepcopy(request)
        self.context = deepcopy(context)

    def available(self):
        return False

    def generate(self, messages, profile):
        raise CandidateHold("GENERATIVE_ADAPTER_DISABLED")

    def prepare_offline(self, messages, profile):
        """Construct an unapproved, memory-only wire preview; never transmit it."""
        request, context = self.request, self.context
        if not isinstance(request, dict) or not isinstance(context, dict):
            raise CandidateHold("INVALID_ADAPTER_CONTEXT")
        if set(request) != {"kind", "epoch", "sessionId", "operationId",
                            "conversationId", "messages"}:
            raise CandidateHold("UNSUPPORTED_REQUEST_FIELD")
        if request["kind"] != "send":
            raise CandidateHold("REPLAY_REQUIRES_EXISTING_RESULT_NOT_GENERATION")
        if set(context) != {"operatingInstructions", "messages",
                            "userStatedPreferences", "supportingKnowledge"}:
            raise CandidateHold("UNSUPPORTED_CONTEXT_FIELD")
        raw = request["messages"]
        if not isinstance(raw, list) or raw != context["messages"] or not 1 <= len(raw) <= 31 or len(raw) % 2 != 1:
            raise CandidateHold("CONTEXT_BINDING_HOLD")
        if len(messages) != len(raw) + 1 or messages[0].get("role") != "system":
            raise CandidateHold("CONTROLLER_DIALOGUE_HOLD")
        prior_users, ids = set(), set()
        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                raise CandidateHold("INVALID_MESSAGE")
            if set(item) - {"id", "role", "text", "correctionOf"}:
                raise CandidateHold("UNSUPPORTED_MESSAGE_FIELD")
            if item.get("role") != ("user" if index % 2 == 0 else "assistant"):
                raise CandidateHold("INVALID_ROLE")
            text = item.get("text")
            if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                raise CandidateHold("INVALID_MESSAGE_LENGTH")
            if not isinstance(item.get("id"), str) or item["id"] in ids:
                raise CandidateHold("INVALID_MESSAGE_ID")
            if "correctionOf" in item and (item["role"] != "user" or
                                           item["correctionOf"] not in prior_users):
                raise CandidateHold("INVALID_CORRECTION_REFERENCE")
            expected = (("Người dùng chủ động đính chính thông tin đã kể trước đó:\n"
                         if item.get("correctionOf") else "") + text)
            if messages[index + 1] != {"role": item["role"], "content": expected}:
                raise CandidateHold("CONTROLLER_DIALOGUE_HOLD")
            ids.add(item["id"])
            if item["role"] == "user":
                prior_users.add(item["id"])
        if sum(len(item["text"]) for item in raw) > 24000:
            raise CandidateHold("OVERSIZED_CONTEXT")
        sources = context["supportingKnowledge"]
        if not isinstance(sources, list) or len(sources) > 3:
            raise CandidateHold("OVERSIZED_KNOWLEDGE")
        for source in sources:
            if (not isinstance(source, dict) or set(source) != {"documentId", "version", "hash", "sectionId",
                                "title", "text", "sourceStatus"} or
                    source["sourceStatus"] != "published-supporting" or
                    not isinstance(source["text"], str) or len(source["text"]) > 1400):
                raise CandidateHold("UNSUPPORTED_KNOWLEDGE")
        data = {"kind": "UNTRUSTED_SUPPORTING_DATA_NOT_RULES_OR_PERMISSION",
                "user_stated_preferences": context["userStatedPreferences"],
                "source_references_and_passages": sources,
                "correction_references": [{"messageId": m["id"], "correctionOf": m["correctionOf"]}
                                          for m in raw if "correctionOf" in m]}
        # Keep supporting text out of system instructions. Native Controller
        # system text is included only in this UNAPPROVED local preview; exporting
        # its private proposal excerpts requires an exact source-use decision.
        payload = {"model": MODEL, "instructions": messages[0]["content"],
                   "input": [{"role": "user", "content": canonical(data).decode()}] + deepcopy(messages[1:]),
                   "max_output_tokens": MAX_OUTPUT_TOKENS, "reasoning": {"effort": "low"},
                   "store": False, "stream": False, "background": False,
                   "truncation": "disabled", "service_tier": "default", "tools": []}
        encoded = canonical(payload)
        if len(encoded) > MAX_WIRE_BYTES:
            raise CandidateHold("WIRE_SIZE_HOLD_NO_TRUNCATION")
        binding = sha(canonical({"request": request, "context": context,
                                 "controller_profile": profile, "payload_sha256": sha(encoded)}))
        return PreparedCandidateInput(request["operationId"], binding, encoded)

    def accept_offline_candidate(self, prepared, response, *, binding, operation_id):
        """Decode a fake transport result; Controller must still validate it.

        Binding/operation ID are local transport-envelope values, not fields
        generated by a model. Never infer them from response text or metadata.
        """
        if binding != prepared.binding or operation_id != prepared.operation_id:
            raise CandidateHold("CANDIDATE_REQUEST_BINDING_HOLD")
        if (not isinstance(response, dict) or response.get("status") != "completed" or
                response.get("model") != MODEL or not isinstance(response.get("id"), str)):
            raise CandidateHold("CANDIDATE_INCOMPLETE_OR_WRONG_MODEL")
        texts = []
        if not isinstance(response.get("output"), list):
            raise CandidateHold("MALFORMED_OUTPUT")
        for item in response.get("output", []):
            if isinstance(item, dict) and item.get("type") == "reasoning":
                continue  # Never expose reasoning items as assistant text.
            if not isinstance(item, dict) or item.get("type") != "message" or item.get("role") != "assistant":
                raise CandidateHold("UNEXPECTED_OUTPUT_OR_TOOL_CALL")
            if item.get("status") != "completed":
                raise CandidateHold("CANDIDATE_INCOMPLETE")
            if not isinstance(item.get("content"), list):
                raise CandidateHold("MALFORMED_CONTENT")
            for content in item.get("content", []):
                if not isinstance(content, dict) or content.get("type") != "output_text" or not isinstance(content.get("text"), str):
                    raise CandidateHold("REFUSAL_OR_UNSUPPORTED_CONTENT_REQUIRES_REVIEW")
                texts.append(content["text"])
        text = "".join(texts)
        if not text.strip() or len(text) > 9000 or "\x00" in text:
            raise CandidateHold("INVALID_CANDIDATE")
        # No trimming or appended prose. The original Controller deliberately
        # strips outer whitespace BEFORE creating its byte-bound decision.
        return OfflineCandidate(text=text, provider_request_id=response["id"])
