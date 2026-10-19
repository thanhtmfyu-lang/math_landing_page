import {r106PreviewApi} from './preview-r106';
import {expireLegacyHomeworkCookie} from './http';
import type {Plugin} from 'vite';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {MemoryHomeworkRepository,scoresCsv} from './repository';
import {demoStudents} from './demo-students';
import {HomeworkService} from './service';
import {handleHomework} from './http';
import {demoLessons} from './demo-lessons';
import {boardKey,localBoardPosts} from '../bang-tin/local';
import {createBoardMediaApi} from '../../api/bang-tin-anh';
import type {PracticeExam} from '../../src/native/exams/data';
export function btvnDevPlugin():Plugin {
  return {name:'mtm-btvn-demo',apply:'serve',configureServer(server){
    // Vite dev có thể đọc source file: chặn module riêng qua mọi URL, kể cả /@fs.
    server.middlewares.use((req,res,next)=>{
      let path='';try{path=decodeURIComponent(req.url??'').replace(/\\/g,'/').replace(/\/{2,}/g,'/');}catch{res.statusCode=400;res.end();return;}
      if(/(?:^|\/)server\/btvn(?:\/|$)/i.test(path)||/^\/(?:build|dist|scripts|tests)(?:\/|$)/i.test(path)||/btvn-web-diem-danh\/phieu-a/i.test(path)||path.startsWith('/api/')&&!(process.env.MTM_BTVN_DEMO==='1'&&process.env.MTM_R106_PREVIEW==='1'&&/^\/api\/xep-hang(?:-cua-em)?(?:\?|$)/.test(path))&&!/^\/api\/btvn(?:\?|$|\/)/.test(path)&&!(process.env.MTM_BTVN_DEMO==='1'&&/^\/api\/bang-tin(?:-anh)?(?:\?|$)/.test(path))){
        res.statusCode=404;res.setHeader('Cache-Control','no-store');res.end();return;
      }next();
    });
    // Chỉ bật khi người nghiệm thu chủ động chạy MTM_BTVN_DEMO=1. Không mở dịch vụ ngoài.
    if(process.env.MTM_BTVN_DEMO!=='1')return;
    const enhanced=process.env.MTM_R106_PREVIEW==='1';
    const students=enhanced?demoStudents.map(s=>({...s,className:'2K9 9+'})):demoStudents;
    const materials=enhanced?[...demoLessons.map(l=>({...l,classNames:['2K9 9+']})),{...demoLessons[0],lessonCode:'buoi-chua-mo',title:'Buổi học sắp tới',date:'2099-10-20',classNames:['2K9 9+'],opensAt:Date.parse('2099-10-20T21:00:00+07:00')}]:demoLessons;
    const exam=JSON.parse(readFileSync(resolve('server/btvn/demo-exam.json'),'utf8')) as PracticeExam;
    const target=resolve(process.env.MTM_BTVN_CSV??'T:/Claude/SanPham/btvn-web-diem-danh/phieu-a/ket-qua-gia-dot-2-http.csv');
    mkdirSync(dirname(target),{recursive:true});
    if(existsSync(target))copyFileSync(target,target+'.before-'+Date.now());
    const repo=new MemoryHomeworkRepository(students,rows=>{const temporary=target+'.tmp';writeFileSync(temporary,scoresCsv(rows,'buoi-mau-01'),'utf8');renameSync(temporary,target);});
    const lessonExams=Object.fromEntries(materials.filter(l=>l.lessonCode!=='buoi-mau-01').map(l=>[l.lessonCode,{...exam,id:exam.id+'-'+l.lessonCode}]));
    const service=new HomeworkService(repo,exam,Date.parse('2026-10-16T18:30:00+07:00'),undefined,undefined,Date.now,materials,lessonExams);
    if(enhanced)server.middlewares.use(r106PreviewApi(service,target));
    // Bảng tin bản thử: chưa nối máy chủ thì chỉ hiện bài cố định trong mã.
    server.middlewares.use('/api/bang-tin-anh',(req,res)=>{const api=createBoardMediaApi();api({method:req.method,headers:req.headers as Record<string,string>,query:Object.fromEntries(new URLSearchParams((req.url??'').split('?')[1]??''))},{setHeader:(k,v)=>res.setHeader(k,v),status:n=>{res.statusCode=n;return {end:b=>res.end(b)};}});});
    server.middlewares.use('/api/bang-tin',(_req,res)=>{const key=boardKey(process.env);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({enabled:!!key,posts:key?localBoardPosts(key):[]}));});
    server.middlewares.use('/api/btvn',async(req,res)=>{
      const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
      if(req.url&&req.url!=='/'&&req.url!==''){res.writeHead(404,headers);res.end(JSON.stringify({message:'Không tìm thấy bài.'}));return;}
      let raw='';
      try{
        for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>65536){res.writeHead(413,headers);res.end(JSON.stringify({message:'Yêu cầu quá lớn.'}));return;}}
        const result=handleHomework(service,{method:req.method??'',body:JSON.parse(raw||'null'),cookie:req.headers.cookie,ip:req.socket.remoteAddress??'local',origin:req.headers.origin,host:req.headers.host??'localhost'});
        res.writeHead(result.status,{...result.headers,...(result.headers['Set-Cookie']?{'Set-Cookie':[result.headers['Set-Cookie'],expireLegacyHomeworkCookie()]}:{})});res.end(JSON.stringify(result.body));
      }catch{res.writeHead(400,headers);res.end(JSON.stringify({message:'Yêu cầu không hợp lệ.'}));}
    });
  }};
}
