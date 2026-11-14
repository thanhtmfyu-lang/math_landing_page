"""Cached repair never falls back to extraction or rewrites the native cache."""
from pathlib import Path
import copy,importlib.util,json,os,tempfile,types,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
base=module('cached113_launcher_base',ROOT/'tests/test_lesson_upload_operator_credit.py')
driver=module('cached113_driver',ROOT/'tools/lesson-upload/native-driver.py')

class CachedLauncher(base.Operator112LauncherTests):
 def test_cached_flag_forwarded_with_finite_optins_and_child_only_environment(self):
  out=self.invoke([*base.FLAGS,'--operator-credit',base.CREDIT,'--cached-draft-only'],runtime_sha='a'*64)
  self.assertIsNone(out['error']);child=out['children'][0];self.assertEqual(child['command'][-1],'--cached-draft-only');self.assertEqual(child['kwargs']['env']['MTM_CACHED_DRAFT_ONLY'],'1');self.assertEqual(out['flag_bytes'],b'UNCHANGED_SYNTHETIC_ENABLED')
 def test_cached_mode_missing_credit_or_duplicate_denied_before_native_runtime(self):
  for tail in [['--cached-draft-only'],['--operator-credit',base.CREDIT,'--cached-draft-only','--cached-draft-only']]:
   out=self.invoke([*base.FLAGS,*tail],runtime_sha='a'*64);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['events'],[]);self.assertEqual(out['children'],[])
 def test_normal_child_does_not_inherit_cached_only_capability(self):
  with patch.dict(os.environ,{'MTM_CACHED_DRAFT_ONLY':'1'}):out=self.invoke(['--once','--manual'])
  self.assertIsNone(out['error']);self.assertNotIn('MTM_CACHED_DRAFT_ONLY',out['children'][0]['kwargs']['env'])

class CachedDriver(unittest.TestCase):
 def test_prepare_denied_before_modules_or_provider(self):
  for environment,job in [({'MTM_CACHED_DRAFT_ONLY':'1'},{}),({'MTM_CACHED_DRAFT_ONLY':'0'},{'operator_cached_draft':{}})]:
   with self.subTest(environment=environment),patch.dict(os.environ,environment),patch.object(driver,'modules') as load:
    with self.assertRaisesRegex(ValueError,'CACHED_DRAFT_EXTRACTION_FORBIDDEN'):driver.main({'stage':'prepare','job':job})
    load.assert_not_called()
 def test_missing_cached_binding_denied_before_modules(self):
  with patch.dict(os.environ,{'MTM_CACHED_DRAFT_ONLY':'1'}),patch.object(driver,'modules') as load:
   with self.assertRaisesRegex(ValueError,'BINDING_REQUIRED'):driver.main({'stage':'draft','job':{}})
   load.assert_not_called()
 def fixture(self,root):
  cid='0d31a7f2-1da1-4b03-b248-22c260d1c713';source='a'*64
  job={'id':'14227822-ce9a-4f0f-8df3-489a60b11392','version':1,'class_ids':[cid],'class_names':{cid:'Synthetic class'},'class_dates':{cid:'2026-11-10'},'class_grades':{cid:11},'lesson_date':'2026-11-10','grade_source':'managed_class_catalog','class_grade_complete':True,'class_grade_issue':None}
  runtime=types.SimpleNamespace(state_root=lambda:root,load_pipeline=lambda:None);folder=driver.work_path(runtime,job);folder.mkdir(parents=True)
  context=driver.managed_class_context(job,source);context_hash=driver.digest(driver.encoded(context));(folder/'class-metadata.json').write_bytes(driver.encoded(context))
  record={'sourceVersion':source,'inventory_contract':driver.INVENTORY_CONTRACT,'class_context_contract':driver.CLASS_CONTEXT_CONTRACT,'class_metadata_sha256':context_hash,'draft':{'exam':{'grade':11},'assets':[]}}
  raw=driver.encoded(record);(folder/'draft.json').write_bytes(raw);job['operator_cached_draft']={'contract':'MTM-OPERATOR-CACHED-DRAFT-20261114-v1','source_version':source,'raw_native_draft_sha256':driver.digest(raw),'class_metadata_sha256':context_hash}
  return runtime,job,source,record,raw,folder
 def test_cached_read_attests_raw_bytes_without_rewriting_them(self):
  area=ROOT/'.qa-temp/cached113-native-tests';area.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=area) as tmp:
   runtime,job,source,record,raw,folder=self.fixture(Path(tmp));before={p.name:p.read_bytes() for p in folder.iterdir()}
   with patch.dict(os.environ,{'MTM_CACHED_DRAFT_ONLY':'1'}),patch.object(driver,'modules',return_value=(runtime,None,None,None)):
    result=driver.main({'stage':'draft','job':job,'sourceVersion':source})
   self.assertEqual(result,{**record,'native_cache_record_sha256':driver.digest(raw)});self.assertEqual(before,{p.name:p.read_bytes() for p in folder.iterdir()})
 def test_wrong_raw_hash_stops_before_json_parse_and_leaves_cache_unchanged(self):
  area=ROOT/'.qa-temp/cached113-native-tests';area.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=area) as tmp:
   runtime,job,source,record,raw,folder=self.fixture(Path(tmp));job['operator_cached_draft']['raw_native_draft_sha256']='b'*64
   with patch.dict(os.environ,{'MTM_CACHED_DRAFT_ONLY':'1'}),patch.object(driver,'modules',return_value=(runtime,None,None,None)),patch.object(driver.json,'loads') as parse:
    with self.assertRaisesRegex(ValueError,'BINDING_CHANGED'):driver.main({'stage':'draft','job':job,'sourceVersion':source})
    parse.assert_not_called()
   self.assertEqual((folder/'draft.json').read_bytes(),raw)

def load_tests(loader,tests,pattern):
 return unittest.TestSuite([*(CachedLauncher(n) for n in CachedLauncher.__dict__ if n.startswith('test_')),*(CachedDriver(n) for n in CachedDriver.__dict__ if n.startswith('test_'))])
if __name__=='__main__':unittest.main(verbosity=2)
