import {boardKey,openMedia} from '../server/bang-tin/local';
// Phát ảnh/video Bảng tin trung tâm theo link ký (do /api/bang-tin cấp sau khi kiểm phiên BTVN). Hỗ trợ Range cho video trên iPhone.
type Req={method?:string;query?:Record<string,string|string[]|undefined>;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{end:(body?:Buffer|string)=>void}};
export function createBoardMediaApi(getEnv=()=>process.env){return (req:Req,res:Res)=>{
 res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const key=boardKey(getEnv()),q=req.query??{};
 let media:ReturnType<typeof openMedia>=null;
 try{media=key?openMedia(key,q.f,q.e,q.s):null;}catch{media=null;}
 if(!media){res.setHeader('Cache-Control','no-store');return res.status(404).end();}
 const {body,type}=media,size=body.length;
 res.setHeader('Content-Type',type);res.setHeader('Cache-Control','private, max-age=3600');res.setHeader('Accept-Ranges','bytes');
 const range=typeof req.headers?.range==='string'?/^bytes=(\d*)-(\d*)$/.exec(req.headers.range):null;
 if(range&&(range[1]||range[2])){
  let start=range[1]?Number(range[1]):size-Number(range[2]),end=range[1]&&range[2]?Number(range[2]):size-1;
  if(!range[1])end=size-1;
  if(start<0)start=0;
  if(start>=size||end<start){res.setHeader('Content-Range',`bytes */${size}`);return res.status(416).end();}
  end=Math.min(end,size-1);
  res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);res.setHeader('Content-Length',String(end-start+1));
  return res.status(206).end(req.method==='HEAD'?undefined:body.subarray(start,end+1));
 }
 res.setHeader('Content-Length',String(size));
 return res.status(200).end(req.method==='HEAD'?undefined:body);
};}
export default createBoardMediaApi();
