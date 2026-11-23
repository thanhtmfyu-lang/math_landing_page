from contextlib import nullcontext
import hashlib
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image
from test_lesson_upload_pdf_batches import driver


progress = driver.load_worker_helper('native-long-pdf')


class LongPdfProgressTests(unittest.TestCase):
    def test_versions_have_distinct_native_checkpoints(self):
        work = {'folder': Path('private-paper')}
        self.assertEqual(driver.long_pdf_work_path(work, 1).name, 'long-pdf-work-v1.json')
        self.assertNotEqual(driver.long_pdf_work_path(work, 1), driver.long_pdf_work_path(work, 2))
        with self.assertRaisesRegex(ValueError, progress.MISMATCH):
            driver.long_pdf_work_path(work, '../bad')

    def test_unacknowledged_checkpoint_is_returned_without_resending(self):
        sent = []
        plan = {'sourceVersion': 'a' * 64}
        tasks = ['one', 'two']

        def run(task):
            sent.append(task)
            return {'task': task}

        with TemporaryDirectory() as folder:
            checkpoint = Path(folder) / 'long-pdf-work.json'
            kwargs = {'read': driver._failure_read, 'write': driver.atomic,
                      'validate': lambda task, result: self.assertEqual(result['task'], task), 'run': run}
            _, first = progress.advance(checkpoint, plan, tasks, None, **kwargs)
            self.assertEqual(progress.advance(checkpoint, plan, tasks, None, **kwargs), (None, first))
            self.assertEqual(sent, ['one'])
            prior = {key: value for key, value in first.items() if key != 'status'}
            tampered = {**prior, 'progress_hash': '0' * 64}
            with self.assertRaisesRegex(ValueError, progress.MISMATCH):
                progress.advance(checkpoint, plan, tasks, tampered, **kwargs)
            with self.assertRaisesRegex(ValueError, progress.MISMATCH):
                progress.advance(checkpoint, {**plan, 'changed': True}, tasks, prior, **kwargs)
            completed, paused = progress.advance(checkpoint, plan, tasks, prior, **kwargs)
            self.assertIsNone(paused)
            self.assertEqual(completed, [{'task': 'one'}, {'task': 'two'}])
            self.assertEqual(sent, ['one', 'two'])

    def test_interruption_after_reservation_cannot_resend_unknown_provider_call(self):
        with TemporaryDirectory() as folder:
            checkpoint = Path(folder) / 'long-pdf-work.json'
            kwargs = {'read': driver._failure_read, 'write': driver.atomic, 'validate': lambda *_: None}

            def interrupted(_):
                raise TimeoutError('no provider response')

            with self.assertRaises(TimeoutError):
                progress.advance(checkpoint, {'sourceVersion': 'a' * 64}, ['a'], None, run=interrupted, **kwargs)
            with self.assertRaisesRegex(ValueError, progress.UNKNOWN):
                progress.advance(checkpoint, {'sourceVersion': 'a' * 64}, ['a'], None,
                                 run=lambda _: self.fail('duplicate paid request'), **kwargs)

    def test_full_original_page_proof_and_grouped_extraction_resume_to_assembler_input(self):
        fake_modules = {name: ModuleType(name) for name in
                        ('btvn_native', 'btvn_native.errata', 'btvn_native.segmented_extract')}
        fake_modules['btvn_native.errata'].check_extracted = lambda value: driver.check_extracted_inventory(value, value['inventory'])
        fake_modules['btvn_native.errata'].sections_for_questions = lambda value: [{'label': 'BTVN', 'kind': 'mc', 'count': len(value['questions'])}]
        fake_modules['btvn_native.segmented_extract'].mark_authored_manual = lambda value: value

        with TemporaryDirectory() as folder, patch.dict(sys.modules, fake_modules):
            root = Path(folder)
            manifest = []
            pages = {'hs': [], 'gv': []}
            text = {'hs': [], 'gv': []}
            for tag, count in [('hs', 19), ('gv', 55)]:
                for i in range(1, count + 1):
                    path = root / f'{tag}-{i}.png'
                    Image.new('RGB', (20, 20), (i, i, i)).save(path)
                    pages[tag].append(path)
                    text[tag].append(f'Cau {i}. Dữ liệu nguồn')
                    manifest.append({'document': tag, 'page': i, 'width': 20, 'height': 20})
            initial_hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in pages['hs'] + pages['gv']]
            targets = ['Câu ' + str(n) for n in range(7, 20)]
            source = 'a' * 64
            lesson = 'web-fake-de-1'
            source_texts = (text['hs'], text['gv'])
            inventory = driver.source_inventory(text['hs'])
            view = driver.SegmentPageView(source_texts, inventory, targets, pages['hs'], pages['gv'],
                                          'PAGE_MANIFEST: ' + json.dumps(manifest))
            seen = []

            class AI:
                spec = {'model': 'fake'}
                source_context = {'source_version': source, 'lesson_key': lesson}
                long_pdf_batch = staticmethod(nullcontext)

                def _augment(self, stage, instruction):
                    return instruction + driver.teacher_branding_instruction()

                def record(self, stage, instruction, text, images):
                    seen.append((stage, [p.name for p in images]))
                    wire = driver.digest(driver.encoded({'stage': stage, 'instruction': instruction, 'text': text,
                        'images': [driver.digest(p.read_bytes()) for p in images]}))
                    self.last_receipt = {'native_stage': stage, 'stage': stage, 'source_sha256': source,
                        'lesson_key': lesson, 'request_sha256': wire, 'provider_response_status': 'completed',
                        'provider': 'chatgpt-oauth', 'actual_model': 'fake', 'response_id': 'fake-' + str(len(seen))}

                def ask_stage(self, stage, instruction, text, images, *, native_context):
                    self.record(stage, instruction, text, images)
                    return {'branding_verified': True, 'reason': 'Từng trang đạt', 'pages': [
                        {'page': number, 'branding_verified': True} for number in native_context['page_numbers']]}

                def ask_long_extract_unit(self, instruction, text, images, ctx):
                    self.record('extract', instruction, text, images)
                    questions = []
                    for i, ref in enumerate(ctx['target_refs'], 1):
                        crop = {'page': int(ref.split()[-1]), 'x': 0, 'y': 0, 'width': 20, 'height': 20}
                        questions.append({'id': 'q' + str(i), 'sourceRef': ref, 'kind': 'mc', 'answer': 'A',
                                          'questionCrops': [crop], 'solutionCrops': [crop]})
                    return {'inventory': ctx['target_refs'], 'questions': questions, 'manualQuestions': [], 'errata': [],
                            'needs_review': False, 'issues': [], 'certain': True, 'coverage_complete': True,
                            'question_only': True, 'grade': 11, 'source_format': 'worksheet',
                            'weightPolicy': 'mtm-equal-large-question', 'branding_verified': False}

            job = {'id': 'fixture', 'version': 1, 'task_scope': 'câu 7–19'}
            ctx = {'task_scope_sha256': 'b' * 64, 'inventory_sha256': 'c' * 64}
            work = {'manifest': manifest, 'folder': root, 'prior': None, 'class_metadata_sha256': 'd' * 64,
                    'hs_pages': pages['hs'], 'gv_pages': pages['gv'], 'valid_receipt': lambda _: True}
            for _ in range(20):
                output = driver.extract_long_homework(AI(), job, source, ctx, 'Trích nguyên nguồn', view, targets, work)
                if output.get('status') != 'yielded_extract':
                    break
                self.assertEqual(output['progress_count'], len(seen))
                work['prior'] = {key: value for key, value in output.items() if key != 'status'}
            else:
                self.fail('work did not reach the usual assembler input')
            self.assertEqual(output['inventory'], targets)
            self.assertEqual(len(output['questions']), 13)
            self.assertEqual([q['id'] for q in output['questions']], [f'q{i}' for i in range(1, 14)])
            self.assertTrue(output['branding_verified'])
            self.assertEqual(output['margin_redactions'], {'hs': [[] for _ in range(19)], 'gv': [[] for _ in range(55)]})
            checked = [name for stage, names in seen if stage == 'branding_clean' for name in names]
            self.assertEqual(checked, [path.name for path in pages['hs'] + pages['gv']])
            self.assertTrue(all(len(names) < 74 for stage, names in seen if stage == 'extract'))
            self.assertEqual(initial_hashes, [hashlib.sha256(path.read_bytes()).hexdigest() for path in pages['hs'] + pages['gv']])


if __name__ == '__main__':
    unittest.main()
