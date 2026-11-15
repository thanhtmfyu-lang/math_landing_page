const WRITE_ACTIONS=new Set(['start','save','submit']);
export const HOMEWORK_REQUEST_TIMEOUT_MS=40000;
export const HOMEWORK_SESSION_UNCERTAIN='mtm:homework-session-uncertain';
function uncertainSession(action:string){
  // HttpOnly Set-Cookie is applied by the browser, before JavaScript reads a
  // reply. A late auth response must never leave another identity's UI open.
  if((action==='login'||action==='logout')&&typeof window!=='undefined')window.dispatchEvent(new Event(HOMEWORK_SESSION_UNCERTAIN));
}

export class HomeworkRequestTimeout extends Error {
  constructor(public readonly action:string){
    super(action==='classes'?'Chưa tải được danh sách lớp vì kết nối chậm. Em bấm Thử tải lại.':WRITE_ACTIONS.has(action)?'Chưa nhận được xác nhận từ máy chủ. Bài đang giữ chưa bị xóa; em thử gửi lại cùng lượt để kiểm tra.':'Kết nối đang chậm nên chưa tải được bài. Em thử tải lại; không cần thoát tài khoản.');
    this.name='HomeworkRequestTimeout';
  }
}

/** Deadline includes headers AND body, even on WebViews that ignore abort. */
export function withHomeworkDeadline<T>(action:string,request:(signal:AbortSignal)=>Promise<T>,timeoutMs=HOMEWORK_REQUEST_TIMEOUT_MS):Promise<T>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new RangeError('Invalid homework request timeout');
  const controller=new AbortController();
  return new Promise<T>((resolve,reject)=>{
    let settled=false;
    const finish=(run:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);run();};
    const timer=setTimeout(()=>{finish(()=>reject(new HomeworkRequestTimeout(action)));uncertainSession(action);controller.abort();},timeoutMs);
    try{Promise.resolve(request(controller.signal)).then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));}
    catch(error){finish(()=>reject(error));}
  });
}

/** Prevent late replies from changing UI/session state after a deadline. */
export function assertHomeworkRequestActive(signal:AbortSignal,action:string){
  if(signal.aborted)throw new HomeworkRequestTimeout(action);
}

export function assertHomeworkResponseHeaders(signal:AbortSignal,action:string){
  if(signal.aborted)uncertainSession(action);
  assertHomeworkRequestActive(signal,action);
}
