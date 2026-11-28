"""Private, incremental extraction. Never approves a source or uploads bytes."""
from pathlib import Path
import hashlib, json, zipfile, io, re, sys
from xml.etree import ElementTree as ET

ROOT = Path.cwd()
PRIVATE = ROOT / '.private.local/knowledge'
OUT = PRIVATE / 'extracted'
OUT.mkdir(parents=True, exist_ok=True)
RAW = PRIVATE / 'raw'
RAW.mkdir(exist_ok=True)
digest = lambda b: hashlib.sha256(b).hexdigest()


def extract(data, suffix):
    if suffix in {'.md', '.txt'}:
        return data.decode('utf-8-sig'), 'utf8-v1'
    if suffix == '.pdf':
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError('ENCRYPTED_PDF')
        pages = [p.extract_text() or '' for p in reader.pages]
        if not any(p.strip() for p in pages):
            raise ValueError('NO_TEXT_OCR_REQUIRED')
        return '\n\n'.join(f'# Page {i+1}\n{p}' for i, p in enumerate(pages)), 'pypdf-6.6.0-pages-v1'
    if suffix == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            payload = z.read('word/document.xml')
        if len(payload) > 10_000_000 or b'<!DOCTYPE' in payload:
            raise ValueError('DOCX_XML_BOUND')
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        lines = []
        for p in ET.fromstring(payload).findall('.//w:p', ns):
            text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
            style = p.find('./w:pPr/w:pStyle', ns)
            level = re.search(r'Heading([1-6])', style.get('{'+ns['w']+'}val', '')) if style is not None else None
            lines.append(('#'*int(level[1])+' ' if level else '')+text)
        return '\n\n'.join(lines), 'docx-xml-v1'
    raise ValueError('RECEIPT_ONLY_FORMAT')


