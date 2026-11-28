"""Synthetic extraction regression; no originals uploaded or changed."""
import unittest, importlib.util, io, zipfile, sys
sys.dont_write_bytecode = True
from pathlib import Path
spec = importlib.util.spec_from_file_location('extractor', Path(__file__).with_name('extract-inspire-corpus.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExtractionTests(unittest.TestCase):
    def test_utf8_exact_and_invalid(self):
        text = '# Đính chính\nLời gốc vẫn còn.'
        self.assertEqual(module.extract(text.encode(), '.md')[0], text)
        with self.assertRaises(UnicodeDecodeError):
            module.extract(b'\xff', '.txt')

    def test_docx_heading_and_unicode(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, 'w') as z:
            z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Đời sống</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(module.extract(b.getvalue(), '.docx')[0], '## Đời sống')

    def test_empty_pdf_requires_ocr_not_silent_success(self):
        from pypdf import PdfWriter
        b = io.BytesIO(); writer = PdfWriter(); writer.add_blank_page(100, 100); writer.write(b)
        with self.assertRaisesRegex(ValueError, 'OCR_REQUIRED'):
            module.extract(b.getvalue(), '.pdf')


unittest.main()
