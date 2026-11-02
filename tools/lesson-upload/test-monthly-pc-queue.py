"""Synthetic queue regression, no executable AI/provider/network call."""
import base64,importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('monthly_pc',Path(__file__).with_name('pc-review-once.py'));pc=importlib.util.module_from_spec(spec);spec.loader.exec_module(pc)
class Queue(unittest.TestCase):
 def test_unavailable_image_bridge_does_not_starve_keys(self):
  key={'schema':1,'questions':[{'id':'fake','kind':'mc','prompt':'2+2','choices':['1','2','3','4']}],'task_scope':'fake','sourceVersion':'a'*64}
  for i in range(10000):
   key['task_scope']='fake-'+str(i);key['request_hash']=pc.digest(pc.encoded(pc.request_identity(key)))
   if key['request_hash'].startswith('f'):break
  raw=b'\xff\xd8\xffsynthetic';essay={'schema':3,'task':'monthly-essay','provider':'grok','questions':[{'id':'self-fake','kind':'self','prompt':'fake'}],'images':[{'sha256':pc.digest(raw),'page':1,'data_base64':base64.b64encode(raw).decode()}],'rubric':'fake rubric','max_score':3,'submission_hash':'a'*64,'rubric_hash':'b'*64}
  essay['request_hash']=pc.digest(pc.encoded(pc.request_identity(essay)));self.assertLess(essay['request_hash'],key['request_hash'])
  docs={pc.QUEUE+'/requests/'+r['request_hash']+'.json':json.dumps(r) for r in [essay,key]}
  class Javis:
   def get(self,*args,**kwargs):return {'items':[{'name':r['request_hash']+'.json'} for r in [essay,key]]}
   def doc(self,path):return docs[path]
   def ghi(self,path,text):docs[path]=text
  def run(*args,**kwargs):
   result={'certain':True,'coverage_complete':True,'question_only':True,'display_complete':True,'answers':{'fake':'D'},'reasoning':{'fake':'Synthetic independent reasoning only.'}}
   kwargs['stdout'].write(json.dumps({'requestId':'fake-request','stopReason':'end_turn','modelUsage':{'fake-provider':{}},'result':result}));return type('Result',(),{'returncode':0})()
  with tempfile.TemporaryDirectory(dir=Path.cwd()/'.qa-temp') as directory,patch.dict(os.environ,{'MTM_MONTHLY_IMAGE_REVIEWER':''}),patch.object(pc.subprocess,'run',run):
   state=Path(directory);out=pc.run_once(Javis(),state=state,manual=True);self.assertEqual(out['status'],'complete');self.assertEqual(out['request_hash'],key['request_hash']);self.assertFalse((state/essay['request_hash']/'claim.json').exists())
if __name__=='__main__':unittest.main()
