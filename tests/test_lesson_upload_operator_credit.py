"""Candidate-only launcher tests with the existing fake native/Popen harness."""
from pathlib import Path
import contextlib,importlib.util,io,sys,unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
spec=importlib.util.spec_from_file_location('operator112_base_tests',ROOT/'tests/test_lesson_upload_child_opt_in.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
candidate_spec=importlib.util.spec_from_file_location('operator112_candidate_launcher',ROOT/'tools/lesson-upload/btvn-web-upload.py');candidate=importlib.util.module_from_spec(candidate_spec);candidate_spec.loader.exec_module(candidate)
CREDIT='77777777-7777-4777-8777-777777777777'
FLAGS=['--once','--is-test','--manual','--operator-continuation']

class Operator112LauncherTests(base.ChildOptInTests):
 def setUp(self):
  # Reuse all 110/111 tests against the candidate without editing the harness.
  original=candidate.main
  def invoke_main():
   with contextlib.redirect_stderr(io.StringIO()):
    try:return original()
    except SystemExit as error:raise ValueError('ARGPARSE_REJECTED') from error
  for patcher in [patch.object(base,'launcher',candidate),patch.object(base,'SOURCE',ROOT/'tools/lesson-upload/btvn-web-upload.py'),patch.object(base,'ARTIFACTS',ROOT/'.qa-temp/operator112-launcher-tests'),patch.object(candidate,'main',side_effect=invoke_main)]:patcher.start();self.addCleanup(patcher.stop)
 def test_credit_is_forwarded_once_only_after_existing_lock_publish_gates(self):
  out=self.invoke([*FLAGS,'--operator-credit',CREDIT],runtime_sha='a'*64,inherited='0');self.assertIsNone(out['error']);self.assertEqual(len(out['children']),1)
  child=out['children'][0];self.assertEqual(child['command'][2:],['--once','--is-test','--operator-continuation','--manual','--operator-credit',CREDIT]);self.assertEqual(child['command'].count('--operator-credit'),1)
  self.assertEqual(out['events'],['release_gate','lock_attempt','locked','publish_settings','Popen']);self.assertEqual(out['flag_bytes'],b'UNCHANGED_SYNTHETIC_ENABLED');self.assertEqual(child['kwargs']['env']['MTM_OPERATOR_CONTINUATION_RUNTIME_SHA256'],'a'*64)
  for key in ('BTVN_ALLOW_NETWORK','BTVN_AI_AUDIT'):self.assertEqual(child['kwargs']['env'][key],'1')
  disabled=self.invoke([*FLAGS,'--operator-credit',CREDIT],runtime_sha='a'*64,enabled=False);self.assertEqual(str(disabled['error']),'WEB_UPLOAD_DISABLED');self.assertEqual(disabled['children'],[])
  busy=self.invoke([*FLAGS,'--operator-credit',CREDIT],runtime_sha='a'*64,busy=True);self.assertEqual(busy['children'],[]);self.assertNotIn('publish_settings',busy['events'])
 def test_credit_rejects_wrong_modes_before_native_lock(self):
  cases=[['--review-once','--is-test','--manual','--operator-continuation'],['--once','--is-test','--auto','--operator-continuation'],['--once','--manual','--operator-continuation'],['--once','--is-test','--manual'],['--status'],['--enable'],['--disable'],['--watch','--is-test','--manual','--operator-continuation']]
  for args in cases:
   with self.subTest(args=args):
    out=self.invoke([*args,'--operator-credit',CREDIT],runtime_sha='a'*64);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['events'],[]);self.assertEqual(out['children'],[])
 def test_credit_rejects_malformed_nil_or_duplicate_uuid_before_native_lock(self):
  for credit in ['',CREDIT.upper().replace('7777','AAAA',1),'00000000-0000-0000-0000-000000000000',CREDIT+' ',CREDIT[:-1],'not-a-uuid','{'+CREDIT+'}']:
   with self.subTest(credit=credit):
    out=self.invoke([*FLAGS,'--operator-credit',credit],runtime_sha='a'*64);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['events'],[]);self.assertEqual(out['children'],[])
  for tail in [['--operator-credit',CREDIT,'--operator-credit',CREDIT],['--operator-credit='+CREDIT,'--operator-credit='+CREDIT],['--operator-credit',CREDIT,'--operator-credit='+CREDIT],['--operator-credit']]:
   with self.subTest(tail=tail):
    out=self.invoke([*FLAGS,*tail],runtime_sha='a'*64);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['events'],[]);self.assertEqual(out['children'],[])
 def test_111_no_credit_and_normal_modes_keep_legacy_child_flags(self):
  for args,expected in [(FLAGS,['--once','--is-test','--operator-continuation']),(['--once','--auto','--is-test'],['--once','--is-test','--auto']),(['--review-once','--auto'],['--review-once','--auto']),(['--once','--manual'],['--once'])]:
   with self.subTest(args=args):
    out=self.invoke(args,runtime_sha='a'*64);self.assertIsNone(out['error']);self.assertEqual(out['children'][0]['command'][2:],expected);self.assertNotIn('--operator-credit',out['children'][0]['command'])

if __name__=='__main__':unittest.main(verbosity=2)

def load_tests(loader, tests, pattern):
 return unittest.TestSuite(Operator112LauncherTests(name) for name in Operator112LauncherTests.__dict__ if name.startswith("test_"))
