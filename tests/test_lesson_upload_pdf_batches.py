
from contextlib import closing
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from uuid import uuid4

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

    def test_long_timeout_caps_each_send_and_restores_engine(self):
        class ProviderError(Exception):
            def __init__(self, code, *, retryable):
                super().__init__(code)
                self.retryable = retryable

        original = lambda spec, body, seconds: seconds
        engine = SimpleNamespace(send=original, specs=[{}, {}], attempts=1)
        tick = 10
        with driver.long_pdf_timeout(engine, 650, ProviderError, monotonic=lambda: tick):
            self.assertEqual(engine.send({}, {}, 180), 312)
            tick = 600
            self.assertEqual(engine.send({}, {}, 180), 46)
            tick = 646
            with self.assertRaisesRegex(ProviderError, "step_timeout") as failure:
                engine.send({}, {}, 180)
            self.assertFalse(failure.exception.retryable)
        self.assertIs(engine.send, original)

    def test_text_window_covers_answer_continuations_and_rejects_duplicate_refs(self):
        hs = ["Cau " + str(i) + " " + "z" * 140 for i in range(1, 41)]
        answers = ["Cau " + str(i) + " " + "w" * 210 for i in range(1, 41)]
        answers.insert(19, "Nội dung lời giải nối trang")
        view = driver.long_pdf_text(hs, answers, 40, 41, driver.source_inventory(hs), ["Câu 19", "Câu 20"])
        self.assertIn('"Câu 19": [19, 19]', view)
        self.assertIn('"Câu 20": [20, 21]', view)
        self.assertIn("Nội dung lời giải nối trang", view)
        self.assertNotIn("Cau 35", view)
        duplicated = answers + ["Cau 19"]
        self.assertIsNone(driver.long_pdf_text(hs, duplicated, 40, 42, driver.source_inventory(hs), ["Câu 19"]))

    def test_continuation_requires_exact_claim_source_and_executing_bundle(self):
        now = datetime.now(timezone.utc)
        token = str(uuid4())
        source = {"sourceVersion": "a" * 64, "scope_sha256": "b" * 64}
        job = {"id": str(uuid4()), "version": 1, "paper": 1,
               "is_test": False, "work_kind": "homework", "claim_token": token}
        driver_hash = driver.digest(Path(driver.__file__).read_bytes())
        raw = driver.encoded({"files": {"native-driver.py": driver_hash}})
        grant = {"schema": "mtm-owner-v1-timeout-continuation-v1", "status": "running", "upload_id": job["id"],
                 "operator_processing_attempt": 1, "worker_id": "vps-web-upload",
                 "source_version_sha256": source["sourceVersion"], "scope_sha256": source["scope_sha256"],
                 "original_binding_sha256": "d" * 64,
                 "claim_sha256": driver.digest(token.encode()), "runtime_manifest_sha256": driver.digest(raw),
                 "runtime_receipt_sha256": "c" * 64, "authority_ref": "owner approval for same v1",
                 "claimed_at": now.isoformat(), "expires_at": (now + timedelta(minutes=20)).isoformat()}
        with tempfile.TemporaryDirectory() as folder:
            manifest = Path(folder) / "manifest.json"
            self.assertFalse(driver.verify_timeout_continuation(job, source, manifest))
            job["checkpoint"] = {"operator_timeout_continuation_v1": grant}
            manifest.write_bytes(raw)
            self.assertTrue(driver.verify_timeout_continuation(job, source, manifest))
            with self.assertRaisesRegex(ValueError, "OPERATOR_TIMEOUT_CONTINUATION_CHANGED"):
                driver.verify_timeout_continuation({**job, "id": str(uuid4())}, source, manifest)
            with self.assertRaisesRegex(ValueError, "OPERATOR_TIMEOUT_CONTINUATION_CHANGED"):
                driver.verify_timeout_continuation({**job, "claim_token": str(uuid4())}, source, manifest)
            manifest.write_bytes(raw + b"\n")
            with self.assertRaisesRegex(ValueError, "OPERATOR_TIMEOUT_CONTINUATION_CHANGED"):
                driver.verify_timeout_continuation(job, source, manifest)


if __name__ == "__main__":
    unittest.main()
