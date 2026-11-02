"""Synthetic, network-free collector safety regression."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pc',Path(__file__).with_name('pc-review-once.py'));pc=importlib.util.module_from_spec(spec);spec.loader.exec_module(pc)
class CollectorTests(unittest.TestCase):
 def setUp(self):
  self.state=Path(tempfile.mkdtemp(prefix='pc-review-',dir=Path('.qa-temp')))
  q={'questions':[{'id':'q1','kind':'mc','prompt':'1+1=?','choices':['1','2','3','4']}],'task_scope':'Câu1','sourceVersion':'a'*64}
  self.request={'schema':1,'request_hash':pc.digest(pc.encoded(q)),**q};self.files={'requests/'+self.request['request_hash']+'.json':self.request};outer=self
  class Fake:
   def get(self,endpoint,**kwargs):return {'items':[{'name':outer.request['request_hash']+'.json'}]}
   def doc(self,path):return json.dumps(outer.files[path.split('lesson-upload-review/')[1]])
   def ghi(self,path,text):outer.files[path.split('lesson-upload-review/')[1]]=json.loads(text)
  self.javis=Fake()
 def test_disabled_makes_no_provider_call(self):
  with self.assertRaisesRegex(ValueError,'PC_REVIEW_DISABLED'):pc.run_once(self.javis,self.state,lambda *args:self.fail('provider called'))
 def test_private_key_or_hash_change_rejected(self):
  for field in ['answer','solution','acceptedAnswers','answer2_text']:
   value=json.loads(json.dumps(self.request));value['questions'][0][field]='private'
   with self.assertRaisesRegex(ValueError,'QUESTION_ONLY_REQUIRED'):pc.validate_request(value)
  self.request['task_scope']='Different'
  with self.assertRaisesRegex(ValueError,'REQUEST_HASH_MISMATCH'):pc.validate_request(self.request)
 def test_atomic_claim_receipt_and_no_replay(self):
  (self.state/'enabled').touch();calls=[]
  def invoke(request,folder,provider):
   calls.append(provider);return {'request_hash':request['request_hash'],'sourceVersion':request['sourceVersion'],'provider':provider,'model':'synthetic','receipt_hash':'b'*64,'review':{'answers':{'q1':'B'}}}
  result=pc.run_once(self.javis,self.state,invoke);self.assertEqual(result['status'],'complete');self.assertEqual(calls,['grok']);self.assertEqual(pc.run_once(self.javis,self.state,invoke)['status'],'idle');self.assertEqual(len(calls),1)
 def test_uncertain_receipt_not_accepted(self):
  raw={'requestId':'synthetic','stopReason':'end_turn','modelUsage':{'synthetic':{}},'result':{'certain':False}}
  with self.assertRaisesRegex(ValueError,'PROVIDER_UNCERTAIN'):pc.provider_result(raw,'grok','synthetic')
if __name__=='__main__':unittest.main()
