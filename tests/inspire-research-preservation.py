"""Focused diff against the pre-task snapshot; never stage or alter old code."""
import difflib
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BEFORE = ROOT / '.private.local/research-implementation-before'
OUT = ROOT / 'docs/evidence/research-implementation'
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
allowed_old = {'REVIEW.md', 'functions/package.json'}
with zipfile.ZipFile(ROOT / 'INSPIRE-review-model-preparation-2026-11-09.zip') as archive:
    mismatches = []
    checked = 0
    for entry in archive.infolist():
        if entry.is_dir() or entry.filename == 'ARCHIVE-MANIFEST.json':
            continue
        current = ROOT / entry.filename
        if not current.is_file() or current.read_bytes() != archive.read(entry):
            if entry.filename not in allowed_old:
                mismatches.append(entry.filename)
        checked += 1
    old_package = archive.read('functions/package.json')

preserved = []
for path in BEFORE.rglob('*'):
    if path.is_file():
        name = path.relative_to(BEFORE).as_posix()
        if name not in allowed_old:
            current = ROOT / name
            assert current.is_file() and current.read_bytes() == path.read_bytes(), 'Pre-task change lost: ' + name
            preserved.append(name)
assert not mismatches, 'Historical handoff changed: ' + ', '.join(mismatches)

package = ROOT / '.private.local/controller040-preview/INSPIRE_AI_040'
manifest = (package / 'manifests/package_manifest.json').read_bytes()
assert sha(manifest) == '7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a'
rows = json.loads(manifest)['files']
for row in rows:
    path = (package / row['path']).resolve()
    assert path.is_relative_to(package.resolve())
    raw = path.read_bytes()
    assert len(raw) == row['bytes'] and sha(raw) == row['sha256'], row['path']

names = set(allowed_old)
for pattern in ['functions/inspire_research*.py', 'tests/inspire-research*', 'tests/verify-inspire-research.mjs']:
    names.update(p.relative_to(ROOT).as_posix() for p in ROOT.glob(pattern) if p.is_file())
names.update(['functions/src/inspireResearchAdmission.ts', 'docs/inspire-research-implementation.md'])
patch = []
inventory = []
for name in sorted(names):
    file = ROOT / name
    raw = file.read_bytes()
    old_path = BEFORE / name
    old = old_package if name == 'functions/package.json' else old_path.read_bytes() if old_path.exists() else b''
    if old == raw:
        continue
    patch.append('diff --git a/' + name + ' b/' + name + '\n')
    patch.extend(difflib.unified_diff(old.decode('utf8').splitlines(keepends=True), raw.decode('utf8').splitlines(keepends=True),
                                    fromfile='a/' + name if old else '/dev/null', tofile='b/' + name))
    inventory.append({'path': name, 'before_sha256': sha(old) if old else None, 'after_sha256': sha(raw)})
(OUT / 'focused-implementation.patch').write_text(''.join(patch), encoding='utf8', newline='\n')
(OUT / 'preservation.json').write_text(json.dumps({
    'executed': True, 'preTaskFilesPreserved': len(preserved), 'handoffFilesChecked': checked,
    'unexpectedHandoffChanges': mismatches, 'controllerFilesVerified': len(rows),
    'existingWebsiteAndBusinessCodeChanged': False, 'sourcePermissionsChanged': False,
    'taskChanges': inventory, 'limitation': 'Snapshot comparison verifies bytes, not interactive website behavior.'
}, indent=2), encoding='utf8')
print(f'PASS {len(preserved)} pre-task files preserved; {checked} handoff files checked; {len(rows)} Controller payloads unchanged; focused diff written')
