"""Package only source, public website assets and review evidence; no runtimes."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / "INSPIRE-review-father-weekend-2026-11-24.zip"
exclude = {"node_modules", ".git", ".private.local", ".tools.local",
           "__pycache__", "dist", "lib"}
files = []
for path in root.rglob("*"):
    rel = path.relative_to(root)
    if any(part in exclude or part.startswith("firebase-export-")
           for part in rel.parts) or path.is_symlink():
        continue
    if not path.is_file():
        continue
    if path.name.startswith(".env") or path.name.endswith(
            (".zip", ".pyc", ".tsbuildinfo", "-debug.log")):
        continue
    if "core" == path.name:
        continue
    if path.suffix == ".log" and not str(rel).startswith("docs/weekend-checks/"):
        continue
    if any(name in path.name.lower() for name in
           ("api-key.txt", "authorization.json", "receipts.json")):
        continue
    files.append(path)

manifest = [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size,
             "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(files)]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        z.write(p, "INSPIRE-main/" + str(p.relative_to(root)))
    z.writestr("INSPIRE-main/WEEKEND_PAYLOAD_MANIFEST.json",
               json.dumps(manifest, indent=2))

with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    for item in manifest:
        data = z.read("INSPIRE-main/" + item["path"])
        assert len(data) == item["bytes"]
        assert hashlib.sha256(data).hexdigest() == item["sha256"]
print(json.dumps({"path": str(out), "bytes": out.stat().st_size,
                  "payloadFilesVerified": len(manifest),
                  "sha256": hashlib.sha256(out.read_bytes()).hexdigest()}))
