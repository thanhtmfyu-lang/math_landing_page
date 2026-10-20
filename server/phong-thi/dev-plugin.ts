import type {Plugin} from 'vite';
/** Chạy /api/phong-thi trên máy dev (vite serve). Kho đề mã hóa ở server/phong-thi (giải mã bằng MTM_PHONG_THI_KEY): chặn đọc trực tiếp qua URL.
 * Dev giả làm bản Preview để qua kiểm tra nguồn gửi; không có MTM_PHONG_THI_DB nên không ghi CSDL. ?dev-hs=1 giả làm học sinh MTM để xem toàn bộ đề. */
export function phongThiDevPlugin():Plugin{
 return {name:'mtm-phong-thi-dev',apply:'serve',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   let path='';try{path=decodeURIComponent(req.url??'').replace(/\\/g,'/');}catch{return next();}
   if(/(?:^|\/)server\/phong-thi\/(?:kho-de|handler)/i.test(path)){res.statusCode=404;res.end();return;}
   if(!path.startsWith('/api/phong-thi'))return next();
   const {createPhongThiApi}=await server.ssrLoadModule('/api/phong-thi.ts') as typeof import('../../api/phong-thi');
   let raw='';for await(const chunk of req)raw+=chunk.toString();
   const url=new URL(req.url??'/','http://dev');
   const env={...process.env,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'mtm-dev.vercel.app',MTM_PHONG_THI_DB:''};
   const hs=(req.headers.referer??'').includes('dev-hs=1');
   // Giả phiên học sinh: RPC xác nhận phiên trả OK.
   const transport:typeof fetch=async()=>new Response('{}',{status:hs?200:401});
   let status=200;const headers:Record<string,string|string[]>={};
   await createPhongThiApi(()=>({...env,SUPABASE_URL:'https://dev.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'dev'}),transport)({method:req.method,query:Object.fromEntries(url.searchParams),body:raw||undefined,
    headers:{origin:'https://mtm-dev.vercel.app',host:'mtm-dev.vercel.app',cookie:hs?'mtm_btvn_demo='+'a'.repeat(64):''}},
    {setHeader:(k,v)=>{headers[k]=v;},status:n=>{status=n;return {json:v=>{res.writeHead(status,headers);res.end(JSON.stringify(v));}};}});
  });
 }};
}
