import type {Draft} from '../exams/store';
import type {HomeworkState} from './btvn-contract';
import {acknowledgedHomeworkSubmission} from './result-summary';

export type RemoteSaveStatus={pending:boolean;saving:boolean;failed:boolean;message:string;closed?:boolean};
export const REMOTE_SAVE_INITIAL:RemoteSaveStatus={pending:false,saving:false,failed:false,message:''};
export const REMOTE_LEAVE_MESSAGE='Có đáp án chưa được máy chủ MTM xác nhận. Rời trang có thể mất phần đang giữ. Em muốn rời trang?';

/** Chỉ ACK đúng bản đã gửi và được máy chủ lưu; RAM mới hơn vẫn phải gửi tiếp. */
export function createHomeworkSaver(options:{
  send:(draft:Draft)=>Promise<HomeworkState>;
  onSaved:(state:HomeworkState)=>void;
  onAcknowledged?:(state:HomeworkState)=>void;
  onStatus:(status:RemoteSaveStatus)=>void;
  delay?:number;
}){
  let latest:{seq:number;draft:Draft}|null=null,seq=0,ack=0,discarded=0,terminal=false,attached=true,closedState:HomeworkState|null=null;
  let timer:ReturnType<typeof setTimeout>|undefined,queue=Promise.resolve();
  const enqueued=new Set<number>();
  const publish=(saving:boolean,failed:boolean,message:string)=>{
    if(attached)options.onStatus({pending:seq>Math.max(ack,discarded),saving,failed,message,closed:!!closedState});
  };
  const clearTimer=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const sendLatest=()=>{
    clearTimer();const item=latest;
    if(!item||terminal||closedState||item.seq<=ack||enqueued.has(item.seq))return;
    enqueued.add(item.seq);
    publish(true,false,item.draft.submittedAt===null?'Đang lưu bài trên máy chủ MTM…':'Đang gửi bài đến máy chủ MTM…');
    queue=queue.then(async()=>{
      try{
        if(closedState||terminal)return;
        const next=await options.send(item.draft);
        // Đã bỏ quyền: phản hồi đang bay không còn được ghi ACK hoặc bản đã chấm.
        // Rời trang bình thường vẫn theo dõi ACK, nhưng attached=false chặn callback UI.
        if(terminal)return;
        if(next.draft?.attemptId!==item.draft.attemptId)throw new Error('Máy chủ chưa xác nhận đúng lượt làm bài. Giữ trang mở và gửi lại.');
        if(['examId','examVersionHash','rubricVersion'].some(key=>{const field=key as 'examId'|'examVersionHash'|'rubricVersion';return typeof item.draft[field]!=='string'||!item.draft[field].trim()||next.draft![field]!==item.draft[field];}))throw new Error('Máy chủ chưa xác nhận đúng bản đề của lượt này. Giữ trang mở và gửi lại.');
        if(item.draft.answerKeyVersion!==next.draft.answerKeyVersion)throw new Error('Máy chủ chưa xác nhận đúng phiên bản khóa của lượt này. Giữ trang mở và gửi lại.');
        if(item.draft.submittedAt!==null&&next.draft.submittedAt===null)throw new Error('Máy chủ chưa xác nhận nộp bài. Giữ trang mở và gửi lại.');
        if(next.draft.submittedAt!==null&&!acknowledgedHomeworkSubmission(next))throw new Error('Chưa có biên nhận chấm bài đúng lượt. Giữ trang mở và gửi lại.');
        const received=next.draft.answers, sent=item.draft.answers;
        if(!received||typeof received!=='object'||Array.isArray(received))throw new Error('Máy chủ chưa trả đúng bản đáp án. Giữ trang mở và gửi lại.');
        if(Object.keys(received).length!==Object.keys(sent).length||Object.keys(sent).some(key=>!Object.hasOwn(received,key)||JSON.stringify(sent[key])!==JSON.stringify(received[key]))){
          if(next.draft.submittedAt!==null)closedState=next;
          throw new Error(next.draft.submittedAt!==null?'Hết giờ. Máy chủ chấm bản đã lưu. Câu sửa sau đó không tính; bản đang giữ chưa được nhận.':'Máy chủ chưa nhận đúng bản đáp án đang gửi. Giữ trang mở và gửi lại.');
        }
        if(!Number.isSafeInteger(next.draft.revision)||next.draft.revision<0)throw new Error('Máy chủ chưa xác nhận phiên bản bài đang lưu. Giữ trang mở và thử lại.');
        ack=Math.max(ack,item.seq);
        // Update the canonical base even when a newer RAM edit is queued.
        if(attached)options.onAcknowledged?.(next);
        if(next.draft.submittedAt!==null&&item.seq===seq){terminal=true;clearTimer();}
        if(item.seq===seq){
          publish(false,false,terminal?'Máy chủ MTM đã nhận bài.':'Đã lưu bài trên máy chủ MTM.');
          if(attached)options.onSaved(next);
        }
      }catch(error){
        if(item.seq===seq||closedState)publish(false,true,error instanceof Error?error.message:'Chưa gửi được. Giữ trang mở và thử lại.');
      }finally{
        enqueued.delete(item.seq);
        if(item.seq<seq)sendLatest();
      }
    });
  };
  return {
    update(draft:Draft){
      if(terminal||closedState)return;
      latest={seq:++seq,draft};clearTimer();
      publish(true,false,'Đang chờ máy chủ MTM lưu đáp án…');
      if(draft.submittedAt!==null)sendLatest();else timer=setTimeout(sendLatest,options.delay??500);
    },
    retry:sendLatest,
    pending:()=>seq>Math.max(ack,discarded),
    closed:()=>!!closedState,
    acceptClosed(){
      if(!closedState)return;
      // Người học chọn bỏ phần chưa nhận, không gán ACK cho bản chưa được lưu.
      discarded=seq;terminal=true;clearTimer();publish(false,false,'Đang xem bản máy chủ đã chấm. Phần sửa chưa được nhận không tính điểm.');
      if(attached)options.onSaved(closedState);
    },
    // Rời trang đã được xác nhận: cố gửi bản mới nhất, không cập nhật component đã tháo.
    dispose(options:{flushPending?:boolean}={}){attached=false;if(options.flushPending===false){terminal=true;clearTimer();latest=null;discarded=seq;}else if(timer!==undefined)sendLatest();},
    settled:()=>queue,
    async flush(){
      sendLatest();
      // Một ACK có thể xếp thêm bản mới trong lúc đang chờ.
      let waiting:Promise<void>;
      do{waiting=queue;await waiting;}while(waiting!==queue);
      return seq<=Math.max(ack,discarded);
    },
  };
}
