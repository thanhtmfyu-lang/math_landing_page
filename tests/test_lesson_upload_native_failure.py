"""Three focused local groups, no native operation/provider/DB/auth call."""
from pathlib import Path
import ast,contextlib,hashlib,importlib.util,io,json,os,runpy,sys,tempfile,unittest
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('failure_safe',HERE.parent/'tools/lesson-upload/native-driver.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
UUID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';SYMLINK_TESTED=False
def fixture(root):
 folder=root/'web-upload/private'/UUID/'1';folder.mkdir(parents=True)
 job={'id':UUID,'version':2,'paper':1,'task_scope':'Synthetic scope','work_kind':'homework'};pin={'sourceVersion':'1'*64,'scope_sha256':m._failure_sha(job['task_scope'].encode()),'homework_sha256':'2'*64,'answer_sha256':'3'*64};(folder/'source.json').write_text(json.dumps(pin),encoding='utf-8');return folder,job,pin

class FailureCandidate(unittest.TestCase):
 def test_pure_projection_redacts_text_paths_ids_and_bounds_trace(self):
  def recurse(n):
   if n:return recurse(n-1)
   raise RuntimeError('SYNTHETIC_SECRET Authorization Bearer TOKEN response_id=private /secret/config.json')
  try:recurse(15)
  except Exception as error:result=m.failure_projection(error,{'upload_id':UUID,'paper':1,'stage':'prepare','source_version':'1'*64},frozenset({'NATIVE_SCOPE_UNRESOLVED'}))
  raw=json.dumps(result);self.assertNotIn('SYNTHETIC_SECRET',raw);self.assertNotIn('Bearer',raw);self.assertNotIn('/secret',raw);self.assertNotIn('response_id=',raw);self.assertLessEqual(len(result['trace_frames']),8);self.assertEqual(result['exception_class'],'RuntimeError');self.assertIsNone(result['public_code']);self.assertRegex(result['reason_sha256'],'^[a-f0-9]{64}$');self.assertTrue(all('/' not in f['file'] and '\\' not in f['file'] for f in result['trace_frames']))
  known=m.failure_projection(ValueError('NATIVE_SCOPE_UNRESOLVED'),{},frozenset({'NATIVE_SCOPE_UNRESOLVED'}));self.assertEqual(known['public_code'],'NATIVE_SCOPE_UNRESOLVED');self.assertIsNone(known['reason_sha256'])
 def test_writer_existing_bound_only_samepin_and_no_source_or_dir_mutation(self):
  global SYMLINK_TESTED
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   root=Path(tmp).resolve();folder,job,pin=fixture(root);source=folder/'source.json';before=(source.read_bytes(),source.stat().st_mtime_ns);ctx=m.failure_context(folder,job,'prepare',pin['sourceVersion'],pin);self.assertIsNotNone(ctx)
   self.assertTrue(m.write_failure_safe(ctx,KeyError('SYNTHETIC_SECRET'),frozenset()));report=folder/'failure.safe.json';self.assertLessEqual(report.stat().st_size,32768);self.assertNotIn('SYNTHETIC_SECRET',report.read_text());self.assertEqual(before,(source.read_bytes(),source.stat().st_mtime_ns));self.assertFalse((folder/'.failure.safe.json.tmp').exists())
   old=report.read_bytes();source.write_text(json.dumps({**pin,'answer_sha256':'4'*64}),encoding='utf-8');self.assertFalse(m.write_failure_safe(ctx,ValueError('next'),frozenset()));self.assertEqual(report.read_bytes(),old)
   missing=root/'web-upload/private'/UUID/'2';self.assertIsNone(m.failure_context(missing,{**job,'paper':2},'prepare',pin['sourceVersion'],pin));self.assertFalse(missing.exists())
   source.write_text(json.dumps(pin),encoding='utf-8');self.assertIsNone(m.failure_context(folder,{**job,'id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},'prepare',pin['sourceVersion'],pin));self.assertIsNone(m.failure_context(folder,job,'unknown',pin['sourceVersion'],pin))
   target=root/'outside.json';target.write_bytes(source.read_bytes());source.unlink()
   try:source.symlink_to(target);SYMLINK_TESTED=True;self.assertIsNone(m.failure_context(folder,job,'prepare',pin['sourceVersion'],pin))
   except OSError:pass
 def test_candidate_public_stderr_and_exit_unchanged_even_reporting_failure(self):
  class BadString(Exception):
   def __str__(self):raise RuntimeError('SYNTHETIC_SECRET')
  path=HERE.parent/'tools/lesson-upload/native-driver.py';tree=ast.parse(path.read_text(encoding='utf-8'));block=next(n for n in reversed(tree.body) if isinstance(n,ast.If));code=compile(ast.Module(body=[block],type_ignores=[]),str(path),'exec')
  for error in [ValueError('NATIVE_SCOPE_UNRESOLVED'),KeyError('SYNTHETIC_SECRET'),BadString()]:
   for reporting_fails in (False,True):
    namespace=runpy.run_path(str(path),run_name='candidate_local_only');expected=namespace['public_error'](error)+'\n';namespace['__name__']='__main__';namespace['main']=lambda _v,e=error:(_ for _ in ()).throw(e)
    if reporting_fails:namespace['write_failure_safe']=lambda *_:(_ for _ in ()).throw(OSError('SYNTHETIC_SECRET'))
    out,err=io.StringIO(),io.StringIO()
    with patch.object(sys,'stdin',io.StringIO('{}')),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err),self.assertRaises(SystemExit) as status:exec(code,namespace)
    self.assertEqual(status.exception.code,1);self.assertEqual(err.getvalue(),expected);self.assertEqual(out.getvalue(),'');self.assertNotIn('SYNTHETIC_SECRET',err.getvalue())

if __name__=='__main__':unittest.main(verbosity=2)
