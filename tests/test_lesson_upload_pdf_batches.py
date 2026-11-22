
from contextlib import closing, nullcontext
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
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


SEGMENT_INSTRUCTION = ('\n' + driver.FULL_PAGE_BRANDING_CLAIM + '\nCHẾ ĐỘ ĐỌC CHIA ĐOẠN: '
                       + driver.SEGMENT_FULL_PAGE_CLAIM)


def segment_view(duplicate=False):
    hs = [f'Cau {number} nội dung câu' for number in range(1, 40)]
    gv = [f'Cau {number} nội dung lời giải' for number in range(1, 40)]
    gv.insert(21, 'Lời giải tiếp ở trang sau')
    if duplicate:
        gv[30] = 'Cau 24 số câu trùng ngoài nhóm con'
    pages = {tag: [f'{tag}-{number}.png' for number in range(1, len(texts) + 1)]
             for tag, texts in [('hs', hs), ('gv', gv)]}
    rows = [{'document': tag, 'page': number, 'width': 200, 'height': 100}
            for tag, paths in pages.items() for number in range(1, len(paths) + 1)]
    manifest = 'PAGE_MANIFEST: ' + json.dumps(rows) + '\nDữ liệu tổng hợp'
    return driver.SegmentPageView((hs, gv), driver.source_inventory(hs),
                                  [f'Câu {number}' for number in range(19, 25)],
                                  pages['hs'], pages['gv'], manifest)


def segment_question(gv_page=20):
    return {'sourceRef': 'Câu 20', 'questionCrops': [{'page': 20}], 'solutionCrops': [{'page': gv_page}]}


class RecordingBase:
    extract_deadline = 1000

    def __init__(self, result):
        self.result = result
        self.calls = []

    def _engine(self):
        return object()

    def _ask_stage(self, stage, instruction, text, pages, *, native_context=None):
        self.calls.append((stage, instruction, text, pages, native_context))
        self.last_receipt = {'provider': 'synthetic'}
        return self.result


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

    def test_segment_projection_uses_original_pages_and_local_redaction_counts(self):
        view = segment_view()
        targets = ['Câu 20', 'Câu 21']
        instruction, text, pages, counts, views = view.project(targets, SEGMENT_INSTRUCTION)
        self.assertEqual(counts, {'hs_count': 6, 'gv_count': 7})
        self.assertEqual(views['hs']['numbers'], [1, 19, 20, 21, 22, 23])
        self.assertEqual(views['gv']['numbers'], [1, 19, 20, 21, 22, 23, 24])
        manifest = json.loads(text.splitlines()[0].removeprefix('PAGE_MANIFEST: '))
        self.assertEqual([(x['document'], x['page']) for x in manifest],
                         [(tag, number) for tag in ('hs', 'gv') for number in views[tag]['numbers']])
        self.assertEqual(pages, [f'{row["document"]}-{row["page"]}.png' for row in manifest])
        self.assertIn('Trang gốc 22:\nLời giải tiếp ở trang sau', text)
        self.assertNotIn('Cau 36', text)
        self.assertNotIn(driver.SEGMENT_FULL_PAGE_CLAIM, instruction)
        self.assertNotIn(driver.FULL_PAGE_BRANDING_CLAIM, instruction)
        self.assertIn('margin_redactions.hs/gv', instruction)

    def test_only_existing_child_calls_are_projected_and_full_timeout_is_retained(self):
        view = segment_view()
        target = ['Câu 20']
        result = {'certain': True, 'questions': [segment_question()], 'manualQuestions': []}
        native_core = SimpleNamespace(ProviderError=ValueError)
        ai = driver.teacher_upload_ai_class(RecordingBase)(result)
        with patch.dict(sys.modules, {'btvn_native.btvn_strict_core': native_core}), \
                patch.object(driver, 'long_pdf_timeout', return_value=nullcontext()) as timeout:
            with ai.segment_page_view(view):
                full = ai._ask_stage('extract', 'unchanged first prompt', 'unchanged first text', view.pages)
                child = ai._ask_stage('extract', SEGMENT_INSTRUCTION, 'full text', view.pages,
                                      native_context={'target_refs': target})
                child_receipt = ai.last_receipt['segment_document_view']
                fallback = ai._ask_stage('extract', 'unrecognized child', 'full text', view.pages,
                                         native_context={'target_refs': target})
        self.assertEqual(timeout.call_count, 3)
        self.assertIs(full, result)
        self.assertIs(child, result)
        self.assertIs(fallback, result)
        self.assertEqual(ai.calls[0], ('extract', 'unchanged first prompt', 'unchanged first text', view.pages, None))
        self.assertLess(len(ai.calls[1][3]), len(view.pages))
        self.assertEqual(ai.calls[1][4]['target_refs'], target)
        self.assertEqual(child_receipt['wire_instruction_sha256'], driver.digest(ai.calls[1][1].encode('utf-8')))
        self.assertIn(20, child_receipt['original_pages']['gv'])
        self.assertEqual(ai.calls[2][3], view.pages)
        self.assertIsNone(ai._segment_page_view)

    def test_segment_falls_back_on_unproved_full_scope_or_unknown_child_targets(self):
        self.assertIsNone(segment_view(duplicate=True).project(['Câu 20'], SEGMENT_INSTRUCTION))
        self.assertIsNone(segment_view().project(['Câu 31'], SEGMENT_INSTRUCTION))
        self.assertIsNone(segment_view().project(['Câu 21', 'Câu 20'], SEGMENT_INSTRUCTION))
        self.assertIsNone(segment_view().project(['Câu 20', 'Câu 20'], SEGMENT_INSTRUCTION))

    def test_segment_rejects_rebased_or_undelivered_crop_pages(self):
        *_, views = segment_view().project(['Câu 20'], SEGMENT_INSTRUCTION)
        def result(question):
            return {'certain': True, 'questions': [question], 'manualQuestions': []}

        valid = result(segment_question())
        self.assertIs(driver.check_segment_pages(valid, views), valid)
        for wrong in (2, 38):
            invalid = result(segment_question(gv_page=wrong))
            with self.assertRaisesRegex(ValueError, 'NATIVE_EXTRACT_INVENTORY_MISMATCH'):
                driver.check_segment_pages(invalid, views)
        self.assertIn(22, views['gv']['numbers'])
        wrong_span = {**segment_question(), 'solutionCrops': [{'page': 20}, {'page': 22}]}
        with self.assertRaisesRegex(ValueError, 'NATIVE_EXTRACT_INVENTORY_MISMATCH'):
            driver.check_segment_pages(result(wrong_span), views)
        uncertain = {**result(segment_question(gv_page=2)), 'certain': False}
        self.assertIs(driver.check_segment_pages(uncertain, views), uncertain)

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
