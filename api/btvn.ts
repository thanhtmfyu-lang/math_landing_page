import {expireLegacyHomeworkCookie} from '../server/btvn/http';
import {checkVideoEmbed} from '../server/btvn/video-embed';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
// Nạp tĩnh: Vercel chạy ESM, import() động không đuôi tệp không được truy vết (lỗi Cannot find module 15/10).
import {createSupabaseRepository} from '../server/btvn/supabase-transport';
import {createClient} from '@supabase/supabase-js';
import {handleParent,supabaseRpc} from '../server/phu-huynh/http';
import type {Rpc} from '../server/phu-huynh/service';
import {loadSchedule} from '../server/schedule/lich-lop';
import {buildClassOverview} from '../server/btvn/class-overview';
import {createProductionEssayHandler} from '../server/btvn/tu-luan';
import {createProductionTestCleanupHandler} from '../server/btvn/test-cleanup';
type Req={method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string|string[])=>void;status:(n:number)=>{json:(value:unknown)=>void}};
const header=(req:Req,key:string)=>typeof req.headers[key]==='string'?req.headers[key] as string:'';
/** Chỉ mount production sau Claude nghiệm thu. Không đọc env/kết nối khi import. */
export function createBtvnApi(getEnv=()=>process.env,loadRepository:()=>Promise<typeof createSupabaseRepository>=async()=>createSupabaseRepository,options:{checkVideoEmbed?:typeof checkVideoEmbed;clock?:()=>number;parentRpc?:(env:{SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string})=>Rpc;cleanupClient?:typeof createClient}={}){return async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
 const env=getEnv();
 if(env.MTM_BTVN_ENABLED!=='1'||env.VERCEL!=='1'||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.MTM_HOMEWORK_PUBLISHABLE_KEY||!env.MTM_BTVN_NETWORK_SECRET||env.MTM_BTVN_NETWORK_SECRET.length<32)return res.status(503).json({message:'BTVN chưa mở trên máy chủ. Vui lòng chờ MTM xác nhận.'});
 try{
  const host=header(req,'host'),origin=header(req,'origin');
  if(!allowedBtvnOrigin(origin,env)||origin!==`https://${host}`)return res.status(403).json({message:'Không thể vào bài.'});
  if(req.method!=='POST')return res.status(405).json({message:'Chỉ nhận POST.'});
  const address=header(req,'x-vercel-forwarded-for').split(',')[0].trim(),networkSecret=env.MTM_BTVN_NETWORK_SECRET;
  if(!isIP(address)||!networkSecret)throw Error('Trusted proxy missing');
  const key=createHmac('sha256',networkSecret).update('mtm-btvn:'+address).digest('hex');
  if((req.body as {action?:unknown}|null)?.action==='test-cleanup'){
   const result=await createProductionTestCleanupHandler({SUPABASE_URL:env.SUPABASE_URL!,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY!,MTM_HOMEWORK_PUBLISHABLE_KEY:env.MTM_HOMEWORK_PUBLISHABLE_KEY!},options.cleanupClient)(req.body,header(req,'authorization'));
   return res.status(result.status).json(result.body);
  }
  const parent=(req.body as {ph?:unknown}|null)?.ph;
  if(typeof parent==='string'){
   // Góc phụ huynh (20/10): cùng hàm, cùng kiểm origin + HMAC mạng; quyền PH→con kiểm trong Postgres.
   const supa={SUPABASE_URL:env.SUPABASE_URL!,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY!};
   const rpc=options.parentRpc?options.parentRpc(supa):supabaseRpc(createClient(supa.SUPABASE_URL,supa.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
   const result=await handleParent(rpc,req.body as Record<string,unknown>,header(req,'cookie'),key,true);
   for(const [name,value] of Object.entries(result.headers))res.setHeader(name,value);
   return res.status(result.status).json(result.body);
  }
  const essayBody=req.body as Record<string,unknown>|null;
  if(typeof essayBody?.action==='string'&&essayBody.action.startsWith('essay-')){
   const result=await createProductionEssayHandler({SUPABASE_URL:env.SUPABASE_URL!,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY!})(essayBody,header(req,'cookie'));
   return res.status(result.status).json(result.body);
  }
  const factory=await loadRepository();
  const repo=factory({SUPABASE_URL:env.SUPABASE_URL!,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY!,MTM_HOMEWORK_PUBLISHABLE_KEY:env.MTM_HOMEWORK_PUBLISHABLE_KEY!,VERCEL:env.VERCEL,VERCEL_ENV:env.VERCEL_ENV,VERCEL_URL:env.VERCEL_URL},origin,key);
  const result=await createDurableHomeworkHandler(repo)({method:req.method??'',body:req.body,cookie:header(req,'cookie'),origin,host,secure:true});
  const body=result.body as any,action=(req.body as {action?:unknown}|null)?.action;
  if(result.status===200&&typeof body.className==='string'&&Array.isArray(body.lessons)&&['login','state','select','submit'].includes(String(action))){
   try{body.classOverview=buildClassOverview(body,await loadSchedule(env),(options.clock??Date.now)());}
   catch{/* Existing homework stays usable when optional class overview fails. */}
  }
  if(result.status===200&&Array.isArray(body.lessons)){
   // Chỉ danh sách buổi mới đợi metadata. Mở lượt/gia hạn ảnh và ACK bài
   // không phụ thuộc YouTube, không tạo request nền sau khi đã trả JSON.
   const listAction=['login','state','select'].includes(String(action)),active=body.draft?.submittedAt===null;
   await Promise.all(body.lessons.map(async(card:any)=>{
    card.videoEmbeddable=null;
    if(!listAction||active||!card.videoId)return;
    try{card.videoEmbeddable=await (options.checkVideoEmbed??checkVideoEmbed)(card.videoId);}catch{ /* Giữ link YouTube dự phòng khi metadata chưa xác minh. */ }
   }));
  }
  if(result.status===200&&typeof body.serverNow==='number')body.serverNow=(options.clock??Date.now)();
  for(const [key,value] of Object.entries(result.headers))res.setHeader(key,key==='Set-Cookie'?[value,expireLegacyHomeworkCookie(true)]:value);
  return res.status(result.status).json(result.body);
 }catch(error){
  // Chỉ tên lỗi và thông điệp ngắn để vận hành đọc nhật ký Vercel; không ghi body, cookie, khoá.
  console.error('[btvn-api]',error instanceof Error?error.name+': '+error.message.slice(0,200):'unknown');
  return res.status(503).json({message:'Chưa lưu được. Giữ trang mở và thử lại.'});}
};}
export default createBtvnApi();
