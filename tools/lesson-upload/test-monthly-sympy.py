"""Offline synthetic tests; python -m unittest discover -s tools/lesson-upload -p test-monthly-sympy.py."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('monthly_cas',Path(__file__).with_name('monthly-sympy.py'));cas=importlib.util.module_from_spec(spec);spec.loader.exec_module(cas)
class MonthlyCas(unittest.TestCase):
 def setUp(self):
  self.question={'id':'fake','kind':'mc','prompt':'2 + 2 = ?','choices':['1','2','3','4']}
 def value(self,actual='D'):
  return {'sourceVersion':'a'*64,'questions':[self.question],'reviews':[{'provider':p,'sourceVersion':'a'*64,'receipt_hash':p,'slots':[{'question_id':'fake','slot':'answer','actual':actual}],'sympy_checks':[{'question_id':'fake','slot':'answer','actual':actual,'lhs':'1+1','rhs':'2','equal':True}]} for p in ['grok','agy']]}
 def test_correct_source_bound(self):self.assertTrue(cas.verify(self.value())['passed'])
 def test_unrelated_true_claim_cannot_prove_wrong_key(self):
  with self.assertRaisesRegex(ValueError,'CAS_KEY_MISMATCH'):cas.verify(self.value('A'))
 def test_unsupported_prose_stays_held(self):
  self.question['prompt']='Cho hình chóp có thể tích cần tính.'
  with self.assertRaises(Exception):cas.verify(self.value())
 def test_self_stays_held_without_a_proof_adapter(self):
  self.question['kind']='self'
  with self.assertRaisesRegex(ValueError,'CAS_SELF_PROOF_UNSUPPORTED'):cas.verify(self.value('self'))
 def test_no_eval(self):
  import sympy
  with self.assertRaises(ValueError):cas.expression('__import__("os").system("exit")',sympy)
 def test_nested_power_is_bounded(self):
  import sympy
  with self.assertRaisesRegex(ValueError,'CAS_RESULT_LIMIT'):cas.expression('((9**20)**20)**20',sympy)
if __name__=='__main__':unittest.main()
