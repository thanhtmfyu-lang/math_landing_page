import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('native_page_proof_test', ROOT / 'tools/lesson-upload/native-page-proof.py')
proof = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(proof)


class FakeNativeAI:
    def __init__(self):
        self.source_context = {'source_version': '1' * 64, 'lesson_key': 'fixture-lesson'}
        self.calls = []
        self.result_override = None
        self.receipt_override = {}
        self.error = None
        self.on_call = lambda: None

    def ask_stage(self, stage, instruction, text, paths, *, native_context):
        self.calls.append((stage, instruction, text, paths, native_context))
        if self.error is not None:
            raise self.error
        self.last_receipt = {
            'native_stage': stage, 'stage': stage, 'provider_response_status': 'completed',
            'request_sha256': proof.digest({'stage': stage, 'instruction': instruction, 'text': text,
                                           'images': [proof.image_hash(path) for path in paths]}),
            'source_sha256': self.source_context['source_version'], 'lesson_key': self.source_context['lesson_key'],
            'provider': 'fixture', 'actual_model': 'fixture-model', 'response_id': 'fixture-receipt',
            'ignored_payload': 'private fixture payload', **self.receipt_override,
        }
        self.on_call()
        if self.result_override is not None:
            return self.result_override
        return {'branding_verified': True, 'reason': 'private fixture reason', 'pages': [
            {'page': number, 'branding_verified': True} for number in native_context['page_numbers']
        ]}


def valid_fixture_receipt(receipt):
    return receipt.get('provider') == 'fixture' and receipt.get('response_id') == 'fixture-receipt'


class OriginalPageProofTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)

    def fixture(self, hs=2, gv=1):
        manifest = []
        images = {'hs': [], 'gv': []}
        for document, count in [('hs', hs), ('gv', gv)]:
            for number in range(1, count + 1):
                path = self.folder / f'{document}-{number}.png'
                Image.new('RGB', (4, 3), color=(number, 1, 2)).save(path)
                images[document].append(path)
                manifest.append({'document': document, 'page': number, 'width': 4, 'height': 3})
        return manifest, images['hs'], images['gv']

    def test_entire_source_is_partitioned_by_role_and_original_page_number(self):
        fixture = self.fixture(hs=7, gv=13)
        units = list(proof.proof_units(*fixture))
        self.assertEqual([len(unit['pages']) for unit in units], [6, 1, 6, 6, 1])
        self.assertEqual([(unit['document'], row['page']) for unit in units for row in unit['pages']],
                         [('hs', n) for n in range(1, 8)] + [('gv', n) for n in range(1, 14)])
        self.assertEqual(units, list(proof.proof_units(*fixture)))
        self.assertEqual(units, json.loads(json.dumps(units)))

    def test_manifest_refuses_missing_duplicate_and_unrelated_pages(self):
        manifest, hs, gv = self.fixture()
        for invalid in (manifest[:-1], [*manifest, manifest[0]], [{**manifest[0], 'page': 9}, *manifest[1:]]):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, proof.REVIEW_REQUIRED):
                list(proof.proof_units(invalid, hs, gv))

    def test_fresh_positive_proof_is_role_and_wire_bound_with_identity_preservation(self):
        unit = next(proof.proof_units(*self.fixture()))
        ai = FakeNativeAI()
        record = proof.check_branding_unit(ai, unit, valid_fixture_receipt)
        self.assertEqual(len(ai.calls), 1)
        stage, instruction, text, paths, stage_context = ai.calls[0]
        self.assertEqual(stage, 'branding_clean')
        self.assertIn('GV. Tô Minh Thành SĐT: 0967 365 413', instruction)
        self.assertEqual(stage_context, {'page_numbers': [1, 2]})
        self.assertEqual(json.loads(text)['document'], 'hs')
        self.assertEqual(paths, [Path(row['path']) for row in unit['pages']])
        self.assertNotIn('private fixture', json.dumps(record))
        self.assertTrue(all(row['original_sha256'] == row['output_sha256']
                            for row in record['preservation']['pages']))
        self.assertTrue(proof.validate_branding_unit(unit, record, valid_fixture_receipt,
                                                     source_version='1' * 64, lesson_key='fixture-lesson'))

    def test_rejects_negative_partial_duplicate_and_untrusted_provider_output(self):
        unit = next(proof.proof_units(*self.fixture()))
        good_row = {'page': 1, 'branding_verified': True}
        for result in (
                {'branding_verified': False, 'reason': 'fixture', 'pages': [good_row, {**good_row, 'page': 2}]},
                {'branding_verified': True, 'reason': 'fixture', 'pages': [good_row]},
                {'branding_verified': True, 'reason': 'fixture', 'pages': [good_row, good_row]},
                {'branding_verified': True, 'reason': 'fixture', 'pages': [good_row, {'page': 2, 'branding_verified': False}]}):
            ai = FakeNativeAI()
            ai.result_override = result
            with self.subTest(result=result), self.assertRaisesRegex(ValueError, proof.REVIEW_REQUIRED):
                proof.check_branding_unit(ai, unit, valid_fixture_receipt)
        for receipt in ({'request_sha256': '2' * 64}, {'provider_response_status': 'incomplete'},
                        {'native_stage': 'extract'}, {'source_sha256': '2' * 64}, {'provider': 'other'}):
            ai = FakeNativeAI()
            ai.receipt_override = receipt
            with self.subTest(receipt=receipt), self.assertRaisesRegex(ValueError, proof.REVIEW_REQUIRED):
                proof.check_branding_unit(ai, unit, valid_fixture_receipt)

    def test_changed_image_is_rejected_after_model_call_and_on_readback(self):
        unit = next(proof.proof_units(*self.fixture()))
        ai = FakeNativeAI()
        record = proof.check_branding_unit(ai, unit, valid_fixture_receipt)
        path = Path(unit['pages'][0]['path'])
        ai.on_call = lambda: Image.new('RGB', (4, 3), color=(255, 1, 2)).save(path)
        with self.assertRaisesRegex(ValueError, proof.REVIEW_REQUIRED):
            proof.check_branding_unit(ai, unit, valid_fixture_receipt)
        self.assertFalse(proof.validate_branding_unit(unit, record, valid_fixture_receipt))

    def test_native_shape_error_becomes_branding_hold_but_transport_stays_distinct(self):
        unit = next(proof.proof_units(*self.fixture()))
        ai = FakeNativeAI()
        ai.error = type('GateError', (Exception,), {})('bad schema')
        with self.assertRaisesRegex(ValueError, proof.REVIEW_REQUIRED):
            proof.check_branding_unit(ai, unit, valid_fixture_receipt)
        ai.error = TimeoutError('transport deadline')
        with self.assertRaises(TimeoutError):
            proof.check_branding_unit(ai, unit, valid_fixture_receipt)

    def test_readback_refuses_different_page_unit_source_lease_or_unproved_preservation(self):
        unit, other = list(proof.proof_units(*self.fixture()))
        record = proof.check_branding_unit(FakeNativeAI(), unit, valid_fixture_receipt)
        self.assertFalse(proof.validate_branding_unit(other, record, valid_fixture_receipt))
        self.assertFalse(proof.validate_branding_unit(unit, record, valid_fixture_receipt, source_version='2' * 64))
        self.assertFalse(proof.validate_branding_unit(unit, record, valid_fixture_receipt, lesson_key='another'))
        invalid = copy.deepcopy(record)
        invalid['preservation']['pages'][0]['output_sha256'] = '8' * 64
        self.assertFalse(proof.validate_branding_unit(unit, invalid, valid_fixture_receipt))


if __name__ == '__main__':
    unittest.main()
