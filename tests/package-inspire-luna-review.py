"""Local review archive only. No deployment, credential access or model call."""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/luna-api-2026-11-14"
CHECKPOINT = Path(os.environ["TEMP"]) / "INSPIRE-before-luna-api-2026-11-14"
ARCHIVE = ROOT / "INSPIRE-review-luna-api-2026-11-14.zip"
if json.loads((ROOT / "package.json").read_text())["name"] != "inspire-vietnamese-wellness":
    raise RuntimeError("INSPIRE workspace required")
OUT.mkdir(parents=True, exist_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


before = json.loads((CHECKPOINT / "manifest.json").read_text())
listed = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT).decode().split("\0")
generated = {"tsconfig.app.tsbuildinfo", "tsconfig.node.tsbuildinfo"}
evidence = "docs/evidence/luna-api-2026-11-14/"
needed_metadata = {
    "docs/evidence/research-trial-plan-2026-11-10/owner-decision-matrix.json",
    "docs/evidence/research-trial-plan-2026-11-10/outbound-template-proposal.json",
}


def eligible(name):
    p = Path(name)
    if not name or not (ROOT / p).is_file():
        return False
    if any(part in {".git", "node_modules", ".private.local", ".tools.local", "__pycache__", "dist", "lib"} for part in p.parts):
        return False
    if p.name.startswith(".env") or p.name in {"api-key.txt", "authorization.json", "first-attempt.json"}:
        return False
    if p.suffix.lower() in {".zip", ".db", ".sqlite", ".sqlite3", ".pyc", ".pyo", ".log", ".pem", ".key", ".pfx", ".tsbuildinfo"}:
        return False
    if name.startswith("docs/evidence/"):
        if name in needed_metadata:
            return True
        if not name.startswith(evidence):
            return False
        if p.name in {"focused-milestone.patch", "package-verification.json", "archive-manifest.json"}:
            return False
        if p.name.endswith("-legacy-trace.json") or p.name in {"consolidation-offline-trace.json", "research-adapter-input-trace.json"}:
            return False
    return True


files = sorted(set(name for name in listed if eligible(name)))
changed = [name for name in files if not name.startswith("docs/evidence/") and
           (name not in before or sha((ROOT / name).read_bytes()) != before[name])]
old_changed = [name for name in before if (ROOT / name).is_file() and sha((ROOT / name).read_bytes()) != before[name]]
unexpected = [name for name in old_changed if name not in changed and name not in generated]
if unexpected:
    raise RuntimeError("Unexpected earlier-file changes: " + ", ".join(unexpected))
missing = [name for name in before if not (ROOT / name).exists()]
if missing:
    raise RuntimeError("Earlier files missing: " + ", ".join(missing))
save("preservation.json", {"baseline": "Exact pre-API-task working-tree checkpoint, not Git HEAD",
     "earlierFilesChecked": len(before), "earlierFilesByteUnchanged": len(before) - len(old_changed),
     "focusedChangedFiles": changed, "generatedBuildCachesExcluded": sorted(generated),
     "unexpectedEarlierChanges": unexpected, "missingEarlierFiles": missing,
     "Z_PROJECT": "Not accessed or modified by this milestone"})

# Use Git's diff encoder for exact newlines and new-file headers, then check the
# result against the captured uncommitted baseline OUTSIDE any Git repository.
stage = Path(tempfile.mkdtemp(prefix="inspire-luna-review-check-")).resolve()
for folder in ["before", "after", "apply-check"]:
    (stage / folder).mkdir()
for name in changed:
    for folder, src in [("before", CHECKPOINT / "files" / name), ("after", ROOT / name), ("apply-check", CHECKPOINT / "files" / name)]:
        if not src.exists():
            continue
        target = (stage / folder / name).resolve()
        if not target.is_relative_to(stage / folder):
            raise RuntimeError("Unexpected staging path")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
diff = subprocess.run(["git", "-c", "core.autocrlf=false", "-c", "core.quotePath=false", "diff", "--no-index", "--binary", "--", "before", "after"], cwd=stage, capture_output=True)
if diff.returncode not in {0, 1}:
    raise RuntimeError("Diff construction failed")
lines = diff.stdout.decode("utf-8").splitlines(keepends=True)
header = True
for i, line in enumerate(lines):
    if line.startswith("diff --git "):
        header = True
    if line.startswith("@@") or line.startswith("GIT binary patch"):
        header = False
    if header:
        lines[i] = re.sub(r"([ab])/(?:before|after)/", r"\1/", line)
patch = "".join(lines).encode("utf-8")
patch_path = OUT / "focused-milestone.patch"
patch_path.write_bytes(patch)
check = subprocess.run(["git", "-c", "core.autocrlf=false", "apply", "--check", str(patch_path)], cwd=stage / "apply-check", capture_output=True)
save("patch-check.json", {"executed": True, "exitCode": check.returncode,
     "passed": check.returncode == 0, "scope": "Read-only git apply --check against exact pre-task uncommitted files in an isolated directory outside Git",
     "workspacePatchApplied": False, "patchSHA256": sha(patch),
     "diagnostic": check.stderr.decode("utf-8", errors="replace")})
if check.returncode:
    raise RuntimeError("Focused patch does not apply to captured baseline")

checks = json.loads((OUT / "executed-checks.json").read_text())
if not all(row["passed"] for row in checks["results"].values()):
    raise RuntimeError("Current verification contains a failure")
