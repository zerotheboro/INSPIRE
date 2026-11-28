"""Use existing DPAPI/private ACL storage for held Luna output, never inference."""
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspire_research_store import ResearchStore, digest, canonical

try:
    packet = json.loads(sys.stdin.buffer.read(1000000).decode("utf8"))
    if set(packet) != {"action", "key", "value"}:
        raise ValueError()
    root = ResearchStore.default_root("luna-private-outputs")
    store = ResearchStore(root, create=not Path(root).exists())
    with store.transaction(write=True) as db:
        for row in db.execute("SELECT id FROM records WHERE kind='luna-output'").fetchall():
            old = store.get(db, "luna-output", row[0])
            if old and old["expiresAt"] <= time.time():
                store.purge_record(db, "luna-output", row[0])
        if packet["action"] == "store":
            value = {"expiresAt": time.time() + 7 * 86400,
                     "raw": packet["value"]}
            store.put(db, "luna-output", packet["key"], value)
            result = {"stored": True, "sha": digest(canonical(packet["value"]))}
        elif packet["action"] == "read":
            result = store.get(db, "luna-output", packet["key"])
        else:
            raise ValueError()
    print(json.dumps(result, ensure_ascii=False))
except Exception:
    print(json.dumps({"held": "PRIVATE_OUTPUT_STORAGE_HOLD"}))
    sys.exit(2)
