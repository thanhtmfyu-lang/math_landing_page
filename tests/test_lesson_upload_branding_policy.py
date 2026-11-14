import copy,hashlib,importlib.util,json,pathlib,socket,sqlite3,subprocess,unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
def load(path,name):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class BrandingPolicy(unittest.TestCase):
 def setUp(self):
  self.new=load(HERE.parent/'tools/lesson-upload/native-driver.py','branding_current')
 def test_exact_operator_whitelist_not_phone_or_name_variants(self):
  m=self.new;text=m.teacher_branding_instruction();data,_=json.JSONDecoder().raw_decode(text[text.index('{'):]);self.assertTrue(data['operator_verified_public_business_identity']);self.assertEqual(data['exact_lines'],['MINH THÀNH MATH','GV. Tô Minh Thành SĐT: 0967 365 413'])
  for variant in ['Minh Thành Math','MINH THANH MATH','GV. Tô Minh Thành SĐT: 0967365413','GV. Tô Minh Thành SĐT: 0967 365 414','GV. Nguyễn Văn A SĐT: 0967 365 413','GV. Tô Minh Thành SĐT: 0967 365 413 thêm 0900 000 000',' GV. Tô Minh Thành SĐT: 0967 365 413']:
   self.assertNotIn(variant,data['exact_lines'])
  for rule in ['toàn bộ dòng','không phải mọi tên','không nâng certain','giữ needs_review/issues','mọi trang HS/GV','margin_redactions','branding_verified sau khi kiểm thật']:self.assertIn(rule,text)
 def test_extract_appends_after_conflicting_general_teacher_and_class_without_mutation(self):
  class PlainBase:
   def _augment(self,stage,text):return text+' GENERAL: XÓA MỌI TÊN VÀ SỐ ĐIỆN THOẠI NGUỒN.'
  context={'kind':'teacher-upload','text':'Toàn bộ đề','source_version':'a'*64,'task_scope_sha256':'b'*64};meta={'schema':self.new.CLASS_CONTEXT_CONTRACT,'assignment_grade':11,'grade_source':'managed_class_catalog','classes':[]}
  old=PlainBase();new=self.new.teacher_upload_ai_class(PlainBase)()
  for ai in (old,new):ai.teacher_scope_context=copy.deepcopy(context);ai.assignment_class_context=copy.deepcopy(meta)
  before=copy.deepcopy(new.__dict__);a=old._augment('extract','BASE')+self.new.teacher_scope_instruction(context)+self.new.class_metadata_instruction(meta);b=new._augment('extract','BASE');self.assertEqual(b,a+self.new.teacher_branding_instruction());self.assertEqual(new.__dict__,before)
  for stage in ['review','final','independent_solve','source_documents','branding_clean']:self.assertEqual(new._augment(stage,'BASE'),old._augment(stage,'BASE'))
 def test_actual_class_context_hash_preserved_without_external_calls(self):
  cid='0d31a7f2-1da1-4b03-b248-22c260d1c713';job={'class_ids':[cid],'class_grades':{cid:11},'class_names':{cid:'2K10 9+'},'class_dates':{cid:'2026-11-10'},'lesson_date':'2026-11-10','grade_source':'managed_class_catalog','class_grade_complete':True,'class_grade_issue':None};source='a0be2fbd49e6a61293b431753d6e2b200078cb06c17362a70401341df59710c8';b=self.new.managed_class_context(job,source);raw=self.new.encoded(b);self.assertEqual(len(raw),330);self.assertEqual(hashlib.sha256(raw).hexdigest(),'8eefb12ff6e0795a44560f63aa097b61fe4ecd27dda8d96db064e13577c7db9f')
  denied=unittest.mock.Mock(side_effect=AssertionError('NO_EXTERNAL_CALL'))
  with patch.object(socket,'socket',denied),patch.object(subprocess,'Popen',denied),patch.object(sqlite3,'connect',denied):self.new.teacher_branding_instruction()
  denied.assert_not_called()
if __name__=='__main__':unittest.main()
