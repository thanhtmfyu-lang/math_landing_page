import type {Plugin} from 'vite';
/** Chạy /api/kiem-tra-dau-vao trên máy dev (vite serve). Ngân hàng đề mã hóa ở server/dau-vao (giải mã bằng MTM_DAU_VAO_KEY): chặn đọc trực tiếp qua URL.
 * Dev giả làm bản Preview để qua kiểm tra nguồn gửi; không có MTM_LEAD_ENABLED nên phiếu không ghi đi đâu. */
export function dauVaoDevPlugin():Plugin{
 return {name:'mtm-dau-vao-dev',apply:'serve',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   let path='';try{path=decodeURIComponent(req.url??'').replace(/\\/g,'/');}catch{return next();}
   if(/(?:^|\/)server\/dau-vao\/(?:bank|handler|tien-do|ngan-hang|lead)/i.test(path)){res.statusCode=404;res.end();return;}
   if(!path.startsWith('/api/kiem-tra-dau-vao'))return next();
   const {createDauVaoApi}=await server.ssrLoadModule('/api/kiem-tra-dau-vao.ts') as typeof import('../../api/kiem-tra-dau-vao');
   let raw='';for await(const chunk of req)raw+=chunk.toString();
   const url=new URL(req.url??'/','http://dev');
   const env={...process.env,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'mtm-dev.vercel.app'};
   let status=200;const headers:Record<string,string>={};
   await createDauVaoApi(()=>env)({method:req.method,query:Object.fromEntries(url.searchParams),body:raw||undefined,headers:{origin:'https://mtm-dev.vercel.app',host:'mtm-dev.vercel.app'}},
    {setHeader:(k,v)=>{headers[k]=v;},status:n=>{status=n;return {json:v=>{res.writeHead(status,headers);res.end(JSON.stringify(v));}};}});
  });
 }};
}
