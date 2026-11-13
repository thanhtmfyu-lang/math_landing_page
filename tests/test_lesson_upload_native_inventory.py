"""Offline HS-inventory boundary tests; no native engine, budget or provider calls."""
import copy,hashlib,importlib.util,json,pathlib,tempfile,types,unittest
from unittest.mock import Mock,patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/lesson-upload/native-driver.py'
spec=importlib.util.spec_from_file_location('native_inventory_driver',SOURCE)
driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
FIXTURE=ROOT/'tests/fixtures/lesson-upload-three-questions.synthetic.pdf'

def result(refs):
 return {'certain':True,'inventory':list(refs),'questions':[{'id':'q'+str(i+1),'sourceRef':ref} for i,ref in enumerate(refs)],'manualQuestions':[]}

class NativeInventoryTests(unittest.TestCase):
 def test_actual_three_question_pdf_fixture_independent_inventory_and_range(self):
  self.assertTrue(FIXTURE.is_file(),'The approved synthetic three-question HS fixture is required for this local QA.')
  self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),'cd80de30759c480af89b8228c2281aa20fce9258fda83ef36702d144a60fa9d0')
  import fitz # Same PDF text engine as the native renderer; no provider/OCR.
  with fitz.open(FIXTURE) as document:text='\f'.join(page.get_text() for page in document)
  self.assertIn('QA SYNTHETIC',text)
  inventory=driver.source_inventory(text)
  self.assertEqual([r['sourceRef'] for r in inventory],['Câu 1','Câu 2','Câu 3'])
  self.assertEqual(driver.scoped_inventory(inventory,'Cau 1 den Cau 3'),inventory)
  self.assertEqual(driver.scoped_inventory(inventory,'Làm toàn bộ 3 câu trong phiếu.'),inventory)
  self.assertEqual(driver.scoped_inventory(inventory,'toàn bộ đề'),inventory)

 def test_section_number_restarts_have_explicit_source_qualification(self):
  text='PHẦN I. Trắc nghiệm\nCâu 1. A\nCâu 2. B\fPHẦN II. Đúng sai\nCâu 1. C\nCâu 2. D'
  inventory=driver.source_inventory(text)
  self.assertEqual([r['sourceRef'] for r in inventory],['I.1','I.2','II.1','II.2'])
  self.assertEqual([r['sourceRef'] for r in driver.scoped_inventory(inventory,'Phần II: câu 1 đến câu 2')],['II.1','II.2'])
  with self.assertRaisesRegex(ValueError,'NATIVE_SCOPE_AMBIGUOUS'):driver.scoped_inventory(inventory,'Câu 1')
  self.assertEqual(len(driver.scoped_inventory(inventory,'toàn bộ đề')),4)
  for text in ('Câu 1. A\nCâu 1. B','PHẦN A. Chưa định danh\nCâu 1. A','Câu 1.1. A\nCâu 2. B','Bài 1. Tiêu đề\nCâu 1. A','Câu1. A\nCâu 2. B','Câu 1. A\nCâu số 2. B','Câu 1. A\n2. B'):
   with self.subTest(text=text),self.assertRaisesRegex(ValueError,'NATIVE_SOURCE_INVENTORY_AMBIGUOUS'):driver.source_inventory(text)

 def test_explicit_scopes_exclude_without_silently_dropping_missing_or_prose(self):
  inventory=driver.source_inventory('\n'.join('Bài '+str(n)+'. Nội dung' for n in range(5,10)))
  self.assertEqual([r['number'] for r in driver.scoped_inventory(inventory,'từ bài 5 trở đi đến hết và bỏ qua bài 6')],[5,7,8,9])
  self.assertEqual([r['number'] for r in driver.scoped_inventory(inventory,'Bài 5 đến 9 trừ 6, 8')],[5,7,9])
  self.assertEqual([r['number'] for r in driver.scoped_inventory(inventory,'Bài 9, 5 và 7')],[5,7,9])
  for scope,code in [('câu 4 đến 8','NATIVE_SCOPE_REF_MISSING'),('Bài 5, 5','NATIVE_SCOPE_UNRESOLVED'),('bài 5 đến 99999999999999999999','NATIVE_SCOPE_REF_MISSING'),('làm phần ví dụ dễ','NATIVE_SCOPE_UNRESOLVED'),('toàn bộ 6 câu','NATIVE_SCOPE_REF_MISSING'),('bài 5 đến 9 trừ 10','NATIVE_SCOPE_REF_MISSING'),('','NATIVE_SCOPE_UNRESOLVED')]:
   with self.subTest(scope=scope),self.assertRaisesRegex(ValueError,code):driver.scoped_inventory(inventory,scope)

 def test_scan_or_ambiguous_scope_stops_before_ai_and_receipt_is_not_fabricated(self):
  ai=types.SimpleNamespace(check_access=Mock(),ask_stage=Mock(),last_receipt=None)
  p=types.SimpleNamespace(EXTRACT_PROMPT='CANONICAL_SYNTHETIC_PROMPT')
  job={'title':'QA','task_scope':'toàn bộ đề'}
  with self.assertRaisesRegex(ValueError,'NATIVE_SOURCE_INVENTORY_REQUIRED'):driver.extract_source(ai,p,job,'a'*64,'[visual scan, no readable text]','PRIVATE_TEACHER_SYNTHETIC',[],[],'PAGE_MANIFEST')
  job['task_scope']='làm các câu dễ'
  with self.assertRaisesRegex(ValueError,'NATIVE_SCOPE_UNRESOLVED'):driver.extract_source(ai,p,job,'a'*64,'Câu 1. A','PRIVATE_TEACHER_SYNTHETIC',[],[],'PAGE_MANIFEST')
  ai.check_access.assert_not_called();ai.ask_stage.assert_not_called();self.assertIsNone(ai.last_receipt)

 def test_native_extract_receives_bound_independent_targets_and_preserves_private_workflow(self):
  receipt={'provider':'chatgpt-oauth','actual_model':'synthetic-model','response_id':'synthetic-receipt','cache_hit':True}
  ai=types.SimpleNamespace(check_access=Mock(),ask_stage=Mock(return_value=result(['Câu 2','Câu 3'])),last_receipt=receipt)
  p=types.SimpleNamespace(EXTRACT_PROMPT='CANONICAL_SYNTHETIC_PROMPT')
  job={'work_kind':'exam','exam_type':'custom','title':'QA · Đề tùy chọn','task_scope':'Câu 2 đến 3'}
  text='Câu 1. A\nCâu 2. B\fCâu 3. C';source='b'*64
  actual=driver.extract_source(ai,p,job,source,text,'PRIVATE_TEACHER_SYNTHETIC',[pathlib.Path('hs1'),pathlib.Path('hs2')],[pathlib.Path('gv1')],'PAGE_MANIFEST')
  args,kwargs=ai.ask_stage.call_args
  self.assertEqual(args[0],'extract');self.assertEqual(ai.ask_stage.call_count,1)
  ai.check_access.assert_called_once_with()
  context=kwargs['native_context'];self.assertEqual(context['target_refs'],['Câu 2','Câu 3']);self.assertEqual(context['source_refs'],['Câu 1','Câu 2','Câu 3'])
  self.assertEqual((context['source_version'],context['hs_count'],context['gv_count']),(source,2,1))
  self.assertEqual(context['task_scope_sha256'],hashlib.sha256(job['task_scope'].encode()).hexdigest())
  self.assertEqual(context['inventory_sha256'],driver.digest(driver.encoded(driver.source_inventory(text))))
  self.assertTrue(args[1].startswith(p.EXTRACT_PROMPT));self.assertIn('manualQuestions',args[1]);self.assertIn('QA · Đề tùy chọn',args[1]);self.assertIn('"loai_bai": "exam"',args[1]);self.assertIn('"loai_kiem_tra": "custom"',args[1])
  self.assertNotIn('PRIVATE_TEACHER_SYNTHETIC',args[1]);self.assertIn('PRIVATE_TEACHER_SYNTHETIC',args[2]);self.assertIs(ai.last_receipt,receipt)
  self.assertEqual(actual,result(['Câu 2','Câu 3']))
  public_request=driver.question_request(actual['questions'],job['task_scope'],source)
  self.assertNotIn('PRIVATE_TEACHER_SYNTHETIC',json.dumps(public_request));self.assertNotIn('inventory_nguon_HS',public_request)

 def test_post_extract_and_cached_return_cannot_self_certify_inventory(self):
  targets=['I.1','I.2','II.1'];good=result(targets)
  self.assertIs(driver.check_extracted_inventory(good,targets),good)
  good=result(targets);good['manualQuestions']=[good['questions'].pop()]
  self.assertIs(driver.check_extracted_inventory(good,targets),good)
  variants=[]
  for key in ('inventory','questions','manualQuestions'):
   value=copy.deepcopy(good);value.pop(key);variants.append(value)
  value=result(['X.9']);variants.append(value) # Internally consistent, absent in HS.
  value=result(targets);value['inventory']=targets[::-1];variants.append(value)
  value=result(targets);value['inventory'].append('I.1');variants.append(value)
  value=result(targets);value['questions'].pop();variants.append(value)
  value=result(targets);value['questions'][1]['sourceRef']='I.1';variants.append(value)
  value=result(targets);value['questions'][0]['sourceRef']='UNKNOWN';variants.append(value)
  for value in variants:
   with self.subTest(value=value),self.assertRaisesRegex(ValueError,'NATIVE_EXTRACT_INVENTORY_MISMATCH'):driver.check_extracted_inventory(value,targets)
  ai=types.SimpleNamespace(check_access=Mock(),ask_stage=Mock(return_value=result(['X.9'])),last_receipt={'cache_hit':True})
  with self.assertRaisesRegex(ValueError,'NATIVE_EXTRACT_INVENTORY_MISMATCH'):driver.extract_source(ai,types.SimpleNamespace(EXTRACT_PROMPT='P'),{'title':'QA','task_scope':'toàn bộ đề'},'a'*64,'Câu 1. A','GV',[],[],'M')

 def test_stale_private_draft_stops_both_read_and_prepare_without_reextract(self):
  temp_root=ROOT/'.qa-temp/native-inventory-tests';temp_root.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=temp_root) as temp:
   runtime=types.SimpleNamespace(state_root=lambda:pathlib.Path(temp),load_pipeline=lambda:None)
   job={'id':'11111111-1111-4111-8111-111111111111','paper':1,'task_scope':'toàn bộ đề'}
   folder=driver.work_path(runtime,job);folder.mkdir(parents=True)
   hs=b'%PDF-SYNTHETIC-HS';gv=b'%PDF-SYNTHETIC-GV';identity=driver.digest(hs+gv)
   record={'sourceVersion':identity,'draft':{'synthetic':True}}
   (folder/'draft.json').write_text(json.dumps(record))
   with patch.object(driver,'modules',return_value=(runtime,None,None,Mock())):
    with self.assertRaisesRegex(ValueError,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'):driver.main({'stage':'draft','job':job,'sourceVersion':identity})
    import base64
    value={'stage':'prepare','job':job,'homework_base64':base64.b64encode(hs).decode(),'answer_base64':base64.b64encode(gv).decode()}
    with self.assertRaisesRegex(ValueError,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'):driver.main(value)
    self.assertFalse((folder/'homework.original').exists())
    record['inventory_contract']=driver.INVENTORY_CONTRACT;(folder/'draft.json').write_text(json.dumps(record))
    self.assertEqual(driver.main({'stage':'draft','job':job,'sourceVersion':identity}),record)
    self.assertEqual(driver.main(value),record)
    with self.assertRaisesRegex(ValueError,'SOURCE_CHANGED'):driver.main({'stage':'draft','job':job,'sourceVersion':'a'*64})

if __name__=='__main__':unittest.main(verbosity=2)
