import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.env.MTM_ROOT!;
const css=readFileSync(join(root,'src/native/exams/exam-watermark.css'),'utf8');
assert.match(css,/\.hw-pdf-scroll > div/);
assert.match(css,/\.ep-question-pdf/);
assert.match(css,/pointer-events:\s*none/);
assert.match(css,/print-color-adjust:\s*exact/);
const code=readFileSync(join(root,'scripts/prepare-public-watermarks.py'),'utf8');
assert.match(code,/mtm_existing_watermark/);
assert.match(code,/sourceFilesUnchanged/);
const run=spawnSync(process.platform==='win32'?'python':'python3',['-c',String.raw`
import importlib.util, pathlib, tempfile
spec=importlib.util.spec_from_file_location('plan', 'scripts/prepare-public-watermarks.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(dir='.qa-temp') as temp:
    base=pathlib.Path(temp)
    root=base/'repo';(root/'public').mkdir(parents=True)
    source=root/'public'/'sample.pdf';source.write_bytes(b'%PDF-fixture-only')
    try:
        m.prepare(root, root/'public'/'out')
        raise AssertionError('unsafe output accepted')
    except ValueError: pass
    out=base/'out'
    report=m.prepare(root,out)
    assert report['status']=='plan-only' and not report['pdfs'][0]['staged']
    assert list(out.glob('*.pdf'))==[]
    calls=[]
    def stamp(src,target):
        calls.append(src);target.write_bytes(b'%PDF-staged-fixture')
    staged=m.prepare(root,out,True,stamp)
    assert len(calls)==1 and staged['pdfs'][0]['staged']
    assert source.read_bytes()==b'%PDF-fixture-only'
    assert pathlib.Path(out/staged['pdfs'][0]['stagedFile']).is_file()
`],{cwd:root,encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
console.log('Watermark plan creates no PDFs; staging preserves source and seals new bytes.');
