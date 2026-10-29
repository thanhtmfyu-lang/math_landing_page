import {ParentError,PH_SESSION,parentChildren,parentClasses,parentCookie,parentLink,parentLogin,parentReport,parentSession,type Rpc} from './service';
import {productionRpc} from '../btvn/test-scope';

/** Nhánh {ph:...} của /api/btvn (không thêm hàm Vercel). Trình duyệt chỉ giữ cookie HttpOnly; mã con chỉ dùng để chọn,
 * quyền xem luôn kiểm lại trong Postgres theo phiên phụ huynh. */
export type ParentResult={status:number;body:unknown;headers:Record<string,string>};
export class RpcError extends Error{constructor(public code:string,message:string){super(message);}}
export function supabaseRpc(db:{rpc:(name:string,args:Record<string,unknown>)=>any},ms=25000):Rpc{
 return async(name,args)=>{const r=await db.rpc(name==='mtm_btvn_read'?'mtm_btvn_read_real100':productionRpc(name),args).abortSignal(AbortSignal.timeout(ms));if(r.error)throw new RpcError(String(r.error.code??''),String(r.error.message??'rpc'));return r.data;};
}
const ok=(body:unknown,headers:Record<string,string>={}):ParentResult=>({status:200,body,headers});
export async function handleParent(rpc:Rpc,body:Record<string,unknown>,cookie:string,net:string,secure=true):Promise<ParentResult>{
 const action=body.ph,session=parentSession(cookie);
 const signed=(token:string)=>({'Set-Cookie':parentCookie(token,secure)});
 try{
  if(action==='classes')return ok({classes:await parentClasses(rpc)});
  if(action==='link'||action==='login'){
   const token=action==='link'?await parentLink(rpc,body,net):await parentLogin(rpc,body,net);
   return ok(await parentChildren(rpc,token),signed(token));
  }
  if(action==='logout'){if(/^[0-9a-f]{64}$/.test(session))await rpc('mtm_ph_logout',{p_session:session}).catch(()=>undefined);return ok({ok:true},signed(''));}
  if(!/^[0-9a-f]{64}$/.test(session))throw new ParentError(401,PH_SESSION);
  if(action==='children')return ok(await parentChildren(rpc,session));
  if(action==='report')return ok(await parentReport(rpc,session,body.childId));
  if(action==='zalo'){const r:any=await rpc('mtm_ph_zalo_code',{p_session:session});return ok({code:String(r.code),expiresAt:Number(r.expiresAt)});}
  return {status:400,body:{message:'Yêu cầu chưa hợp lệ.'},headers:{}};
 }catch(error){
  if(error instanceof ParentError){
   if(error.status===428)return {status:428,body:{pin:error.message==='PIN_SETUP'?'setup':'required'},headers:{}};
   return {status:error.status,body:{message:error.message},headers:error.status===401&&error.message===PH_SESSION?signed(''):{}};
  }
  if(error instanceof RpcError&&error.code==='42501')return {status:401,body:{message:PH_SESSION},headers:signed('')};
  throw error;
 }
}
