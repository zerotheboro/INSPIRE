"""Local review artifact only; never includes corpus, keys or runtime state."""
from pathlib import Path
import subprocess, json, hashlib, zipfile, re, tempfile

ROOT = Path.cwd()
OUT = ROOT/'docs/evidence/api-rag-2026-11-25'
ARCHIVE = ROOT/'INSPIRE-review-api-rag-2026-11-25.zip'
sha = lambda b: hashlib.sha256(b).hexdigest()
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')


def eligible(n):
    p = Path(n)
    if not n or not (ROOT/p).is_file():
        return False
    if any(x in {'.git', '.private.local', '.tools.local', 'node_modules', '__pycache__', 'lib', 'dist', '.codex', '.agents'} for x in p.parts):
        return False
    if p.suffix.lower() in {'.zip', '.db', '.sqlite', '.sqlite3', '.pyc', '.log', '.key', '.pem', '.pfx', '.tsbuildinfo'} or p.name.startswith('.env'):
        return False
    historical = {'docs/evidence/knowledge-conversation-2026-11-21/tests.txt',
                  'docs/evidence/knowledge-conversation-2026-11-21/native-controller-recheck.txt'}
    if n.startswith('docs/') and not (n == 'docs/counseling-topics-source.md' or n in historical or n.startswith('docs/evidence/api-rag-2026-11-25/')):
        return False
    return not n.endswith('archive-verification.json')


files = sorted(set(n for n in names if eligible(n)))


def diff(checkpoint, output):
    baseline = ROOT/'.private.local'/checkpoint/'files'
    if not baseline.is_dir():
        raise RuntimeError('Required working-tree checkpoint missing')
    stage = Path(tempfile.mkdtemp(prefix='api-review-diff-', dir=ROOT/'.private.local'))
    (stage/'before').mkdir(); (stage/'after').mkdir()
    changed = []
    for n in files:
        if n.startswith('docs/'):
            continue
        old = baseline/n
        if old.is_file():
            before = old.read_bytes()
        else:
            r = subprocess.run(['git', 'show', 'HEAD:'+n], capture_output=True)
            before = r.stdout if r.returncode == 0 else None
        current = (ROOT/n).read_bytes()
        if before == current or (before is not None and before.replace(b'\r\n', b'\n') == current.replace(b'\r\n', b'\n')):
            continue
        changed.append(n)
        p = stage/'after'/n; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(current)
        if before is not None:
            p = stage/'before'/n; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(before)
    r = subprocess.run(['git', '-c', 'core.autocrlf=false', 'diff', '--no-index', '--binary', 'before', 'after'], cwd=stage, capture_output=True)
    if r.returncode not in (0, 1):
        raise RuntimeError('Diff construction failed')
    patch = re.sub(rb'([ab])/(before|after)/', rb'\1/', r.stdout)
    target = OUT/output; target.write_bytes(patch)
    check = subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--check', str(target)], cwd=stage/'before', capture_output=True)
    if check.returncode:
        raise RuntimeError(check.stderr.decode())
    return {'file': output, 'files': changed, 'baseline': checkpoint, 'applyCheckExit': 0, 'workspacePatchApplied': False}


checks = [diff('api-rag-before-20261125', 'focused.patch'), diff('api-resume-before-20261125', 'resume.patch')]
(OUT/'diff-check.json').write_text(json.dumps(checks, indent=2), 'utf-8')
files = sorted(set(files + [str((OUT/n).relative_to(ROOT)).replace('\\', '/') for n in ['focused.patch', 'resume.patch', 'diff-check.json']]))
manifest = []
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for n in files:
        b = (ROOT/n).read_bytes()
        if re.search(rb'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{32,}', b):
            raise RuntimeError('Secret material hold: '+n)
        for key in re.findall(rb'\bsk-[A-Za-z0-9_-]{24,}', b):
            if not any(w in key.lower() for w in [b'fixture', b'example', b'synthetic']):
                raise RuntimeError('Possible credential hold: '+n)
        target = 'source/'+n; z.writestr(target, b)
        manifest.append({'path': target, 'sha256': sha(b), 'bytes': len(b)})
    z.writestr('READ-FIRST.txt', 'Read source/docs/evidence/api-rag-2026-11-25/HANDOFF_VI.txt. Generation UNARMED. No real inference or owner approval issued. Current source plus focused and resume diffs; private originals/indexes, credentials, emulator databases, dependencies and portable runtimes excluded. Original local Controller installation required. Browser desktop/mobile NOT VERIFIED this turn.\n')
    z.writestr('archive-manifest.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None
    for row in manifest:
        assert sha(z.read(row['path'])) == row['sha256']
    assert not any('/.private.local/' in n or '/node_modules/' in n or '/.tools.local/' in n for n in z.namelist())
proof = {'file': ARCHIVE.name, 'sha256': sha(ARCHIVE.read_bytes()), 'bytes': ARCHIVE.stat().st_size, 'files': len(manifest), 'crcAndHashes': 'PASS', 'focusedDiffApplyCheck': 'PASS', 'privateOriginalsCredentialsDatabasesRuntimesExcluded': True, 'currentBrowserScreenshots': 'NOT VERIFIED: browser URL policy stopped CUA; no bypass', 'liveCalls': 0}
(OUT/'archive-verification.json').write_text(json.dumps(proof, indent=2), 'utf-8')
print(json.dumps(proof, indent=2))
