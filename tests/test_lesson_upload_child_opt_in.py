"""Offline runtime/Popen integration for scoped native network/audit child opt-ins."""
import contextlib,datetime as dt,importlib.util,io,json,os,pathlib,sys,tempfile,types,unittest
from unittest.mock import Mock,patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/lesson-upload/btvn-web-upload.py'
spec=importlib.util.spec_from_file_location('lesson_upload_child_opt_in',SOURCE)
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)
ARTIFACTS=ROOT/'.qa-temp/lesson-upload-child-opt-in-tests'

class ChildOptInTests(unittest.TestCase):
 def invoke(self,args,*,enabled=True,busy=False,inherited=None,before_gate=False,publish_error=False,runtime_sha=None):
  ARTIFACTS.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=ARTIFACTS) as tmp:
   state=pathlib.Path(tmp);flag=state/'web-upload/enabled'
   if enabled:flag.parent.mkdir();flag.write_bytes(b'UNCHANGED_SYNTHETIC_ENABLED')
   events=[];children=[];runtime=types.ModuleType('btvn_native.runtime')
   runtime.VN=dt.timezone(dt.timedelta(hours=7));runtime.state_root=lambda:state
   def clock():
    events.append('release_gate')
    return dt.datetime(2026,11,1 if before_gate else 14,tzinfo=runtime.VN)
   runtime.now_vn=clock
   def publish():
    self.assertIn('locked',events);events.append('publish_settings')
    if publish_error:raise PermissionError('SYNTHETIC_DENIED')
    return 'https://synthetic.invalid/publish','SYNTHETIC_ONLY_SECRET'
   runtime.publish_settings=publish
   package=types.ModuleType('btvn_native');package.runtime=runtime
   fcntl=types.ModuleType('fcntl');fcntl.LOCK_EX=1;fcntl.LOCK_NB=2
   def lock(fd,flags):
    self.assertEqual(flags,3);self.assertGreaterEqual(fd,0);events.append('lock_attempt')
    if busy:raise BlockingIOError()
    events.append('locked')
   fcntl.flock=lock
   environment={'JAVIS_BRAIN_ROOT':str(state),'BTVN_NATIVE_MODULE_DIR':str(state/'fake-native')}
   if inherited is not None:environment.update(BTVN_ALLOW_NETWORK=inherited,BTVN_AI_AUDIT=inherited)
   if runtime_sha is not None:environment['MTM_OPERATOR_CONTINUATION_RUNTIME_SHA256']=runtime_sha
   before_flags={key:environment.get(key) for key in ('BTVN_ALLOW_NETWORK','BTVN_AI_AUDIT')}
   def popen(command,**kwargs):
    self.assertEqual(events[-1],'publish_settings');events.append('Popen')
    self.assertEqual({k:os.environ.get(k) for k in before_flags},before_flags)
    self.assertEqual(kwargs['env']['BTVN_ALLOW_NETWORK'],'1');self.assertEqual(kwargs['env']['BTVN_AI_AUDIT'],'1')
    child=Mock();child.returncode=0;child.pid=987654;child.poll.return_value=0
    child.communicate.return_value=(' {"status":"complete"} ','')
    children.append({'command':command,'kwargs':kwargs,'child':child});return child
   output=io.StringIO();error=None
   with patch.dict(os.environ,environment,clear=True),patch.dict(sys.modules,{'btvn_native':package,'btvn_native.runtime':runtime,'fcntl':fcntl}), \
    patch.object(sys,'path',list(sys.path)),patch.object(sys,'argv',[str(SOURCE),*args]), \
    patch.object(launcher.subprocess,'Popen',side_effect=popen),patch.object(launcher.signal,'signal',return_value=None), \
    contextlib.redirect_stdout(output):
    try:launcher.main()
    except Exception as exc:error=exc
    after_flags={k:os.environ.get(k) for k in before_flags}
   self.assertEqual(after_flags,before_flags)
   text=output.getvalue();self.assertNotIn('SYNTHETIC_ONLY_SECRET',text)
   return {'error':error,'events':events,'children':children,'output':text,'flag_exists':flag.is_file(),
           'flag_bytes':flag.read_bytes() if flag.is_file() else None}

 def test_authorized_once_child_gets_opt_ins_after_lock_publish_without_global_env(self):
  for inherited in (None,'0','1'):
   with self.subTest(inherited=inherited):
    out=self.invoke(['--once','--auto','--is-test'],inherited=inherited)
    self.assertIsNone(out['error']);self.assertEqual(len(out['children']),1)
    child=out['children'][0];self.assertIn('--once',child['command']);self.assertIn('--auto',child['command']);self.assertIn('--is-test',child['command'])
    self.assertEqual(child['kwargs']['pass_fds'],(int(child['kwargs']['env']['MTM_LESSON_LOCK_FD']),))
    self.assertTrue(child['kwargs']['start_new_session']);child['child'].communicate.assert_called_once_with(timeout=850)
    self.assertEqual(out['flag_bytes'],b'UNCHANGED_SYNTHETIC_ENABLED')
 def test_review_and_explicit_manual_keep_existing_authorization_modes(self):
  out=self.invoke(['--review-once','--auto']);self.assertIsNone(out['error']);self.assertIn('--review-once',out['children'][0]['command'])
  out=self.invoke(['--once','--manual'],enabled=False);self.assertIsNone(out['error']);self.assertEqual(len(out['children']),1);self.assertFalse(out['flag_exists'])
 def test_disabled_and_busy_never_publish_launch_or_enable_child_opt_ins(self):
  disabled=self.invoke(['--once','--auto'],enabled=False,inherited='0')
  self.assertEqual(str(disabled['error']),'WEB_UPLOAD_DISABLED');self.assertEqual(disabled['children'],[]);self.assertNotIn('publish_settings',disabled['events']);self.assertFalse(disabled['flag_exists'])
  busy=self.invoke(['--once','--auto'],busy=True,inherited='0')
  self.assertIsNone(busy['error']);self.assertEqual(json.loads(busy['output']),{'status':'busy'});self.assertEqual(busy['children'],[]);self.assertNotIn('publish_settings',busy['events'])
 def test_status_enable_disable_do_not_load_settings_lock_or_spawn(self):
  for args,enabled,after in [(['--status'],False,False),(['--status'],True,True),(['--enable'],False,True),(['--disable'],True,False)]:
   with self.subTest(args=args,enabled=enabled):
    out=self.invoke(args,enabled=enabled,inherited='0');self.assertIsNone(out['error']);self.assertEqual(out['flag_exists'],after)
    self.assertEqual(out['children'],[]);self.assertNotIn('lock_attempt',out['events']);self.assertNotIn('publish_settings',out['events'])
 def test_argument_release_and_publish_denials_do_not_spawn_child(self):
  for args in (['--once','--auto','--manual'],['--status','--auto'],['--once','--review-once']):
   with self.subTest(args=args):
    out=self.invoke(args);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['children'],[]);self.assertNotIn('publish_settings',out['events'])
  gate=self.invoke(['--once'],before_gate=True);self.assertEqual(str(gate['error']),'RELEASE_GATE_2230_VN');self.assertNotIn('lock_attempt',gate['events'])
  denied=self.invoke(['--once'],publish_error=True);self.assertIsInstance(denied['error'],PermissionError);self.assertEqual(denied['children'],[])
 def test_operator_continuation_is_explicit_manual_test_only_after_existing_gates(self):
  args=['--once','--is-test','--manual','--operator-continuation'];sha='a'*64
  out=self.invoke(args,runtime_sha=sha);self.assertIsNone(out['error']);self.assertEqual(len(out['children']),1)
  child=out['children'][0];self.assertIn('--operator-continuation',child['command']);self.assertIn('--is-test',child['command']);self.assertNotIn('--auto',child['command'])
  self.assertEqual(child['kwargs']['env']['MTM_OPERATOR_CONTINUATION_RUNTIME_SHA256'],sha);self.assertEqual(out['flag_bytes'],b'UNCHANGED_SYNTHETIC_ENABLED')
  disabled=self.invoke(args,runtime_sha=sha,enabled=False);self.assertEqual(str(disabled['error']),'WEB_UPLOAD_DISABLED');self.assertEqual(disabled['children'],[])
  busy=self.invoke(args,runtime_sha=sha,busy=True);self.assertIsNone(busy['error']);self.assertEqual(json.loads(busy['output']),{'status':'busy'});self.assertEqual(busy['children'],[])
  denied=self.invoke(args,runtime_sha=sha,publish_error=True);self.assertIsInstance(denied['error'],PermissionError);self.assertEqual(denied['children'],[])
 def test_operator_flag_or_metadata_cannot_broaden_other_modes(self):
  bad=[['--once','--is-test','--operator-continuation'],['--once','--manual','--operator-continuation'],['--once','--auto','--is-test','--operator-continuation'],['--review-once','--manual','--is-test','--operator-continuation'],['--status','--operator-continuation'],['--enable','--operator-continuation'],['--disable','--operator-continuation']]
  for args in bad:
   with self.subTest(args=args):
    out=self.invoke(args,runtime_sha='a'*64);self.assertIsInstance(out['error'],ValueError);self.assertEqual(out['children'],[]);self.assertNotIn('lock_attempt',out['events'])
  for value in (None,'','A'*64,'a'*63,'x'*64):
   with self.subTest(runtime_sha=value):
    out=self.invoke(['--once','--is-test','--manual','--operator-continuation'],runtime_sha=value);self.assertEqual(str(out['error']),'OPERATOR_CONTINUATION_RUNTIME_REQUIRED');self.assertEqual(out['children'],[])
  normal=self.invoke(['--once','--auto','--is-test'],runtime_sha='a'*64);self.assertIsNone(normal['error']);self.assertNotIn('--operator-continuation',normal['children'][0]['command'])

if __name__=='__main__':unittest.main(verbosity=2)
