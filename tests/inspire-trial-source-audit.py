"""Read-only exact passage candidates, not a source-use or policy approval."""
import json
import re
import hashlib
from pathlib import Path

root = Path(".private.local/controller040-preview/INSPIRE_AI_040")
corpus = json.loads((root / "sources/verified_corpus_032.json").read_text(encoding="utf-8"))
current = json.loads((root / "manifests/SOURCE_VERSION_MANIFEST_040.json").read_text(encoding="utf-8"))
selection = [
    ("sources/recovered_20261104/INSPIRE-MOI-01_v1.0.txt",
     ["XCII", "XCIII", "CLVI", "CLVII", "CLIX", "CLXIII"], "proposed-operating-rules", "Native Controller system context; Proposal/Pending Review retained."),
    ("sources/recovered/INSPIRE-02.txt", ["4", "6", "93"],
     "proposed-reference-only", "Distinguish reported experience from interpretation, and preserve user corrections."),
    ("sources/recovered/INSPIRE-01.txt", ["33", "34"],
     "review-rationale-only-not-in-trial-input", "Keep reference knowledge, operating rules and intervention rights separate."),
]
records = []
for path, sections, use, rationale in selection:
    raw = (root / path).read_bytes()
    source = next(r for r in corpus["source_records"] if r["path"] == path)
    assert hashlib.sha256(raw).hexdigest() == source["sha256"]
    text = raw.decode("utf-8-sig")  # Preserve original line endings in selected-byte hashes.
    for number in sections:
        match = re.search(r"^# " + re.escape(number) + r"\..*?(?=^# |\Z)", text, re.M | re.S)
        assert match, (path, number)
        passage = match.group().encode("utf-8")
        records.append({"document_id": source["document_id"], "declared_version": source["declared_version"],
                        "source_path": path, "source_sha256": source["sha256"], "section": number,
                        "heading": match.group().splitlines()[0], "section_bytes": len(passage),
                        "section_sha256": hashlib.sha256(passage).hexdigest(),
                        "source_status": source["source_status"], "approval_status": source["approval_status"],
                        "runtime_manifest_declared_status": current["runtime_source_context"]["declared_status"]
                        if path == "sources/recovered_20261104/INSPIRE-MOI-01_v1.0.txt" else None,
                        "proposed_use": use, "rationale": rationale, "trial_export_approved": False,
                        "permission_needed": "Owner/source-authority decision bound to version, exact section hash, purpose, provider, duration and limits; operating-rule adoption is separate from reference-use consent and intervention permission."})
output = {"executed": True, "read_only": True, "selection_is_approval": False,
          "private_passage_text_excluded": True, "candidate_sections": records,
          "excluded": ["All other corpus passages unless independently scoped and approved", "Content patches", "458 draft lessons", "Reconstructed or historical MOI-01-A", "Intervention instructions"]}
Path("docs/evidence/generative-preparation/source-candidates.json").write_text(
    json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Verified {len(records)} exact section candidates; ZERO export/runtime approvals created.")
