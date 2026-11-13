"""Offline CLI integration: native imports see the canonical policy pointer."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'tools/lesson-upload/btvn-web-upload.py'
POLICY = 'Javis/btvn/native-v3/native-ai-policy.json'
FAKE_RUNTIME = '''import json,os
from pathlib import Path

# Capture at import time, before state_root() or any worker work can run.
Path(os.environ['POLICY_TEST_IMPORT_RECEIPT']).write_text(json.dumps({
    'policy': os.environ.get('BTVN_NATIVE_AI_POLICY'),
    'brain': os.environ.get('JAVIS_BRAIN_ROOT'),
    'pipeline': os.environ.get('BTVN_PIPELINE_DIR'),
}),encoding='utf-8')

def state_root():
    return Path(os.environ['POLICY_TEST_STATE_ROOT'])

def publish_settings():
    raise AssertionError('STATUS_MUST_NOT_LOAD_PUBLISH_SETTINGS')

def now_vn():
    raise AssertionError('STATUS_MUST_NOT_CHECK_OR_CHANGE_ACTIVATION')
'''


class LessonUploadPolicyEnvironmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Retain synthetic fixtures under the worktree on T; no live state.
        cls.artifacts = ROOT / '.qa-temp/lesson-upload-policy-tests' / uuid.uuid4().hex
        cls.artifacts.mkdir(parents=True)

    def run_status(self, *, inherited_policy=None, inferred_brain=False, enabled=False):
        case = self.artifacts / self._testMethodName
        brain = case / 'Synthetic Brain with spaces'
        native = case / 'fake-native'
        package = native / 'btvn_native'
        package.mkdir(parents=True)
        (package / '__init__.py').write_text('', encoding='utf-8')
        (package / 'runtime.py').write_text(FAKE_RUNTIME, encoding='utf-8')
        state = case / 'fake-state'
        receipt_path = case / 'native-import-receipt.json'
        pipeline = case / 'existing-custom-pipeline'
        enabled_path = state / 'web-upload/enabled'
        if enabled:
            enabled_path.parent.mkdir(parents=True)
            enabled_path.write_bytes(b'KEEP_EXISTING_ENABLED_FLAG')
            enabled_before = (enabled_path.read_bytes(), enabled_path.stat().st_mtime_ns)

        # Pass only OS essentials and synthetic settings, never credentials.
        env = {name: os.environ[name] for name in ('SystemRoot', 'WINDIR', 'TEMP', 'TMP') if name in os.environ}
        env.update(PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
                   BTVN_NATIVE_MODULE_DIR=str(native), BTVN_PIPELINE_DIR=str(pipeline),
                   POLICY_TEST_STATE_ROOT=str(state), POLICY_TEST_IMPORT_RECEIPT=str(receipt_path))
        if inherited_policy is not None:
            env['BTVN_NATIVE_AI_POLICY'] = inherited_policy
        if inferred_brain:
            # Exercise the real installed layout used by the existing fallback.
            launcher = brain / 'Javis/scripts/synthetic-web-bundle/btvn-web-upload.py'
            launcher.parent.mkdir(parents=True)
            launcher.write_bytes(LAUNCHER.read_bytes())
        else:
            env['JAVIS_BRAIN_ROOT'] = str(brain)
            launcher = LAUNCHER

        result = subprocess.run([sys.executable, str(launcher), '--status'],
                                env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stderr, '')
        self.assertEqual(json.loads(result.stdout),
                         {'enabled': enabled, 'auto_poll': False, 'cron_installed': False})
        observed = json.loads(receipt_path.read_text(encoding='utf-8'))
        self.assertEqual(observed, {'policy': str(brain / POLICY), 'brain': str(brain),
                                    'pipeline': str(pipeline)})
        # Status must remain read-only even while initializing the policy env.
        if enabled:
            self.assertEqual((enabled_path.read_bytes(), enabled_path.stat().st_mtime_ns), enabled_before)
            self.assertEqual(list(state.rglob('*')), [state / 'web-upload', enabled_path])
        else:
            self.assertFalse(state.exists())

    def test_absent_policy_is_bound_before_native_import(self):
        self.run_status()

    def test_wrong_inherited_policy_is_replaced_and_existing_enabled_flag_preserved(self):
        self.run_status(inherited_policy='synthetic-wrong-policy.json', enabled=True)

    def test_policy_uses_inferred_installed_brain_root(self):
        self.run_status(inferred_brain=True)


if __name__ == '__main__':
    unittest.main()
