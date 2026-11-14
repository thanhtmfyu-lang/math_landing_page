"""Synthetic web-adapter parity tests using the frozen ORIGINAL native scope gate."""
import ast,contextlib,copy,hashlib,importlib.util,json,pathlib,sys,types,unittest

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('teacher_context_candidate_test',HERE.parent/'tools/lesson-upload/native-driver.py')
candidate=importlib.util.module_from_spec(spec);spec.loader.exec_module(candidate)

def method(path,name):
 def walk(value):
  if isinstance(value,dict):
   if value.get('name')==name and 'source' in value:return value['source']
   for child in value.values():
    found=walk(child)
    if found:return found
  if isinstance(value,list):
   for child in value:
    found=walk(child)
    if found:return found
 return walk(json.loads(path.read_text(encoding='utf-8')))

class NativeGateError(RuntimeError):pass

@contextlib.contextmanager
def original_scope_gate():
 prefix='synthetic_native_scope'
 package=types.ModuleType(prefix);package.__path__=[]
 runtime=types.ModuleType(prefix+'.runtime');repairs=types.ModuleType(prefix+'.source_repairs')
 def require(condition,message):
  if not condition:raise NativeGateError(message)
 runtime.load_pipeline=lambda:types.SimpleNamespace(require=require)
 ns={'copy':copy}
 exec(method(HERE/'fixtures/native-scope-validation-v1.json','reconstruct_missing_selection'),ns)
 repairs.reconstruct_missing_selection=ns['reconstruct_missing_selection']
 mods={prefix:package,prefix+'.runtime':runtime,prefix+'.source_repairs':repairs};before={key:sys.modules.get(key) for key in mods}
 try:
  sys.modules.update(mods);ns={'__package__':prefix,'copy':copy,'json':json}
  exec(method(HERE/'fixtures/native-scope-validation-v1.json','validate_selection'),ns)
  yield ns['validate_selection']
 finally:
  for key,value in before.items():
   if value is None:sys.modules.pop(key,None)
   else:sys.modules[key]=value

def display(value):
 if isinstance(value,str):return value.replace(chr(8212),'-')
 if isinstance(value,list):return [display(x) for x in value]
 if isinstance(value,dict):return {key:display(x) for key,x in value.items()}
 return value

