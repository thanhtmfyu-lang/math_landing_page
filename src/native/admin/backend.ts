import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {buildExam,type AdminDraft,type PdfAsset} from './model';
import type {PracticeExam} from '../exams/data';
type Environment={VITE_MTM_SUPABASE_URL?:string;VITE_MTM_SUPABASE_PUBLISHABLE_KEY?:string};
// Refer only to the two public settings; do not expand all VITE environment values.
function publicEnvironment():Environment{return {VITE_MTM_SUPABASE_URL:import.meta.env.VITE_MTM_SUPABASE_URL,VITE_MTM_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_MTM_SUPABASE_PUBLISHABLE_KEY};}
export function safeConfig(env:Environment):{url:string;key:string}|null{
 const url=env.VITE_MTM_SUPABASE_URL,key=env.VITE_MTM_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return null;
 try{const u=new URL(url);if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)||u.username||u.password)throw Error();
 if(!key.startsWith('sb_publishable_')){const payload=JSON.parse(atob(key.split('.')[1]||''));if(payload.role!=='anon')throw Error();}return{url:u.origin,key};}catch{return null;}
}
let singleton:SupabaseClient|null|undefined;
export function backend(){if(singleton!==undefined)return singleton;const config=safeConfig(publicEnvironment());singleton=config?createClient(config.url,config.key,{auth:{storageKey:'mtm-exam-admin-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;return singleton;}
export type DraftRow={id:string;revision:number;payload:AdminDraft;updated_at:string};
export type PublishedRow={id:string;draft_id:string;exam:PracticeExam;question_path:string;solution_path:string|null;published_at:string;visible:boolean};
export function requireBackend(){const b=backend();if(!b)throw Error('Chưa cấu hình máy chủ quản trị.');return b;}
export async function requireAdmin(){const b=requireBackend(),{data:{user},error}=await b.auth.getUser();if(error||!user)throw Error('Cần đăng nhập quản trị.');const r=await b.from('mtm_exam_admins').select('user_id').eq('user_id',user.id).maybeSingle();if(r.error||!r.data)throw Error('Tài khoản chưa được cấp quyền đăng đề.');return user;}
// Bind each private request to its originating account. A later sign-in must not
// send an old editor's payload under the next account's session.
export async function adminRequest(expectedOwner?:string){
 const b=requireBackend(),{data:{session},error}=await b.auth.getSession();if(error||!session||expectedOwner&&session.user.id!==expectedOwner)throw Error('Phiên quản trị đã thay đổi. Đăng nhập lại đúng tài khoản.');
 const config=safeConfig(publicEnvironment())!;
 const client=createClient(config.url,config.key,{accessToken:async()=>session.access_token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:{user},error:userError}=await b.auth.getUser(session.access_token);if(userError||!user||user.id!==session.user.id)throw Error('Cần đăng nhập quản trị.');
 const allow=await client.from('mtm_exam_admins').select('user_id').eq('user_id',user.id).maybeSingle();if(allow.error||!allow.data)throw Error('Tài khoản chưa được cấp quyền đăng đề.');
 return {client,user};
}
// Tên đăng nhập ngắn (vd "quanly") được hiểu là email @minhthanhmath.vn.
export function loginEmail(name:string){const v=name.trim().toLowerCase();return v.includes('@')?v:`${v}@minhthanhmath.vn`;}
export async function signIn(name:string,password:string){const b=requireBackend();const {error}=await b.auth.signInWithPassword({email:loginEmail(name),password});if(error){
 if(error.code==='invalid_credentials')throw Error('Tên đăng nhập hoặc mật khẩu quản trị chưa đúng.');
 if(error.code==='email_not_confirmed')throw Error('Email quản trị chưa được xác nhận. Kiểm tra trạng thái tài khoản trước khi đăng nhập lại.');
 if(error.status===429)throw Error('Đăng nhập đang bị giới hạn do thử nhiều lần. Vui lòng thử lại sau.');
 if(error.name==='AuthRetryableFetchError')throw Error('Chưa kết nối được máy chủ đăng nhập. Kiểm tra kết nối mạng rồi thử lại.');
 throw Error('Đăng nhập chưa thành công. Kiểm tra tài khoản/mật khẩu hoặc thử lại sau.');
 }try{return await requireAdmin();}catch(e){await b.auth.signOut({scope:'local'});throw e;}}
export async function listDrafts(expectedOwner?:string){const {client}=await adminRequest(expectedOwner);const r=await client.from('mtm_exam_drafts').select('id,revision,payload,updated_at').order('updated_at',{ascending:false}).limit(100);if(r.error)throw Error('Chưa đọc được bản nháp trên máy chủ.');return r.data as DraftRow[];}
export async function saveDraft(d:AdminDraft,revision:number|null,expectedOwner?:string):Promise<DraftRow>{const {client}=await adminRequest(expectedOwner);const r=await client.rpc('mtm_save_exam_draft',{p_id:d.id,p_revision:revision,p_payload:d});if(r.error)throw Error(r.error.code==='40001'?'Bản nháp đã thay đổi ở phiên khác. Tải lại danh sách trước khi sửa tiếp.':'Chưa lưu được bản nháp. Nội dung đang nhập vẫn được giữ.');return r.data as DraftRow;}
export async function uploadPdf(draftId:string,kind:'questions'|'solutions',file:File,info:Omit<PdfAsset,'path'>,expectedOwner?:string){const {user,client:b}=await adminRequest(expectedOwner);const path=`${user.id}/${draftId}/${info.sha256}-${kind}.pdf`;const r=await b.storage.from('mtm-exams').upload(path,file,{contentType:'application/pdf',upsert:false});if(r.error){const {data,error}=await b.storage.from('mtm-exams').download(path);if(error||!data||data.size!==info.bytes||await sha256(await data.arrayBuffer())!==info.sha256)throw Error('Chưa tải được PDF. Bản đã chọn chưa bị xóa.');}return {...info,path};}
export async function sha256(bytes:ArrayBuffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function signedPdf(path:string,expectedOwner?:string){const client=expectedOwner?(await adminRequest(expectedOwner)).client:requireBackend();const r=await client.storage.from('mtm-exams').createSignedUrl(path,3600);if(r.error||!r.data)throw Error('Chưa mở được PDF.');return r.data.signedUrl;}
export async function publish(d:AdminDraft,revision:number,expectedOwner?:string){const {client}=await adminRequest(expectedOwner);const hash=await sha256(new TextEncoder().encode(JSON.stringify(d)).buffer as ArrayBuffer);const exam=buildExam(d,hash,path=>`${safeConfig(publicEnvironment())!.url}/storage/v1/object/mtm-exams/${path}`);const r=await client.rpc(d.layout?'mtm_publish_flexible_exam':'mtm_publish_exam',{p_id:d.id,p_revision:revision,p_exam:exam});if(r.error)throw Error(r.error.code==='40001'?'Bản nháp đã thay đổi. Lưu và xem thử lại trước khi đăng.':'Chưa đăng được đề. Bản nháp trên máy chủ vẫn được giữ.');return r.data as PublishedRow;}
export async function setVisibility(draftId:string,visible:boolean,expectedOwner?:string){const {client}=await adminRequest(expectedOwner);const r=await client.rpc('mtm_exam_visibility',{p_id:draftId,p_visible:visible});if(r.error)throw Error('Chưa đổi được trạng thái đề.');}
export async function publishedExams(){const r=await requireBackend().rpc('mtm_list_exams');if(r.error)throw Error('Chưa tải được các đề mới. Các đề hiện có vẫn làm được.');return r.data as PublishedRow[];}
export async function hydrate(row:PublishedRow){const url=await signedPdf(row.question_path);return {...row.exam,sourcePdf:{...row.exam.sourcePdf!,url}} as PracticeExam;}
