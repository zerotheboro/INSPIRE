"""Synthetic emulator identity integration; ID token arrives only on stdin."""
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import uuid
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions"))
from inspire_research import ResearchRunner, OfflineTransport
from inspire_research_store import ResearchStore, WindowsProtection
from inspire_research_admission import EmulatorAdmission

input_data = json.loads(sys.stdin.read())
token = input_data["token"]
path = ResearchStore.default_root("offline-test-" + uuid.uuid4().hex)
store = ResearchStore(path, create=True)
try:
    admission = EmulatorAdmission(lambda: token)
    transport = OfflineTransport()
    runner = ResearchRunner(store, transport, admission=admission)
    trial = "emulator-" + uuid.uuid4().hex
    runner.create(trial, offline=True)
    preview = runner.preview(trial, "C1")
    candidate = runner.execute(trial, "C1", preview_hash=preview["body_sha256"])
    for reviewer in ["offline-reviewer-a", "offline-reviewer-b"]:
        runner.review(trial, candidate["operation"], reviewer, accept=True,
                      scores={k: 4 for k in ["naturalness", "relevance", "continuity", "preferences"]},
                      flags={k: False for k in ["invented_facts", "invented_sources", "unsafe", "authority_claim", "privacy_leak"]},
                      expected_sha256=candidate["sha256"])
    runner.replay(trial, candidate["operation"])
    state = runner.status(trial)
    assert transport.calls == 1
    assert state["admission_domain"] == "firebase-demo-emulator"
    print(json.dumps({"executed": True, "mock_transport_calls": transport.calls,
                      "replay_added_calls": 0, "state": state, "proof": candidate["proof"]}))
finally:
    base = WindowsProtection().base.resolve()
    if path.resolve().is_relative_to(base) and path.name.startswith("offline-test-"):
        for file in path.iterdir():
            if file.is_file() and not file.is_symlink():
                file.unlink()
        path.rmdir()