test_counts = {}
for name, pattern in [("core", r"ℹ tests (\d+)"), ("consolidation", r"ℹ tests (\d+)"), ("research", r"Ran (\d+) tests")]:
    log = (OUT / (name + ".txt")).read_text(encoding="utf-8")
    found = re.findall(pattern, log)
    if not found or not log.rstrip().endswith("EXIT_CODE=0"):
        raise RuntimeError("Missing successful executed test count: " + name)
    test_counts[name] = int(found[-1])
total_tests = sum(test_counts.values())
save("browser-verification.json", {"browserInventoryExecuted": True,
     "renderedDesktop": "NOT VERIFIED", "renderedMobile": "NOT VERIFIED",
     "reason": "Browser access host is unavailable; no browser tabs were exposed",
     "genuineCurrentScreenshots": [], "httpIsNotVisualVerification": True})
save("pricing-evidence.json", {"checkedOn": "2026-11-14", "model": "gpt-6-luna",
     "primarySources": ["https://developers.openai.com/api/docs/models/gpt-6-luna", "https://developers.openai.com/api/docs/pricing"],
     "standardUSDPerMillion": {"input": 0.10, "output": 0.50},
     "reservedInputUSDPerMillion": 0.25, "outputTokenCap": 512,
     "reservationMethod": "UTF-8 body bytes plus 4096 framing tokens; no caching discount",
     "accountEntitlement": "UNVERIFIED; no real API credential read",
     "providerInvoiceObserved": False, "noPaidCall": True})
save("check-summary.json", {"executedAutomatedTests": total_tests,
     "passedAutomatedTests": total_tests, "testCountsFromExecutedLogs": test_counts,
     "bothBuildsPassed": True,
     "touchedBackendLintPassed": True, "privateAndProductionHTTPPassed": True,
     "realProviderRequests": 0, "generationArmed": False,
     "ownerAuthorizationCreated": False, "browser": "NOT VERIFIED",
     "retainedFailure": "core-concurrent-timeout.txt: an earlier parallel suite run hit the bounded 20-second native preflight; shared-emulator file suites are now serialized, while explicit concurrency regressions remain concurrent",
     "preExistingLimitations": ["Existing >500 KB frontend bundle advisory", "Global legacy booking lint failures were not part of touched-backend lint"],
     "unverified": ["Actual API authentication/model entitlement/billing receipt", "Generated Vietnamese quality and clinical validity", "Desktop/mobile browser rendering"]})

# Re-enumerate only our new evidence. Historical metadata fixtures are needed by
# existing offline tests; private original documents and runtimes are omitted.
files = sorted(set(files + [p.relative_to(ROOT).as_posix() for p in OUT.iterdir() if p.is_file() and eligible(p.relative_to(ROOT).as_posix())] + [patch_path.relative_to(ROOT).as_posix()]))
manifest_path = ROOT / ".private.local/controller040-preview/INSPIRE_AI_040/manifests/package_manifest.json"
private_original_hashes = {row["sha256"] for row in json.loads(manifest_path.read_text())["files"] if row["path"].startswith("sources/")}
entries = []
for name in files:
    data = (ROOT / name).read_bytes()
    if sha(data) in private_original_hashes:
        raise RuntimeError("A private original matched the archive candidate: " + name)
    for match in re.finditer(rb"(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{24,}", data):
        if not match.group().startswith((b"sk-offline_", b"sk-synthetic", b"sk-fake", b"sk-test")):
            raise RuntimeError("Possible API credential in archive candidate: " + name)
    entries.append({"path": name, "bytes": len(data), "sha256": sha(data)})
start = ("INSPIRE — private Luna API review, 14 November 2026\n\n"
         "Start with docs/inspire-luna-api.md and REVIEW.md.\n"
         f"{total_tests} automated tests, both builds, touched-backend lint and local HTTP checks passed.\n"
         "Browser rendering is NOT VERIFIED: browser access host unavailable. No current screenshots.\n"
         "Generation remains unarmed. No real API key, paid call or owner/source approval was created.\n"
         "The exact proposed source-free request and cost are in docs/evidence/luna-api-2026-11-14/proposed-single-request.json.\n"
         "The focused patch is relative to the pre-API-task working tree, including its earlier uncommitted work; it is not a Git HEAD diff.\n"
         "Private originals/Controller package, credentials, node_modules, portable runtimes, databases and generated build output are excluded.\n"
         "Native tests need the owner's separately retained exact Controller package/Python dependencies. Existing older reports are historical, not fresh approvals.\n")
with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for row in entries:
        archive.write(ROOT / row["path"], row["path"])
    archive.writestr("START-HERE.txt", start.encode("utf-8"))
    archive.writestr("ARCHIVE-MANIFEST.json", json.dumps({"files": entries, "excluded": ["private originals and indexes", "credentials and approvals", "runtime databases", "node_modules", "portable runtimes", "build caches", "Git metadata"]}, ensure_ascii=False, indent=2).encode("utf-8"))
with zipfile.ZipFile(ARCHIVE) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("ZIP CRC check failed")
    for row in entries:
        if sha(archive.read(row["path"])) != row["sha256"]:
            raise RuntimeError("ZIP entry hash mismatch")
save("package-verification.json", {"archive": ARCHIVE.name,
     "bytes": ARCHIVE.stat().st_size, "sha256": sha(ARCHIVE.read_bytes()),
     "sourceAndEvidenceFiles": len(entries), "allEntryHashesVerified": True,
     "crcVerified": True, "focusedPatchChecked": True,
     "privateOriginalDocumentsIncluded": False, "credentialsIncluded": False})
print(json.dumps({"archive": str(ARCHIVE), "bytes": ARCHIVE.stat().st_size,
                  "files": len(entries), "focusedChangedFiles": len(changed),
                  "patchCheck": check.returncode}, ensure_ascii=False))
