"""Network-disabled native checks for private Luna evaluation, never a sender."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import json
import socket


def blocked(*args, **kwargs):
    raise RuntimeError("NETWORK_DISABLED")


socket.socket.connect = blocked
socket.socket.connect_ex = blocked
socket.create_connection = blocked
from inspire_research_controller import NativeResearchValidation

try:
    packet = json.load(sys.stdin)
    if set(packet) != {"kind", "request", "previous", "binding", "text"}:
        raise RuntimeError("INVALID_NATIVE_PACKET")
    if packet["kind"] not in {"preflight", "validate"}:
        raise RuntimeError("INVALID_NATIVE_PHASE")
    preflight = packet["kind"] == "preflight"
    result = NativeResearchValidation().validate(
        "Đang kiểm tra giới hạn của bản thử riêng." if preflight else packet["text"],
        packet["request"], packet["previous"], packet["binding"],
        profile={"language": "vi-VN", "addressing": "neutral", "display_name": ""},
        origin="LUNA_PREFLIGHT_PROBE" if preflight else "PRIVATE_LUNA_GENERATED_CANDIDATE",
        model="gpt-6-luna")
    # The probe never commits state for the real candidate or enters a timeline.
    print(json.dumps({"ok": True, "binding": packet["binding"],
                      "operationId": packet["request"]["operationId"],
                      "text": None if preflight else result["text"],
                      "state": None if preflight else result["state"],
                      "proof": result["proof"]}, ensure_ascii=False))
except Exception:
    # No raw exception, prompt, private excerpt or profile is returned/logged.
    print(json.dumps({"ok": False, "code": "NATIVE_CONTROLLER_HOLD"}))
