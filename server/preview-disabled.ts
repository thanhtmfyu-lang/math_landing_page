/** A development-only URL must never fall through to the production SPA. */
export default function handler(_req:unknown,res:{setHeader:(key:string,value:string)=>void;status:(code:number)=>{json:(body:unknown)=>void}}){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  return res.status(404).json({message:'Không tìm thấy trang.'});
}
