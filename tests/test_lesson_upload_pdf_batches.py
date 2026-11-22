
from contextlib import closing
import importlib.util
from pathlib import Path
import tempfile
import unittest

import fitz
import pypdfium2 as pdfium
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


driver = module("native_driver_long_pdf_test", "tools/lesson-upload/native-driver.py")
pipeline = module("native_pipeline_long_pdf_test", "tools/btvn-pipeline/pipeline.py")


def make_pdf(pages):
    with fitz.open() as pdf:
        for number in range(1, pages + 1):
            page = pdf.new_page(width=160, height=95)
            page.insert_text((10, 25), f"Cau {number} - synthetic text for the native renderer", fontsize=5)
            page.draw_rect(fitz.Rect(30, 32, 45, 45), fill=(number / 100, 0.2, 0.3))
        return pdf.tobytes()


class NativePdfRenderTests(unittest.TestCase):
    def test_real_renderer_keeps_all_pages_and_original_coordinates(self):
        homework = make_pdf(19)
        answers = make_pdf(55)
        observed = []

        def extract_pdf(raw, folder, tag):
            with fitz.open(stream=raw, filetype="pdf") as document:
                observed.append((tag, document.page_count))
            return pipeline.extract_pdf(raw, folder, tag)

        with tempfile.TemporaryDirectory() as folder:
            (hs_text, hs_images), (gv_text, gv_images) = driver.render_source_pdfs(
                extract_pdf, homework, answers, Path(folder)
            )
            self.assertEqual(observed, [("hs", 19)])
            self.assertEqual(len(hs_images), 19)
            self.assertEqual(len(gv_images), 55)
            for number, text in enumerate(gv_text.split("\f"), 1):
                self.assertIn(f"Cau {number} -", text)
            self.assertIn("Cau 19", hs_text)
            with pdfium.PdfDocument(answers) as original:
                for number in (1, 40, 41, 55):
                    self.assertEqual(gv_images[number - 1].name, f"gv-{number}.png")
                    with closing(original[number - 1]) as page, closing(page.render(scale=200 / 72)) as bitmap:
                        with bitmap.to_pil() as expected, Image.open(gv_images[number - 1]) as actual:
                            self.assertEqual(actual.size, expected.size)
                            self.assertEqual(actual.tobytes(), expected.tobytes())

    def test_unchanged_total_page_ceiling_and_incomplete_batch_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            with self.assertRaisesRegex(ValueError, "NATIVE_PDF_PAGE_LIMIT"):
                driver.render_source_pdfs(lambda *_: self.fail("must stop before rendering"),
                                          make_pdf(40), make_pdf(41), folder)
            with self.assertRaisesRegex(ValueError, "NATIVE_PDF_RENDER_INCOMPLETE"):
                driver.render_source_pdfs(lambda *_: ("", []), make_pdf(1), make_pdf(41), folder)


if __name__ == "__main__":
    unittest.main()
