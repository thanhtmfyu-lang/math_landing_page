import type {Plugin} from 'vite';
/** Chạy /api/kiem-tra-dau-vao trên máy dev (vite serve). Ngân hàng đề mã hóa ở server/dau-vao (giải mã bằng MTM_DAU_VAO_KEY): chặn đọc trực tiếp qua URL. */
export function dauVaoDevPlugin():Plugin{
 return {name:'mtm-dau-vao-dev',apply:'serve',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   let path='';try{path=decodeURIComponent(req.url??'').replace(/\\/g,'/');}catch{return next();}
   if(/(?:^|\/)server\/dau-vao\/(?:bank|handler|tien-do|ngan-hang)/i.test(path)){res.statusCode=404;res.end();return;}
   if(!path.startsWith('/api/kiem-tra-dau-vao'))return next();
   const {handleDauVao,serverBanks}=await server.ssrLoadModule('/server/dau-vao/handler.ts') as typeof import('./handler');
   let raw='';for await(const chunk of req)raw+=chunk.toString();
   const url=new URL(req.url??'/','http://dev');
   const out=handleDauVao({method:req.method,query:Object.fromEntries(url.searchParams),body:raw||undefined},serverBanks(process.env));
   res.writeHead(out.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(out.body));
  });
 }};
}