def main():
    receipts = json.loads((PRIVATE/'receipts.json').read_text('utf-8'))
    by_hash = {r.get('hash'): r for r in receipts if r.get('hash')}
    seen, entries, report = {}, [], []

    def add(data, name, provenance, old=None):
        sha = digest(data)
        suffix = Path(name).suffix.lower()
        if data.startswith(b'%PDF-'):
            suffix = '.pdf'
        elif 'CONTENT PATCH' in name.upper() and suffix not in {'.md', '.txt'}:
            suffix = '.md'
        if sha in seen:
            report.append({'name': name, 'sha256': sha, 'result': 'duplicate', 'canonicalId': seen[sha]})
            return
        old = old or by_hash.get(sha)
        by_location = next((r for r in receipts if r.get('provenance', {}).get('relativePath') == (provenance or {}).get('relativePath') and r.get('title') == name), None)
        doc_id = old['documentId'] if old else (by_location['documentId'] if by_location else 'corpus-'+digest(name.encode())[:24])
        seen[sha] = doc_id
        row = {'name': name, 'documentId': doc_id, 'sha256': sha, 'bytes': len(data)}
        target = RAW/sha
        if not target.exists():
            target.write_bytes(data)
        if digest(target.read_bytes()) != sha:
            raise ValueError('ORIGINAL_COPY_HASH_HOLD')
        item = {'path': str(target), 'id': doc_id, 'title': old.get('title', name) if old else name,
                'status': old.get('status', 'review-required') if old else 'review-required',
                'use': old.get('permittedUse', 'receipt-only') if old else 'receipt-only',
                'kind': old.get('kind', 'reference') if old else 'reference',
                'provenance': old.get('provenance', provenance) if old else provenance}
        engineering = bool(re.search(r'(^|/)(README|REVIEW|UNRESOLVED|ads\.txt)|/(?:docs/)(?!counseling-topics-source)', name, re.I))
        item['contentClass'] = 'engineering' if engineering else ('archive' if suffix=='.zip' else 'receipt' if suffix in {'.py','.json'} else 'content')
        if old and old.get('permissions'):
            item['permissions'] = old['permissions']
        if re.search(r'MOI|DPM|OSP|RDS|DPC|PEC|CSS|WORK|OWNER_|POLICY|GENESIS', name, re.I):
            item['kind'] = 'operating-rules'
        if suffix in {'.md', '.txt', '.pdf', '.docx'} and not engineering:
            try:
                key = OUT/(sha+'.json')
                if key.exists():
                    cached = json.loads(key.read_text('utf-8'))
                    if cached['sourceHash'] != sha or digest(cached['text'].encode()) != cached['textHash']:
                        raise ValueError('EXTRACTION_CACHE_INTEGRITY_HOLD')
                    text, engine = cached['text'], cached['engine']
                    row['cached'] = True
                else:
                    text, engine = extract(data, suffix)
                    cached = {'sourceHash': sha, 'textHash': digest(text.encode()), 'engine': engine, 'text': text}
                    key.write_text(json.dumps(cached, ensure_ascii=False), 'utf-8')
                if not text.strip():
                    raise ValueError('EMPTY_EXTRACTION')
                if re.search(r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|"private_key"\s*:', text):
                    raise ValueError('SECRET_PATTERN_QUARANTINED_NOT_INDEXED')
                if len(text.encode()) > 400000:
                    raise ValueError('EXTRACTION_EXCEEDS_CURRENT_INDEX_BOUND')
                item['extractedFile'] = str(key)
                item['extraction'] = {'engine': engine, 'textHash': cached['textHash'], 'format': suffix}
                row.update(result='extracted', characters=len(text), textHash=cached['textHash'])
            except Exception as e:
                row.update(result='extraction-error', error=type(e).__name__+': '+str(e)[:150])
                item['noExtractedContent'] = True
        else:
            row['result'] = 'engineering-receipt' if engineering else 'archive-receipt' if suffix == '.zip' else 'code-or-receipt'
            item['noExtractedContent'] = True
        entries.append(item)
        report.append(row)

    # Current immutable originals, no hardcoded receipt count.
    for r in receipts:
        if r.get('missing'):
            report.append({'documentId': r['documentId'], 'result': 'missing'})
            continue
        f = RAW/r['rawFile']
        add(f.read_bytes(), r['title'] if '.' in r['title'] else ('website.md' if r['documentId']=='website-counseling' else r['title']),
            r.get('provenance'), r)

    locations = [Path.home()/'Downloads', PRIVATE/'inbox']
    files = []
    for location in locations:
        if not location.exists():
            continue
        for f in location.iterdir():
            if f.is_file() and re.search(r'INSPIRE|MOI|CONTENT_PATCH', f.name, re.I):
                files.append(f)
        if location.name == 'inbox':
            files.extend(f for f in location.rglob('*') if f.is_file() and not f.is_symlink())
    for f in sorted(set(files)):
        if f.is_symlink() or f.stat().st_size > 50_000_000:
            report.append({'name': f.name, 'result': 'file-bound-or-link'})
            continue
        data = f.read_bytes()
        provenance = {'packageHash': digest(data), 'relativePath': f.name,
                      'declaredVersion': 'Original name/header retained', 'authority': 'Received; no runtime/export grant'}
        add(data, f.name, provenance)
        if f.suffix.lower() == '.zip':
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    total = 0
                    for info in z.infolist():
                        name = info.filename.replace('\\', '/')
                        # Only source documents, never test code, env, client data or arbitrary archive contents.
                        if not re.match(r'(INSPIRE[-_](?:\d|[A-Z]+-\d)|01_CONTENT_PATCH|BAN_DO_TONG_THE|counseling-topics-source)', Path(name).name, re.I):
                            continue
                        if Path(name).suffix.lower() not in {'.md', '.txt', '.pdf', '.docx'}:
                            continue
                        if '..' in Path(name).parts or re.search(r'node_modules|evidence|\.git|\.env|credentials|profile|client', name, re.I):
                            continue
                        total += info.file_size
                        if total > 20_000_000 or info.file_size > 2_000_000:
                            raise ValueError('ARCHIVE_EXTRACTION_BOUND')
                        add(z.read(info), name, {**provenance, 'relativePath': name})
            except Exception as e:
                report.append({'name': f.name, 'result': 'archive-error', 'error': str(e)[:150]})
    # Candidate relationships are management data, not automatic authority.
    codes = {}
    for item in entries:
        m = re.search(r'(INSPIRE-(?:\d+|[A-Z]+-\d+))', item['title'], re.I)
        if m:
            code = m[1].upper()
            item['relations'] = {'family': code, 'amendment': bool(re.search(re.escape(code)+r'-[AB](?:[_ .]|$)', item['title'], re.I)),
                                 'authority': 'candidate-from-filename; no canonical merge'}
            codes.setdefault(code, []).append(item['id'])
    for item in entries:
        if item.get('relations'):
            item['relations']['relatedIds'] = [i for i in codes[item['relations']['family']] if i != item['id']]
    (PRIVATE/'corpus-manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2), 'utf-8')
    (PRIVATE/'corpus-coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps({'manifest': str(PRIVATE/'corpus-manifest.json'), 'results': {k: sum(r['result']==k for r in report) for k in sorted({r['result'] for r in report})}}))


if __name__ == '__main__':
    main()
