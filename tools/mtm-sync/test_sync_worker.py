import importlib.util, unittest
from pathlib import Path
p=Path(__file__).resolve().parent/'mtm_sync_worker.py'
s=importlib.util.spec_from_file_location('sync_worker',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class WorkerTests(unittest.TestCase):
    def fake(self,sink='sheet_roster',fail=None):
        calls=[]
        def call(body,timeout=12):
            calls.append(body)
            if fail is not None:return fail
            if body['action']=='sync_execute':return 200,{'ok':True,'commandId':'qa'}
            if body['action']=='sync_claim':return 200,{'ok':True,'deliveries':[{'deliveryId':1,'leaseToken':'qa-token','version':1,'sink':sink}]}
            return 200,{'ok':True,'status':body['status']}
        return calls,call
    def test_missing_adapter_is_blocked(self):
        calls,call=self.fake();r=m.run_once(call=call)
        self.assertEqual(r['blocked'],1);self.assertEqual(r['verified'],0)
        self.assertEqual(calls[-1]['errorCode'],'roster_sheet_adapter_not_verified')
    def test_no_readback_cannot_verify(self):
        calls,call=self.fake('web');r=m.run_once(call=call,adapters={'web':lambda _,**kw: {'receipt_ref':'qa'}})
        self.assertEqual(r['retry'],1);self.assertEqual(r['verified'],0)
    def test_verified_requires_real_returned_bytes(self):
        calls,call=self.fake('web');r=m.run_once(call=call,adapters={'web':lambda _,**kw:{'readback_bytes':b'QA-readback','expected_bytes':b'QA-readback','receipt_ref':'qa/readback.json'}})
        self.assertEqual(r['verified'],1);self.assertEqual(len(calls[-1]['readbackHash']),64)
    def test_403_stops_no_route_fallback(self):
        calls,call=self.fake(fail=(403,{}));r=m.run_once(call=call)
        self.assertEqual(r['status'],'permission_blocked');self.assertEqual(len(calls),1)
    def test_200_semantic_error_stops(self):
        calls,call=self.fake(fail=(200,{'error':'not_ready'}));r=m.run_once(call=call)
        self.assertEqual(r['status'],'failed');self.assertEqual(len(calls),2)
    def test_permission_at_sink_stays_blocked(self):
        def denied(_,**kw):raise PermissionError()
        calls,call=self.fake('web');r=m.run_once(call=call,adapters={'web':denied})
        self.assertEqual(r['blocked'],1);self.assertEqual(calls[-1]['errorCode'],'sink_permission_denied')
    def test_no_student_data_in_receipt(self):
        calls,call=self.fake();r=m.run_once(call=call)
        self.assertNotIn('leaseToken',str(r));self.assertEqual(r['sent_messages'],0)
    def test_wrong_projection_cannot_verify(self):
        calls,call=self.fake('web');r=m.run_once(call=call,adapters={'web':lambda _,**kw:{'readback_bytes':b'wrong','expected_bytes':b'expected','receipt_ref':'qa/readback.json'}})
        self.assertEqual(r['verified'],0);self.assertEqual(r['retry'],1)
    def test_tick_error_does_not_block_existing_events(self):
        calls=[]
        def call(body,timeout=12):
            calls.append(body)
            if body['action']=='sync_execute':return 200,{'error':'tick_failed'}
            if body['action']=='sync_claim':return 200,{'ok':True,'deliveries':[]}
            raise AssertionError('unexpected')
        r=m.run_once(call=call)
        self.assertEqual(len(calls),2);self.assertIn('tick_failed',r['errors'])
    def test_stale_ack_does_not_block_next_delivery(self):
        calls=[]
        def call(body,timeout=12):
            calls.append(body)
            if body['action']=='sync_execute':return 200,{'ok':True}
            if body['action']=='sync_claim':return 200,{'ok':True,'deliveries':[{'deliveryId':i,'leaseToken':'qa','version':1,'sink':'web'} for i in (1,2)]}
            if body['deliveryId']==1:return 200,{'error':'stale_lease'}
            return 200,{'ok':True,'status':'blocked'}
        r=m.run_once(call=call)
        self.assertEqual(r['blocked'],1);self.assertIn('ack_failed',r['errors'])
if __name__=='__main__':unittest.main()
