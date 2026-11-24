"""Review-only archive. Never imports runtime adapters or credentials."""
from pathlib import Path
import subprocess,hashlib,json,zipfile,tempfile,shutil,re
ROOT=Path.cwd(); OUT=ROOT/'docs/evidence/private-handoff-2026-11-22'; OUT.mkdir(exist_ok=True)
ARCHIVE=ROOT/'INSPIRE-review-private-knowledge-2026-11-22.zip'
def sha(b):return hashlib.sha256(b).hexdigest()
listed=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
evidence=['docs/evidence/knowledge-conversation-2026-11-21/','docs/evidence/private-handoff-2026-11-22/']
docs={'docs/inspire-luna-api.md','docs/inspire-chat-prototype.md','docs/inspire-service-emulator.md','docs/scope-a040.md','docs/counseling-topics-source.md','docs/private-review-handoff-2026-11-22.txt'}
def eligible(n):
 p=Path(n)
 if not n or not (ROOT/p).is_file():return False
 if any(x in {'.git','node_modules','.private.local','.tools.local','__pycache__','dist','lib','.codex','.agents'} for x in p.parts):return False
 if p.suffix.lower() in {'.zip','.db','.sqlite','.sqlite3','.pyc','.log','.pem','.key','.pfx','.tsbuildinfo'}:return False
 if p.name.startswith('.env') or p.name in {'api-key.txt','authorization.json','first-attempt.json','archive-verification.json','archive-manifest.json'}:return False
 if n.startswith('docs/') and n not in docs and not any(n.startswith(e) for e in evidence):return False
 return True
files=sorted(set(n for n in listed if eligible(n)))
# A complete source diff relative to HEAD includes untracked source files. It is
# a review view, not an instruction to discard the earlier uncommitted baseline.
stage=Path(tempfile.mkdtemp(prefix='inspire-review-diff-'))
(stage/'before').mkdir();(stage/'after').mkdir()
for n in files:
 if n.startswith('docs/evidence/'):continue
 target=stage/'after'/n;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/n,target)
 previous=subprocess.run(['git','show','HEAD:'+n],capture_output=True)
 if previous.returncode==0:
  old=stage/'before'/n;old.parent.mkdir(parents=True,exist_ok=True);old.write_bytes(previous.stdout)
r=subprocess.run(['git','-c','core.autocrlf=false','diff','--no-index','--binary','--','before','after'],cwd=stage,capture_output=True)
if r.returncode not in (0,1):raise RuntimeError('Diff failed')
patch=re.sub(rb'([ab])/(before|after)/',rb'\1/',r.stdout)
(OUT/'current-source.patch').write_bytes(patch)
check=subprocess.run(['git','-c','core.autocrlf=false','apply','--check',str(OUT/'current-source.patch')],cwd=stage/'before',capture_output=True)
(OUT/'current-diff-check.json').write_text(json.dumps({'executed':True,'exitCode':check.returncode,'passed':check.returncode==0,'scope':'Read-only apply check against staged HEAD source; no workspace patch applied','stderr':check.stderr.decode('utf8',errors='replace')},indent=2),encoding='utf8')
if check.returncode:raise RuntimeError('Current source diff does not apply to staged baseline')
files=sorted(set(files+['docs/evidence/private-handoff-2026-11-22/current-source.patch']))
files=sorted(set(files+['docs/evidence/private-handoff-2026-11-22/current-diff-check.json']))
manifest=[]
with zipfile.ZipFile(ARCHIVE,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for n in files:
  b=(ROOT/n).read_bytes()
  if re.search(rb'-----BEGIN (?:RSA )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{32,}',b):raise RuntimeError('Private key material; hold archive: '+n)
  z.writestr('source/'+n,b);manifest.append({'path':'source/'+n,'bytes':len(b),'sha256':sha(b)})
 screenshot='docs/evidence/luna-private-2026-11-11/private-browser/father-conversation-desktop.png'
 z.write(ROOT/screenshot,'historical-screenshot/2026-11-11-father-conversation-desktop.png')
 z.writestr('READ-FIRST.txt','Read source/docs/private-review-handoff-2026-11-22.txt first.\nInitial full suite: 48/49; separate isolated native rerun: 1/1. NO complete-suite PASS claim.\nGeneration BLOCKED. No source-use grant.\nCurrent source includes earlier uncommitted work. current-source.patch compares shareable source to HEAD; focused.patch compares the November knowledge work to its saved uncommitted baseline. Neither is a reset instruction.\nThe single screenshot is genuine historical November 11 evidence, NOT current UI verification.\nPrivate originals, databases, credentials, dependencies and portable runtimes are excluded; native Controller requires the existing private installation.\n')
 z.writestr('archive-manifest.json',json.dumps(manifest,indent=2))
with zipfile.ZipFile(ARCHIVE) as z:
 assert z.testzip() is None
 for row in manifest:assert sha(z.read(row['path']))==row['sha256']
 assert not any('/.private.local/' in n or '/node_modules/' in n or '/.tools.local/' in n for n in z.namelist())
proof={'archive':ARCHIVE.name,'sha256':sha(ARCHIVE.read_bytes()),'bytes':ARCHIVE.stat().st_size,'sourceEvidenceFiles':len(manifest),'zipCRCAndByteHashes':'PASS','privateOriginalsCredentialsDatabasesRuntimesExcluded':True,'screenshots':'one historical 2026-11-11 image; current visual verification NOT VERIFIED','completeSuitePassed':False,'generationRequests':0}
(OUT/'archive-verification.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print(json.dumps(proof,indent=2))
