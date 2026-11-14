"""Focused grade-authority and complete-driver import/cache regression. No native/AI/live."""
import base64,copy,hashlib,importlib.util,json,pathlib,socket,sqlite3,subprocess,tempfile,types,unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('grade_candidate_helper',HERE.parent/'tools/lesson-upload/native-driver.py')
d=load('grade_candidate_complete',HERE.parent/'tools/lesson-upload/native-driver.py')
CID='0d31a7f2-1da1-4b03-b248-22c260d1c713';UID='14227822-ce9a-4f0f-8df3-489a60b11392'

def job(grade=11):return {'id':UID,'paper':1,'work_kind':'homework','class_ids':[CID],'class_names':{CID:'2K10 9+'},'class_dates':{CID:'2026-11-10'},'class_grades':{CID:grade},'grade_source':'managed_class_catalog','class_grade_complete':True,'class_grade_issue':None,'lesson_date':'2026-11-10','task_scope':'Cau 1 den Cau 3','title':'SYNTHETIC'}

class CatalogGradeTests(unittest.TestCase):
 def setUp(self):self.source='a'*64;self.j=job();self.context=m.managed_class_context(self.j,self.source)
 def test_full_driver_import_is_real_and_side_effect_free_preserves_original_codes(self):
  with patch('socket.create_connection',side_effect=AssertionError('NO_NETWORK')),patch('subprocess.Popen',side_effect=AssertionError('NO_PROCESS')),patch('subprocess.run',side_effect=AssertionError('NO_PROCESS')),patch('sqlite3.connect',side_effect=AssertionError('NO_DB')):
   actual=load('full_grade_import_regression',HERE.parent/'tools/lesson-upload/native-driver.py')
  self.assertIsInstance(actual.PUBLIC_NATIVE_ERRORS,frozenset)
  legacy={'NATIVE_SOURCE_INVENTORY_REQUIRED','NATIVE_SOURCE_INVENTORY_AMBIGUOUS','NATIVE_SOURCE_INVENTORY_PAGE_UNRESOLVED','NATIVE_SCOPE_UNRESOLVED','NATIVE_SCOPE_REF_MISSING','NATIVE_SCOPE_AMBIGUOUS','NATIVE_EXTRACT_INVENTORY_MISMATCH','NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'}
  self.assertTrue(legacy<=actual.PUBLIC_NATIVE_ERRORS)
  for code in ('NATIVE_CLASS_METADATA_REQUIRED','NATIVE_CLASS_GRADE_AMBIGUOUS','NATIVE_CLASS_GRADE_CONFLICT','NATIVE_CLASS_GRADE_MISMATCH','NATIVE_CLASS_METADATA_CHANGED'):self.assertEqual(actual.public_error(ValueError(code)),code)
 def test_signed_catalog11_is_fact_for_homework_exam_not_topic_or_name_inference(self):
  self.assertEqual(self.context['assignment_grade'],11);self.assertEqual(self.context['grade_source'],'managed_class_catalog');self.assertNotIn('teacher_confirmed',self.context)
  exam=copy.deepcopy(self.j);exam['work_kind']='exam';self.assertEqual(m.managed_class_context(exam,self.source),self.context)
  named=copy.deepcopy(self.j);named['class_names'][CID]='Oxyz Lop12 2K9';self.assertEqual(m.managed_class_context(named,self.source)['assignment_grade'],11)
 def test_missing_malformed_or_mixed_catalog_is_rejected_before_AI(self):
  bad=[]
  for key,value in [('grade_source','teacher_guess'),('class_grade_complete',False),('class_grade_issue','CLASS_GRADE_METADATA_REQUIRED'),('class_grades',{}),('class_grades',{CID:'11'}),('class_grades',{CID:None}),('class_grades',{CID:13}),('class_names',{}),('class_dates',{}),('class_ids',[CID,CID])]:
   x=copy.deepcopy(self.j);x[key]=value;bad.append(x)
  for x in bad:
   with self.subTest(x=x),self.assertRaisesRegex(ValueError,'NATIVE_CLASS_METADATA_REQUIRED'):m.managed_class_context(x,self.source)
  x=copy.deepcopy(self.j);other='11111111-1111-4111-8111-111111111111';x['class_ids'].append(other)
  for key,value in [('class_names','Synthetic other'),('class_dates','2026-11-10'),('class_grades',12)]:x[key][other]=value
  with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_GRADE_AMBIGUOUS'):m.managed_class_context(x,self.source)
 def test_only_explicit_header_conflict_blocks_not_Oxyz_or_wordproblem_class(self):
  self.assertEqual(m.explicit_heading_grades(['QA SYNTHETIC\nCau 1. A\nCau 3. He truc Oxyz Lop12']),set());m.check_source_grade(self.context,['QA SYNTHETIC\nCau 3. Oxyz'])
  m.check_source_grade(self.context,['TOÁN 11\nCâu 1. Trong lớp 12 có...'])
  for text in ('TOÁN LỚP 12\nCâu 1. A','Khối 12\nCau1. A','Lớp 12A1\nCau1. A','Toan 11-12\nCau1. A'):
   with self.subTest(text=text),self.assertRaisesRegex(ValueError,'NATIVE_CLASS_GRADE_CONFLICT'):m.check_source_grade(self.context,[text])
 def test_output_grade_check_never_fills_grade_or_promotes_uncertainty(self):
  value={'grade':11,'certain':False,'needs_review':True,'issues':['UNCHANGED'],'questions':[{'answer':'SYNTHETIC'}]};before=copy.deepcopy(value)
  self.assertIs(m.check_extracted_class_grade(value,self.context),value);self.assertEqual(value,before)
  for grade in (None,12,'11',True):
   value['grade']=grade;before=copy.deepcopy(value)
   with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_GRADE_MISMATCH'):m.check_extracted_class_grade(value,self.context)
   self.assertEqual(value,before)
 def test_class_snapshot_semantic_sourcebound_without_timestamps_or_source_pin_mutation(self):
  with tempfile.TemporaryDirectory(dir=HERE) as td:
   path=pathlib.Path(td)/'class-metadata.json';pin=path.with_name('source.json');pin.write_bytes(b'IMMUTABLE_ORIGINAL_PIN')
   with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_METADATA_REQUIRED'):m.class_metadata_snapshot(path,self.context)
   writer=lambda p,v:p.write_text(json.dumps(v),encoding='utf-8');one=m.class_metadata_snapshot(path,self.context,allow_create=True,writer=writer)
   path.write_text(json.dumps(self.context,indent=4),encoding='utf-8');self.assertEqual(m.class_metadata_snapshot(path,self.context),one);self.assertNotIn('timestamp',self.context)
   changed=copy.deepcopy(self.context);changed['assignment_grade']=12
   with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_METADATA_CHANGED'):m.class_metadata_snapshot(path,changed)
   self.assertEqual(pin.read_bytes(),b'IMMUTABLE_ORIGINAL_PIN')
 def test_cached_prepare_and_stage_draft_cannot_bypass_catalog_or_new_context_contract(self):
  hs=b'%PDF-SYNTHETIC-HS';gv=b'%PDF-SYNTHETIC-GV';source=hashlib.sha256(hs+gv).hexdigest();context=m.managed_class_context(self.j,source)
  with tempfile.TemporaryDirectory(dir=HERE) as td:
   root=pathlib.Path(td);folder=root/'web-upload/private'/UID/'1';folder.mkdir(parents=True)
   runtime=types.SimpleNamespace(state_root=lambda:root,load_pipeline=lambda:None)
   digest=m.class_metadata_snapshot(folder/'class-metadata.json',context,allow_create=True,writer=d.atomic)
   good={'inventory_contract':d.INVENTORY_CONTRACT,'class_context_contract':m.CLASS_CONTEXT_CONTRACT,'class_metadata_sha256':digest,'sourceVersion':source,'draft':{'exam':{'grade':11}},'extractor':{'provider':'synthetic'}}
   pin={'sourceVersion':source,'scope_sha256':hashlib.sha256(self.j['task_scope'].encode()).hexdigest(),'homework_sha256':hashlib.sha256(hs).hexdigest(),'answer_sha256':hashlib.sha256(gv).hexdigest()};d.atomic(folder/'source.json',pin);before=(folder/'source.json').read_bytes()
   draft={'stage':'draft','job':self.j,'sourceVersion':source};prepare={'stage':'prepare','job':self.j,'homework_base64':base64.b64encode(hs).decode(),'answer_base64':base64.b64encode(gv).decode()}
   with patch.object(d,'modules',return_value=(runtime,None,None,lambda:None)):
    d.atomic(folder/'draft.json',good);self.assertEqual(d.main(draft),good);self.assertEqual(d.main(prepare),good)
    old=copy.deepcopy(good);old['inventory_contract']='MTM-WEB-TEXT-INVENTORY-20261114-v2-pages';d.atomic(folder/'draft.json',old)
    for value in (draft,prepare):
     with self.assertRaisesRegex(ValueError,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'):d.main(value)
    wrong=copy.deepcopy(good);wrong['class_metadata_sha256']='b'*64;d.atomic(folder/'draft.json',wrong)
    with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_METADATA_CHANGED'):d.main(draft)
    d.atomic(folder/'draft.json',good);changed=copy.deepcopy(draft);changed['job']['class_grades'][CID]=12
    with self.assertRaisesRegex(ValueError,'NATIVE_CLASS_METADATA_CHANGED'):d.main(changed)
   self.assertEqual((folder/'source.json').read_bytes(),before)
 def test_subclass_preserves_parent_and_appends_catalog_authority_last(self):
  calls=[]
  class Base:
   def _augment(self,stage,text):calls.append(stage);return text+' CANONICAL_POLICY'
  ai=m.teacher_upload_ai_class(Base)();ai.teacher_scope_context={'kind':'teacher-upload'};ai.assignment_class_context=self.context
  text=ai._augment('extract','BASE');self.assertEqual(calls,['extract']);self.assertIn('managed_class_catalog',text);self.assertIn('"assignment_grade": 11',text);self.assertLess(text.index('CANONICAL_POLICY'),text.index('managed_class_catalog'));self.assertEqual(ai._augment('review','BASE'),'BASE CANONICAL_POLICY')

if __name__=='__main__':unittest.main(verbosity=2)
