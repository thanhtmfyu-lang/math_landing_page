import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';

// 29/10: đề BTVN 07E (2K9 9+, 8+) dạng chữ, không có ảnh cắt câu → khung đọc đề BTVN chỉ vẽ sourceContent nên 13 câu trống đề,
// câu trắc nghiệm còn mất luôn phương án để chọn (phòng làm bài giao phương án cho khung đọc đề khi câu không có ảnh cắt).
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports;}
const {HomeworkReader}=load('src/native/homework/HomeworkSession.tsx');
const exam={id:'btvn-fixture-07e',title:'Đề kiểm thử',durationMinutes:120,questions:[
 {id:'q1',kind:'mc',sourceRef:'Câu 1',prompt:'Mực nước dâng với tốc độ $2$ cm/phút. Sau bao lâu đầy bể?',choices:['10 phút','12 phút','15 phút','20 phút'],maxMillipoints:250},
 {id:'q2',kind:'tf',sourceRef:'Câu 2',text:'Cho hàm số thể tích nước theo thời gian.',statements:['Ý một đúng','Ý hai sai','Ý ba đúng','Ý bốn sai'],maxMillipoints:1000},
 {id:'q3',kind:'short',sourceRef:'Câu 3',prompt:'Tính thời gian bơm đầy bể (phút).',maxMillipoints:500}]};
const html=renderToStaticMarkup(React.createElement(HomeworkReader,{exam}));
for(const text of ['Sau bao lâu đầy bể','10 phút','20 phút','thể tích nước theo thời gian','Ý bốn sai','Tính thời gian bơm đầy bể'])
 assert.ok(html.includes(text),'khung đọc đề BTVN thiếu: '+text);
assert.equal((html.match(/class="btvn-question"/g)||[]).length,3);
// Đề có ảnh cắt câu giữ nguyên đường cũ (không chèn thêm chữ/phương án trùng).
const src={...exam.questions[0],choices:['A','B','C','D'],prompt:undefined,sourceContent:{questions:[]}};
const html2=renderToStaticMarkup(React.createElement(HomeworkReader,{exam:{...exam,questions:[src]}}));
assert.ok(!html2.includes('cp-choices'));
console.log('BTVN đề dạng chữ: khung đọc đề hiện đủ đề, phương án, các ý Đúng/Sai.');
