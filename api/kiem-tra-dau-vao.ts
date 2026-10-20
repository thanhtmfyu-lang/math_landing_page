import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {dauVaoKey,handleDauVao,serverBanks} from '../server/dau-vao/handler';
import {saveHoSo,saveKetQua} from '../server/dau-vao/lead';
import {buoiCuaKhoi,loadLich} from '../server/dau-vao/lich-lop';
import {isDvTrack,vnDate,type Result} from '../server/dau-vao/engine';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
/** Kiểm tra đầu vào: GET ?lich=khối: thời khóa biểu các lớp của khối (tab Lich_lop). GET lấy đề hôm nay (không đáp án). POST {hoSo}: ghi phiếu học thử vào kho lead. POST bài làm: máy chủ chấm,
 * có phiếu (hoSoId + hoSoSig) thì gắn kết quả vào đúng lead. Cần MTM_DAU_VAO_KEY để giải mã ngân hàng server/dau-vao/ngan-hang.bin. */
export function createDauVaoApi(getEnv=()=>process.env as Record<string,string|undefined>,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Robots-Tag','noindex, nofollow');
 const env=getEnv();
 if(req.method==='POST'){const h=req.headers??{},origin=h.origin;if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không thể gửi bài từ trang này.'});}
 let body:any=req.body;
 if(req.method==='POST'){try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}}
 if(req.method==='GET'&&req.query?.lich!==undefined){const khoi=req.query.lich;if(!isDvTrack(khoi))return res.status(400).json({message:'Chọn khối.'});
  return res.status(200).json({buoi:buoiCuaKhoi(await loadLich(env,transport),khoi,vnDate(Date.now()))});}
 const key=dauVaoKey(env);
 if(req.method==='POST'&&body&&typeof body==='object'&&!Array.isArray(body)&&'hoSo' in body){
  if(Object.keys(body).length!==1)return res.status(400).json({message:'Yêu cầu không hợp lệ.'});
  const out=await saveHoSo(body.hoSo,key,vnDate(Date.now()),env,transport);return res.status(out.status).json(out.body);
 }
 let link:{id:unknown;sig:unknown;name:string;school:string}|null=null;
 if(req.method==='POST'&&body&&typeof body==='object'&&!Array.isArray(body)&&'hoSoId' in body){
  const {hoSoId,hoSoSig,hoTen,truong,...rest}=body;
  link={id:hoSoId,sig:hoSoSig,name:typeof hoTen==='string'?hoTen.slice(0,60):'',school:typeof truong==='string'?truong.slice(0,80):''};body=rest;
 }
 const out=handleDauVao({method:req.method,query:req.query,body},serverBanks(env));
 if(out.status===200&&link){const lead=await saveKetQua(link.id,link.sig,out.body as Result,link,key,env,transport);return res.status(200).json({...(out.body as object),lead});}
 return res.status(out.status).json(out.body);
};}
export default createDauVaoApi();
