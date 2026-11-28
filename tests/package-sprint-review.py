"""Review ZIP from current source; excludes private originals and runtime state."""
from pathlib import Path
import subprocess, json, hashlib, zipfile, re, tempfile
ROOT = Path.cwd()
OUT = ROOT/'docs/evidence/sprint-2026-11-25'
BEFORE = ROOT/'.private.local/sprint-20261125-before/files'
STAGE = Path(tempfile.mkdtemp(prefix='sprint-review-diff-', dir=ROOT/'.private.local'))
ARCHIVE = ROOT/'INSPIRE-review-sprint-2026-11-25.zip'
sha = lambda b: hashlib.sha256(b).hexdigest()
names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')


def eligible(n):
    p = Path(n)
    if not n or not (ROOT/p).is_file():
        return False
    if any(x in {'.git','.private.local','.tools.local','node_modules','__pycache__','lib','dist','.codex','.agents'} for x in p.parts):
        return False
    if p.suffix.lower() in {'.zip','.db','.sqlite','.sqlite3','.pyc','.log','.key','.pem','.pfx','.tsbuildinfo'} or p.name.startswith('.env'):
        return False
    if n.startswith('docs/') and not (n in {'docs/sprint-handoff-2026-11-25.txt','docs/counseling-topics-source.md'} or n.startswith('docs/evidence/sprint-2026-11-25/')):
        return False
    if n.endswith('archive-verification.json'):
        return False
    return True


files = sorted(set(n for n in names if eligible(n)))
changed = []
for n in files:
    if n.startswith('docs/'):
        continue
    old = BEFORE/n
    if old.exists():
        before = old.read_bytes()
    else:
        r = subprocess.run(['git','show','HEAD:'+n],capture_output=True)
        before = r.stdout if r.returncode == 0 else None
    current = (ROOT/n).read_bytes()
    if before == current or (before is not None and before.replace(b'\r\n',b'\n') == current.replace(b'\r\n',b'\n')):
        continue
    changed.append(n)
    new = STAGE/'after'/n; new.parent.mkdir(parents=True,exist_ok=True); new.write_bytes(current)
    if before is not None:
        old_stage = STAGE/'before'/n; old_stage.parent.mkdir(parents=True,exist_ok=True); old_stage.write_bytes(before)
(STAGE/'before').mkdir(parents=True,exist_ok=True)
r = subprocess.run(['git','-c','core.autocrlf=false','diff','--no-index','--binary','before','after'],cwd=STAGE,capture_output=True)
if r.returncode not in (0,1):
    raise RuntimeError('Focused diff failed')
patch = re.sub(rb'([ab])/(before|after)/',rb'\1/',r.stdout)
(OUT/'focused.patch').write_bytes(patch)
check = subprocess.run(['git','-c','core.autocrlf=false','apply','--check',str(OUT/'focused.patch')],cwd=STAGE/'before',capture_output=True)
if check.returncode:
    raise RuntimeError(check.stderr.decode())
(OUT/'diff-check.json').write_text(json.dumps({'files':changed,'baseline':'Working tree checkpoint immediately before sprint; clean files fall back to HEAD','applyCheckExit':check.returncode,'workspacePatchApplied':False},indent=2),'utf-8')
files = sorted(set(files+['docs/evidence/sprint-2026-11-25/focused.patch','docs/evidence/sprint-2026-11-25/diff-check.json']))
manifest = []
with zipfile.ZipFile(ARCHIVE,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for n in files:
        b = (ROOT/n).read_bytes()
        if re.search(rb'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{32,}',b):
            raise RuntimeError('Secret material hold: '+n)
        target = 'source/'+n
        z.writestr(target,b)
        manifest.append({'path':target,'sha256':sha(b),'bytes':len(b)})
    z.writestr('READ-FIRST.txt','Read source/docs/sprint-handoff-2026-11-25.txt. Generation remains BLOCKED. Real app-server tests use synthetic loopback inference only. No model quality or current browser PASS claim. Private originals, credentials, databases, portable runtimes and dependencies excluded. Existing native Controller installation required.\n')
    z.writestr('archive-manifest.json',json.dumps(manifest,indent=2))
with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None
    for row in manifest:
        assert sha(z.read(row['path']))==row['sha256']
    assert not any('/.private.local/' in n or '/node_modules/' in n or '/.tools.local/' in n for n in z.namelist())
proof = {'file':ARCHIVE.name,'sha256':sha(ARCHIVE.read_bytes()),'bytes':ARCHIVE.stat().st_size,'files':len(manifest),'crcAndHashes':'PASS','focusedDiffApplyCheck':'PASS','privateOriginalsCredentialsDatabasesRuntimesExcluded':True,'screenshots':'No current screenshots: browser NOT VERIFIED','liveCalls':0}
(OUT/'archive-verification.json').write_text(json.dumps(proof,indent=2),'utf-8')
print(json.dumps(proof,indent=2))
