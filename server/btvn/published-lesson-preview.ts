import {createClient} from '@supabase/supabase-js';
import {parsePublishedLessonPreviewRequest,readPublishedLessonPreview,
  type PublishedLessonPreviewRequest} from '../../src/native/lesson-upload/published-preview';
import {concealMonthlySolutions} from './monthly-policy';
import {hydratePrivateAssets,type PrivateAsset} from './private-assets';
import {batchSigner,READ_RPC_MS,withTimeout} from './supabase-transport';

type PreviewEnv={SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;MTM_HOMEWORK_PUBLISHABLE_KEY:string};
type PreviewPort={
  read:(request:PublishedLessonPreviewRequest,authorization:string)=>PromiseLike<{data:unknown;error:null|{code?:string}}>;
  sign:(path:string,seconds:number)=>Promise<string>;
};

const message=(status:number,text:string)=>({status,body:{message:text}});
const previewUnavailable=()=>message(503,'Chưa tải được bản đã đăng. Thử mở lại sau ít phút.');

export async function readStaffPublishedLesson(port:PreviewPort,body:unknown,authorization:string){
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)||authorization.length>4096)
    return message(401,'Đăng nhập lại bằng tài khoản nhân sự để xem bài.');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==5
    ||(body as Record<string,unknown>).action!=='lesson-published-preview')
    return message(400,'Yêu cầu xem bài không hợp lệ.');
  const request=parsePublishedLessonPreviewRequest(body);
  if(!request)return message(400,'Yêu cầu xem bài không hợp lệ.');
  try{
    const {data,error}=await port.read(request,authorization);
    if(error){
      if(error.code==='42501'||error.code==='PGRST301')return message(403,'Tài khoản chưa có quyền xem bài của lớp này.');
      if(error.code==='P0002')return message(404,'Bản bài này hiện không còn được giao cho lớp đã chọn.');
      return previewUnavailable();
    }
    const preview=readPublishedLessonPreview(data,request);
    if(!preview)return previewUnavailable();
    const assets=(data as {assets?:unknown}).assets;
    if(!Array.isArray(assets))return previewUnavailable();
    const prefix='btvn/'+preview.lessonCode+'/'+preview.sourceVersion+'/';
    const scopedAssets=assets.filter((asset:Partial<PrivateAsset>|null):asset is PrivateAsset=>
      !!asset&&typeof asset.path==='string'&&typeof asset.sha256==='string'
      &&typeof asset.storage_path==='string'&&asset.storage_path.startsWith(prefix));
    const exam=await hydratePrivateAssets(concealMonthlySolutions(preview.exam),scopedAssets,port.sign,{allowUnavailablePdfs:true});
    return {status:200,body:{...preview,exam}};
  }catch{
    return previewUnavailable();
  }
}

export function createProductionPublishedLessonPreview(env:PreviewEnv){
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  return (body:unknown,authorization:string)=>readStaffPublishedLesson({
    read:({uploadId,classId,paper,isTest},jwt)=>{
      const staff=createClient(env.SUPABASE_URL,env.MTM_HOMEWORK_PUBLISHABLE_KEY,{auth,global:{headers:{Authorization:jwt}}});
      return staff.rpc('mtm_lesson_published_preview',{
        p_upload_id:uploadId,p_class_id:classId,p_paper:paper,p_is_test:isTest,
      }).abortSignal(AbortSignal.timeout(READ_RPC_MS));
    },
    sign:batchSigner(paths=>{
      const storage=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth});
      return withTimeout(storage.storage.from('mtm-btvn').createSignedUrls(paths,600),READ_RPC_MS);
    }),
  },body,authorization);
}
