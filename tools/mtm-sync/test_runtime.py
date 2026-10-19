import unittest, importlib.util, types, sys, json
from pathlib import Path
R=Path(__file__).resolve().parent
def module(path,name):
    from importlib.machinery import SourceFileLoader
    spec=importlib.util.spec_from_loader(name,SourceFileLoader(name,str(path)))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=module(R/'mtm_dd.py','mtm_dd_sync_test')
class RuntimeTests(unittest.TestCase):
    def test_semantic_error_in_200_fails(self):
        self.assertFalse(m.thanh_cong(200,{'error':'conflict'}))
    def test_nested_error_fails(self):
        self.assertFalse(m.thanh_cong(200,{'result':{'ok':False}}))
    def test_partial_status_fails(self):
        self.assertFalse(m.thanh_cong(200,{'syncStatus':'partial'}))
    def test_permission_fails(self):
        self.assertFalse(m.thanh_cong(403,{}))
    def test_data_list_is_success(self):
        self.assertTrue(m.thanh_cong(200,[]))
    def test_business_ok_with_pending_is_still_business_ok(self):
        self.assertTrue(m.thanh_cong(200,{'ok':True,'sync':{'pending':3}}))
    def test_standard_envelope(self):
        calls=[];old=m.goi
        try:
            m.goi=lambda body,timeout=60:calls.append(body) or (200,{'ok':True})
            m.thuc_hien({'action':'mark','studentId':'QA'},'qa:message:1:action:1')
            self.assertEqual(calls,[{'action':'sync_execute','sourceMsg':'qa:message:1:action:1','command':{'action':'mark','studentId':'QA'}}])
        finally:m.goi=old
    def test_source_required_before_transport(self):
        with self.assertRaises(ValueError):m.thuc_hien({'action':'mark'},'')
    def test_action_required_before_transport(self):
        with self.assertRaises(ValueError):m.thuc_hien({},'qa:1')
    def test_status_is_explicit_read_action(self):
        calls=[];old=m.goi
        try:
            m.goi=lambda body,timeout=60:calls.append(body) or (200,{})
            m.dong_bo_trang_thai('qa:1')
            self.assertEqual(calls,[{'action':'sync_status','sourceMsg':'qa:1'}])
        finally:m.goi=old
if __name__=='__main__':unittest.main()
