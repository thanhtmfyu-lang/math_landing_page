"""OFF installer target. Explicit finite invocation, shared native worker lock."""
import argparse,datetime as dt,importlib,json,os,re,signal,subprocess,sys
from pathlib import Path

def stop_child_group(child):
 if child.poll() is not None:return
 try:os.killpg(child.pid,signal.SIGTERM)
 except ProcessLookupError:return
 try:child.communicate(timeout=5)
 except subprocess.TimeoutExpired:
  try:os.killpg(child.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  child.communicate()

def interrupt(_signal,_frame):raise KeyboardInterrupt()

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--once',action='store_true');ap.add_argument('--review-once',action='store_true');ap.add_argument('--manual',action='store_true');ap.add_argument('--is-test',action='store_true');ap.add_argument('--auto',action='store_true');ap.add_argument('--operator-continuation',action='store_true');ap.add_argument('--status',action='store_true');ap.add_argument('--enable',action='store_true');ap.add_argument('--disable',action='store_true');a=ap.parse_args()
 if sum(map(bool,[a.once,a.review_once,a.status,a.enable,a.disable]))!=1:raise ValueError('EXPLICIT_ACTION_REQUIRED')
 if a.manual and not (a.once or a.review_once):raise ValueError('MANUAL_REQUIRES_FINITE_ONCE')
 if a.auto and (not (a.once or a.review_once) or a.manual):raise ValueError('AUTO_REQUIRES_ENABLED_FINITE_WORKER')
 if a.operator_continuation:
  if not (a.once and a.is_test and a.manual) or a.auto:raise ValueError('OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED')
  if not re.fullmatch('[a-f0-9]{64}',os.environ.get('MTM_OPERATOR_CONTINUATION_RUNTIME_SHA256','')):raise ValueError('OPERATOR_CONTINUATION_RUNTIME_REQUIRED')
 os.environ.setdefault('JAVIS_BRAIN_ROOT',str(Path(__file__).resolve().parents[3]))
 os.environ.setdefault('BTVN_PIPELINE_DIR',str(Path(os.environ['JAVIS_BRAIN_ROOT'])/'Javis/btvn-pipeline'))
 os.environ['BTVN_NATIVE_AI_POLICY']=str(Path(os.environ['JAVIS_BRAIN_ROOT'])/'Javis/btvn/native-v3/native-ai-policy.json')
 # Existing native runtime owns credentials and shared state; no new secretfile.
 native_dir=os.environ.get('BTVN_NATIVE_MODULE_DIR',str(Path(os.environ['JAVIS_BRAIN_ROOT'])/'Javis/scripts/btvn-native-v1'))
 sys.path.insert(0,native_dir)
 from btvn_native import runtime
 root=runtime.state_root();folder=root/'web-upload';enabled=folder/'enabled'
 if a.status:print(json.dumps({'enabled':enabled.is_file(),'auto_poll':False,'cron_installed':False}));return
 folder.mkdir(parents=True,exist_ok=True,mode=0o700)
 if a.disable:enabled.unlink(missing_ok=True);print('{"enabled":false,"auto_poll":false}');return
 # Approval's one-time release gate, not a daily hold on the existing worker.
 if runtime.now_vn()<dt.datetime(2026,11,2,22,30,tzinfo=runtime.VN):raise ValueError('RELEASE_GATE_2230_VN')
 if a.enable:enabled.touch(mode=0o600,exist_ok=True);print('{"enabled":true,"auto_poll":false}');return
 if not enabled.is_file() and (not a.manual or a.operator_continuation):raise ValueError('WEB_UPLOAD_DISABLED')
 import fcntl
 with (root/'worker.lock').open('a+') as lock:
  try:fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:print('{"status":"busy"}');return
  # Canonical live-worker opt-ins apply only to the authorized, locked child.
  url,secret=runtime.publish_settings();env={**os.environ,'BTVN_ALLOW_NETWORK':'1','BTVN_AI_AUDIT':'1','BTVN_NATIVE_MODULE_DIR':native_dir,'BTVN_PUBLISH_URL':url,'BTVN_PUBLISH_SECRET':secret,'MTM_LESSON_LOCK_FD':str(lock.fileno()),'MTM_LESSON_NATIVE_DRIVER':str(Path(__file__).with_name('native-driver.py')),'MTM_LESSON_UPLOAD_STATE_DIR':str(folder/'checkpoints')}
  child=subprocess.Popen([env.get('BTVN_NODE','node'),str(Path(__file__).with_name('runner.mjs')),'--review-once' if a.review_once else '--once',*(['--is-test'] if a.is_test else []),*(['--auto'] if a.auto else []),*(['--operator-continuation'] if a.operator_continuation else [])],env=env,pass_fds=(lock.fileno(),),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
  previous_term=signal.signal(signal.SIGTERM,interrupt)
  try:stdout,stderr=child.communicate(timeout=850)
  except subprocess.TimeoutExpired:
   raise ValueError('FINITE_WORKER_TIMEOUT')
  except KeyboardInterrupt:
   print('{"status":"stopped"}');return
  finally:
   stop_child_group(child);signal.signal(signal.SIGTERM,previous_term)
  # Runner emits only status/code. No stdout from native modules or credentials.
  if child.returncode:raise ValueError('FINITE_WORKER_FAILED')
  status=json.loads(stdout);print(json.dumps({k:status[k] for k in ['status','code'] if k in status}))
if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'status':'blocked','error_type':type(error).__name__}));raise SystemExit(1)
