import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {handleDauVao,serverBanks} from '../server/dau-vao/handler';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
/** Kiểm tra đầu vào: GET lấy đề hôm nay (không đáp án), POST nộp bài để máy chủ chấm. Không lưu dữ liệu học sinh.
 * Cần MTM_DAU_VAO_KEY trên Vercel để giải mã ngân hàng server/dau-vao/ngan-hang.bin. */
export default async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method==='POST'){const h=req.headers??{},origin=h.origin;if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,process.env))return res.status(403).json({message:'Không thể nộp bài từ trang này.'});}
 const out=handleDauVao(req,serverBanks());
 return res.status(out.status).json(out.body);
}
