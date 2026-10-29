import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';

// 29/10: trang /quan-tri/truoc-ca: gom dòng theo ca/HS, luật làm lại đạt từ 7, không có cột điểm danh.
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports;}
const {groupTruocCa,studentStatus,diemText,vnToday,TruocCaTables}=load('src/native/homework/AdminTruocCa.tsx');
const row=(ca:string,gio:string,hocSinh:string,bai:string|null,diem:number|null,soLan:number,lopGoc=ca,nguon='Lớp gốc')=>({ca,gio,hocSinh,lopGoc,nguon,bai,diem,soLan});
const rows=[
 row('2K9 8+','17:30-19:30','An',"BTVN 22/10",8,2),
 row('2K9 8+','17:30-19:30','Bình',"BTVN 22/10",6.5,1),
 row('2K9 8+','17:30-19:30','Chi',"BTVN 22/10",null,0),
 row('2K9 8+','17:30-19:30','Dũng',"BTVN 22/10",9,1,'2K9 9+','Chuyển đến'),
 row('2K11 9+','19:30-21:30','Hà',null,null,0),
];
const sessions=groupTruocCa(rows);
assert.deepEqual(sessions.map((s:any)=>[s.ca,s.students.length,s.canLam]),[['2K9 8+',4,2],['2K11 9+',1,0]]);
assert.deepEqual(sessions[0].students.map((s:any)=>s.status),['Đạt','Dưới 7','Chưa làm','Đạt']);
assert.equal(studentStatus([]),'Chưa có bài');
assert.equal(studentStatus([{bai:'a',diem:9,soLan:1},{bai:'b',diem:null,soLan:0}]),'Chưa làm');
assert.equal(diemText({diem:6.5,soLan:1}),'6,5');assert.equal(diemText({diem:null,soLan:0}),'Chưa làm');
assert.equal(vnToday(new Date('2026-10-29T18:30:00Z')),'2026-10-30');
const html=renderToStaticMarkup(React.createElement(TruocCaTables,{sessions}));
for(const text of ['2K9 8+ · 17:30-19:30','2/4 em cần làm lại','Làm lại đạt từ 7','Chưa làm','6,5','Lớp gốc 2K9 9+ · Chuyển đến','Chưa có bài'])assert.ok(html.includes(text),text);
assert.ok(!/Điểm danh|Vắng|Có mặt/.test(html),'bảng đầu ca không có cột điểm danh');
assert.ok(renderToStaticMarkup(React.createElement(TruocCaTables,{sessions:[]})).includes('chưa có ca nào'));
// 29/10 anh Thành: có nút vào Quản trị ở chân trang và nút Báo điểm trước ca ở trang đăng nhập quản trị.
const {readFileSync}=require('node:fs');
assert.match(renderToStaticMarkup(React.createElement(load('src/components/Footer.tsx').Footer)),/href="\/quan-tri\/de-thi"[^>]*>Quản trị</);
assert.match(readFileSync(join(root,'src/native/admin/AdminExams.tsx'),'utf8'),/href="\/quan-tri\/truoc-ca">Báo điểm trước ca</);
console.log(JSON.stringify({suite:'TRUOC-CA',total:1,passed:1,failed:0}));
