// Port tiêm phụ thuộc: import không kết nối hoặc đọc biến môi trường.
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function createPublishPort(sql,storage){return {
 async rpc(action,payload){
  if(['sync_attendance','sync_due','support_report','scorebook','classes','opening_materials'].includes(action))return sql.begin(async tx=>{
   // RPC whitelisted, quyền transaction không lọt sang pipeline.
   await tx`SET LOCAL ROLE service_role`;
   let rows;
   if(action==='sync_attendance')rows=await tx`SELECT public.mtm_btvn_sync_attendance_roster(${sql.json(payload.p_payload)},${payload.p_apply}) AS result`;
   else if(action==='sync_due')rows=await tx`SELECT public.mtm_btvn_sync_due(${sql.json(payload.p_payload)},${payload.p_apply}) AS result`;
   else if(action==='support_report')rows=await tx`SELECT public.mtm_btvn_support_report(${payload.p_since}::timestamptz) AS result`;
   else if(action==='scorebook')rows=await tx`SELECT public.mtm_btvn_scorebook_real100(${payload.p_from}::date,false) AS result`;
   else if(action==='opening_materials')rows=await tx`SELECT public.mtm_btvn_opening_materials_real100(${payload.p_code}::text) AS result`;
   else rows=await tx`SELECT public.mtm_btvn_classes() AS result`;
   return rows[0].result;
  });
  if(!['lookup','publish','error','update_material'].includes(action))throw Error('Invalid publisher action');
  return sql.begin(async tx=>{
   await tx`SET LOCAL ROLE mtm_btvn_publisher`;
   // sql.json: postgres.js tự JSON hoá tham số jsonb; JSON.stringify trước sẽ thành chuỗi jsonb (lỗi "Payload invalid" trên cloud 15/10).
   const rows=await tx`SELECT public.mtm_btvn_pipeline(${action},${sql.json(payload)}) AS result`;
   return rows[0].result;
  });
 },
 async upload(path,bytes,type,hash){
  if(!/^btvn\/[a-z0-9-]{1,160}\/[a-f0-9]{64}\/[a-zA-Z0-9][a-zA-Z0-9_/-]*\.(png|pdf)$/.test(path)||path.includes('//')||!['application/pdf','image/png'].includes(type)||!path.endsWith(type==='image/png'?'.png':'.pdf')||bytes.length<8||bytes.length>15*1024*1024||await sha(bytes)!==hash)throw Error('Invalid publisher asset');
  const bucket=storage.from('mtm-btvn');
  const result=await bucket.upload(path,bytes,{contentType:type,upsert:false});
  if(!result.error)return;
  if(!(String(result.error.statusCode)==='409'||String(result.error.statusCode)==='400'&&/duplicate|already exists/i.test(result.error.error??result.error.message??'')))throw Error('Asset upload unavailable');
  const existing=await bucket.download(path);
  if(existing.error||!existing.data||await sha(new Uint8Array(await existing.data.arrayBuffer()))!==hash)throw Error('Asset collision');
 }
};}
