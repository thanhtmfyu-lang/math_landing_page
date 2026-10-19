import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {createNativeDocumentHttp} from '../server/btvn/documents/native-http.ts';
import type {NativeTransport} from '../server/btvn/documents/native-port.ts';

type Req={method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type Res={setHeader:(k:string,v:string)=>void;status:(n:number)=>{json:(v:unknown)=>void}};
const header=(req:Req,k:string)=>typeof req.headers[k]==='string'?req.headers[k]as string:'';
export function createDocumentsApi(getEnv=()=>process.env){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Vary','Cookie, Origin');
 const env=getEnv(),host=header(req,'host'),origin=header(req,'origin');
 if(env.MTM_BTVN_DOCUMENTS_ENABLED!=='1'||env.MTM_BTVN_ENABLED!=='1'||env.VERCEL!=='1'||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.MTM_BTVN_NETWORK_SECRET||env.MTM_BTVN_NETWORK_SECRET.length<32)return res.status(503).json({error_code:'INTEGRATION_NOT_READY'});
 if(!allowedBtvnOrigin(origin,env)||origin!==`https://${host}`)return res.status(403).json({error_code:'ORIGIN_REJECTED'});
 if(req.method!=='POST')return res.status(405).json({error_code:'POST_REQUIRED'});
 const address=header(req,'x-vercel-forwarded-for').split(',')[0].trim();if(!isIP(address))return res.status(503).json({error_code:'TRUSTED_PROXY_REQUIRED'});
 const networkKey=createHmac('sha256',env.MTM_BTVN_NETWORK_SECRET).update('mtm-btvn:'+address).digest('hex');
 const client=(signal?:AbortSignal)=>createClient(env.SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:signal??init?.signal})}});
 const transport:NativeTransport={
  rpc:async(name,args,signal)=>await client(signal).rpc(name,args),
  storage:{
   upload:async(path,bytes,type,signal)=>{const result=await client(signal).storage.from('mtm-btvn').upload(path,bytes,{contentType:type,upsert:false});return{error:result.error};},
   download:async(path,signal)=>{const result=await client(signal).storage.from('mtm-btvn').download(path);if(result.error||!result.data)throw Error('PRIVATE_DOWNLOAD_UNAVAILABLE');return new Uint8Array(await result.data.arrayBuffer());},
   sign:async(path,seconds,signal)=>{const result=await client(signal).storage.from('mtm-btvn').createSignedUrl(path,seconds);if(result.error||!result.data)throw Error('PRIVATE_SIGN_UNAVAILABLE');return result.data.signedUrl;},
   signUpload:async(path,signal)=>{const result=await client(signal).storage.from('mtm-btvn').createSignedUploadUrl(path,{upsert:false});if(result.error||!result.data)throw Error('PRIVATE_UPLOAD_SIGN_UNAVAILABLE');return result.data.signedUrl;},
  },
 };
 try{
  const handler=createNativeDocumentHttp({ready:async()=>{const r=await transport.rpc('mtm_btvn_document_runtime_ready',{});return !r.error&&(r.data as any)?.backendReady===true&&(r.data as any)?.frontendReady===true;},trustedOrigin:value=>allowedBtvnOrigin(value,env),transport:async()=>transport,rate:async db=>{const r=await db.rpc('mtm_btvn_document_rate',{p_network_key:networkKey});return !r.error&&r.data===true;}});
  const result=await handler(new Request(origin+'/api/btvn-documents',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',cookie:header(req,'cookie')},body:typeof req.body==='string'?req.body:JSON.stringify(req.body)}));
  return res.status(result.status).json(await result.json());
 }catch{return res.status(503).json({error_code:'DOCUMENT_UNAVAILABLE'});}
};}
export default createDocumentsApi();