class TeacherNativeContext(unittest.TestCase):
 def setUp(self):
  self.hs=b'SYNTHETIC_HS';self.gv=b'SYNTHETIC_GV';self.source=hashlib.sha256(self.hs+self.gv).hexdigest();self.scope='Cau 1 den Cau 3'
  self.row={'lesson_key':'web-synthetic-de-1','homework_note':self.scope,'scope_evidence':{'kind':'teacher-upload','task_scope_sha256':hashlib.sha256(self.scope.encode()).hexdigest()}}
  self.config={'automation_policy':{'auto_scope':True,'other':'unchanged'},'grading_policy':'mtm-equal-large-question'}
  refs=['Câu '+str(i) for i in (1,2,3)]
  self.result={'certain':False,'needs_review':True,'issues':['SYNTHETIC_UNCERTAINTY'],'inventory':refs,'manualQuestions':[],
   'questions':[{'id':'q'+str(i),'sourceRef':ref,'prompt':'SYNTHETIC — math','answer':'A','choices':['A','B','C','D'],'questionCrops':[{'page':1,'x':0,'y':0,'width':10,'height':10}]} for i,ref in enumerate(refs,1)],
   'scopeSelection':{'text':self.scope,'sections':[{'label':'Phạm vi giáo viên','pages':[1],'sourceRefs':refs}],'excluded':[]},
   'errata':[{'type':'existing-verified-math','original':'UNCHANGED','corrected':'UNCHANGED'}]}
  self.policy=lambda row,source:{'version':'SYNTHETIC_EXISTING_POLICY','source_version':source}
  candidate.bind_teacher_context(types.SimpleNamespace(),self.config,self.row,self.source,self.scope,self.policy)
 def prepare(self,gate,**changes):
  args={'policy_for':self.policy,'display_text':display,'repair_crops':lambda value,*args:value,'restore_verified_transcription':lambda value,*args:value,'restore_source_notation':lambda *args:None,'validate_selection':gate,**changes}
  return candidate.prepare_teacher_assembly(self.row,self.config,self.result,self.hs,self.gv,1,**args)
 def test_original_gate65_missing_label_still_blocks_before_config_or_math_changes(self):
  self.result['scopeSelection']['sections'][0].pop('label');before=copy.deepcopy((self.row,self.config,self.result))
  with original_scope_gate() as gate:
   with self.assertRaisesRegex(NativeGateError,'Phạm vi thiếu tên phần'):self.prepare(gate)
  self.assertEqual((self.row,self.config,self.result),before)
 def test_original_gate_and_provenance_before_docs_preserve_raw_math_and_uncertainty(self):
  before=copy.deepcopy((self.row,self.config,self.result));calls=[]
  def repair(value,*args):
   calls.append(True)
   for question in value['questions']:question['prompt']+=' CANONICAL_REPAIR_ONCE'
   return value
  with original_scope_gate() as gate:row,config,raw=self.prepare(gate,repair_crops=repair)
  self.assertEqual(len(calls),2) # Two isolated parity projections; returned raw is unrepaired.
  self.assertEqual((self.row,self.config,self.result),before)
  self.assertEqual(raw['questions'],self.result['questions']);self.assertEqual(raw['inventory'],self.result['inventory'])
  for key in ('certain','needs_review','issues','manualQuestions'):self.assertEqual(raw[key],self.result[key])
  self.assertEqual(raw['errata'][:-1],self.result['errata']);self.assertEqual(raw['errata'][-1]['type'],'scope-selection')
  self.assertNotIn('Sheet',raw['errata'][-1]['original']);self.assertIn('không lấy từ Google Sheet',raw['errata'][-1]['reason'])
  self.assertFalse(config['automation_policy']['auto_scope']);self.assertEqual(config['automation_policy']['other'],'unchanged');self.assertTrue(self.config['automation_policy']['auto_scope'])
  self.assertEqual(row['scope_evidence']['kind'],'teacher-upload');self.assertEqual(row['scope_evidence']['selection'],raw['scopeSelection'])
  # Native canonical preprocessing starts from RAW and changes math once, not twice.
  strict_input=repair(display(copy.deepcopy(raw)),self.hs,self.gv)
  self.assertTrue(all(q['prompt'].count('CANONICAL_REPAIR_ONCE')==1 for q in strict_input['questions']))
 def test_changed_locator_bad_page_and_gate_mutation_fail_closed(self):
  with original_scope_gate() as gate:
   for field,value,reason in [('sourceRefs',['NOT_IN_SOURCE'],'Phạm vi và inventory lệch nhau'),('pages',[2],'Phạm vi trỏ trang HS không có thật')]:
    with self.subTest(field=field):
     before=copy.deepcopy(self.result);self.result['scopeSelection']['sections'][0][field]=value
     with self.assertRaisesRegex(NativeGateError,reason):self.prepare(gate)
     self.result=before
   def changed_answer(*args):
    result=gate(*args);result['questions'][0]['answer']='D';return result
   with self.assertRaisesRegex(ValueError,'TEACHER_SCOPE_PREPROCESS_PARITY_REQUIRED'):self.prepare(changed_answer)
   def changed_confidence(*args):
    result=gate(*args);result['certain']=True;result['issues']=[];return result
   with self.assertRaisesRegex(ValueError,'TEACHER_SCOPE_PREPROCESS_PARITY_REQUIRED'):self.prepare(changed_confidence)
   self.assertEqual(self.result['questions'][0]['answer'],'A');self.assertFalse(self.result['certain'])
 def test_reference_preprocess_drift_and_missing_teacher_binding_reject(self):
  def drift(value,*args):value['questions'][0]['sourceRef']='CHANGED';return value
  with original_scope_gate() as gate:
   with self.assertRaisesRegex(ValueError,'TEACHER_SCOPE_REFERENCE_CHANGED'):self.prepare(gate,repair_crops=drift)
   self.row['scope_evidence']['kind']='sheet'
   with self.assertRaisesRegex(ValueError,'TEACHER_SCOPE_BINDING_REQUIRED'):self.prepare(gate)
 def test_subclass_calls_real_parent_and_teacher_authority_is_last_with_policy_parity(self):
  calls=[]
  class NativeAI:
   def _augment(self,stage,instruction):calls.append(stage);return instruction+' SYNTHETIC_CANONICAL_PARENT'
  cls=candidate.teacher_upload_ai_class(NativeAI);ai=cls();row=copy.deepcopy(self.row)
  proof=candidate.bind_teacher_context(ai,self.config,row,self.source,self.scope,self.policy)
  self.assertTrue(proof['teacher_scope_bound']);self.assertTrue(ai.auto_scope_policy);self.assertEqual(ai.errata_policy['source_version'],self.source)
  ai.assignment_class_context={'schema':candidate.CLASS_CONTEXT_CONTRACT,'sourceVersion':self.source,'grade_source':'managed_class_catalog','assignment_grade':11,'lesson_date':'2026-11-10','classes':[]}
  instruction=ai._augment('extract','BASE');self.assertEqual(calls,['extract']);self.assertTrue(instruction.startswith('BASE SYNTHETIC_CANONICAL_PARENT'));self.assertTrue(instruction.endswith(candidate.class_metadata_instruction(ai.assignment_class_context)))
  self.assertIn('không lấy từ Google Sheet',instruction);self.assertIn('Không nâng certain',instruction)
  self.assertEqual(ai._augment('final','BASE'),'BASE SYNTHETIC_CANONICAL_PARENT')
  wrong=copy.deepcopy(row);wrong['scope_evidence']['task_scope_sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'TEACHER_SCOPE_BINDING_REQUIRED'):candidate.bind_teacher_context(ai,self.config,wrong,self.source,self.scope,self.policy)
  wrong=copy.deepcopy(row);wrong['scope_evidence']['source_version']='0'*64
  with self.assertRaisesRegex(ValueError,'SOURCE_BINDING_REQUIRED'):candidate.bind_teacher_context(ai,self.config,wrong,self.source,self.scope,self.policy)
 def test_inactive_canonical_policies_do_not_add_new_scope_authority_or_skip_gate(self):
  before=copy.deepcopy((self.row,self.config,self.result))
  def forbidden(*args):raise AssertionError('unexpected scope gate on inactive native policy')
  row,config,result=self.prepare(forbidden,policy_for=lambda *args:None)
  self.assertEqual((row,config,result),before);self.assertIsNot(row,self.row);self.assertIsNot(result,self.result)

if __name__=='__main__':unittest.main(verbosity=2)
