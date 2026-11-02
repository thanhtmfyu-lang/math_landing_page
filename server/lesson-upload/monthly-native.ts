import {createLessonUploadPipeline,createNativeInvoker} from './native-adapter';
import type {MonthlyPipeline} from './monthly-worker';
/** Same native budget, lock and private state. Provider-specific PC requests never fall back. */
export async function createMonthlyPipeline(db:any):Promise<MonthlyPipeline>{
 const monthlyDb={sourceOrigin:db.sourceOrigin,rpc(name:string,args:any){
  if(name==='mtm_lesson_upload_source'){
   const paper=args.kind.endsWith('2')?2:1,kind=args.kind.startsWith('answer')?'answer':'homework';
   return db.rpc(name,{...args,kind,paper,upload_kind:'monthly'});
  }return db.rpc(name,args);
 }};
 const native=await createLessonUploadPipeline({db:monthlyDb}),invoke=createNativeInvoker();
 return {extractor:native.extractor,read:native.read,build:native.build,
  review:(input,provider)=>invoke({stage:'review',...input,provider}),
  sympy:input=>invoke({stage:'monthly_sympy',...input})};
}
