import {STUDY_GAME_TOPICS,studyGameQuestions,type StudyGameQuestion} from '../playground/study-game-bank';
export const MINER_VERSION='2.0';
export type MinerLane=0|1|2;
export type MinerMode='standard'|'practice';
export type MinerQuestion={id:string;prompt:string;answers:readonly [string,string,string];correct:MinerLane;steps:string[];tip:string;grade?:StudyGameQuestion['grade'];chapter?:string;lesson?:string;type?:string;level?:StudyGameQuestion['level']};
/** Bộ ôn đại số nền tảng lớp 9, 10 do MTM tự biên soạn, tách khỏi mọi đề đã đăng. */
export const MINER_QUESTIONS:MinerQuestion[]=[
  {id:'miner-1',prompt:'Tìm x: 4(x − 1) − 3 = 13.',answers:['3','5','4'],correct:1,steps:['4(x − 1) − 3 = 13 ⇔ 4x − 4 − 3 = 13.','4x − 7 = 13 ⇔ 4x = 20 ⇔ x = 5.','Thử lại: 4(5 − 1) − 3 = 16 − 3 = 13.'],tip:'Nhân vào ngoặc trước, rồi chuyển các số sang cùng một vế.'},
  {id:'miner-2',prompt:'Tìm x: (x + 2)² − x² = 24.',answers:['6','4','5'],correct:2,steps:['(x + 2)² − x² = x² + 4x + 4 − x² = 4x + 4.','4x + 4 = 24 ⇔ 4x = 20 ⇔ x = 5.','Thử lại: (5 + 2)² − 5² = 49 − 25 = 24.'],tip:'Bình phương một tổng có cả hạng tử 2ab.'},
  {id:'miner-3',prompt:'Tìm x: (x² − 16)/(x − 4) = 10.',answers:['6','4','10'],correct:0,steps:['Điều kiện xác định: x ≠ 4.','x² − 16 = (x − 4)(x + 4). Với x ≠ 4, phân thức bằng x + 4.','x + 4 = 10 ⇔ x = 6, thỏa điều kiện.','Thử lại: (6² − 16)/(6 − 4) = 20/2 = 10.'],tip:'Ghi điều kiện trước khi khử nhân tử ở mẫu.'},
  {id:'miner-4',prompt:'Tìm x: (x − 2)(x + 2) = x² − 5x + 16.',answers:['−4','4','2'],correct:1,steps:['(x − 2)(x + 2) = x² − 4.','x² − 4 = x² − 5x + 16 ⇔ −4 = −5x + 16.','5x = 20 ⇔ x = 4.','Thử lại: (4 − 2)(4 + 2) = 12; 4² − 5 × 4 + 16 = 12.'],tip:'Nhận ra hiệu hai bình phương để các hạng tử x² triệt tiêu.'},
  {id:'miner-5',prompt:'Tìm x > 1 biết 2(x − 1)² = 18.',answers:['−2','3','4'],correct:2,steps:['2(x − 1)² = 18 ⇔ (x − 1)² = 9.','x − 1 = 3 hoặc x − 1 = −3, nên x = 4 hoặc x = −2.','Vì x > 1, chỉ nhận x = 4.','Thử lại: 2(4 − 1)² = 2 × 9 = 18.'],tip:'Một bình phương bằng số dương thường có hai nhánh. Cuối cùng đối chiếu điều kiện.'},
  {id:'miner-6',prompt:'Tìm x > 1: 1/(x − 1) − 1/(x + 1) = 2/3.',answers:['2','1','3'],correct:0,steps:['Điều kiện mẫu: x ≠ 1 và x ≠ −1; yêu cầu đề bài là x > 1.','1/(x − 1) − 1/(x + 1) = ((x + 1) − (x − 1))/((x − 1)(x + 1)) = 2/(x² − 1).','2/(x² − 1) = 2/3 ⇔ x² − 1 = 3 ⇔ x² = 4.','x = 2 hoặc x = −2. Chỉ x = 2 thỏa x > 1.','Thử lại: 1/(2 − 1) − 1/(2 + 1) = 1 − 1/3 = 2/3.'],tip:'Dấu trừ trước ngoặc phải đổi dấu cả hai hạng tử ở trong.'},
  {id:'miner-7',prompt:'Tìm x < 0 biết |2x − 3| = 7.',answers:['5','−5','−2'],correct:2,steps:['|2x − 3| = 7 ⇔ 2x − 3 = 7 hoặc 2x − 3 = −7.','Nhánh thứ nhất: 2x = 10 ⇔ x = 5. Nhánh thứ hai: 2x = −4 ⇔ x = −2.','Vì x < 0, chỉ nhận x = −2.','Thử lại: |2 × (−2) − 3| = |−7| = 7.'],tip:'Giá trị tuyệt đối bằng 7 cho hai nhánh 7 và −7.'},
  {id:'miner-8',prompt:'Tìm x: √(2x + 1) = x − 1.',answers:['0','4','−4'],correct:1,steps:['Căn bậc hai không âm, nên x − 1 ≥ 0, tức x ≥ 1. Điều kiện này cũng bảo đảm 2x + 1 ≥ 0.','Với x ≥ 1, bình phương hai vế: 2x + 1 = (x − 1)² = x² − 2x + 1.','x² − 4x = 0 ⇔ x(x − 4) = 0, nên x = 0 hoặc x = 4.','Loại x = 0 vì không thỏa x ≥ 1. Nhận x = 4.','Thử lại: √(2 × 4 + 1) = √9 = 3 = 4 − 1.'],tip:'Trước khi bình phương, xét dấu vế không chứa căn để tránh nghiệm ngoại lai.'},
];
/** Chỉ chương 1 đã có ngân hàng THPT được kiểm. Chương khác không nhận câu thay thế. */
export function minerChapter(track?:string,chapter?:string){
  if(chapter!=='1')return null;
  const topic=STUDY_GAME_TOPICS.find(t=>String(t.grade)===track);
  if(!topic)return null;
  const questions:MinerQuestion[]=studyGameQuestions(topic.grade,topic.id).map(q=>({...q,steps:q.explanation.split(/\.\s+/u).map((s,i,a)=>i<a.length-1?s+'.':s)}));
  return {...topic,questions};
}
export type MinerResult={question:number;chosen:MinerLane;correct:boolean};
export type MinerState={phase:'ready'|'intro'|'playing'|'feedback'|'paused'|'finished';resume:'intro'|'playing'|null;mode:MinerMode;scope:string|null;questions:readonly MinerQuestion[];queue:number[];cursor:number;lane:MinerLane;x:number;dig:number;intro:number;elapsed:number;hearts:number;score:number;combo:number;bestCombo:number;results:MinerResult[]};
export const freshMiner=(queue?:number[],mode:MinerMode='standard',questions:readonly MinerQuestion[]=MINER_QUESTIONS,scope:string|null=null):MinerState=>{const requested=queue??questions.map((_,i)=>i);return {phase:'ready',resume:null,mode,scope,questions,queue:requested.filter((q,i)=>Number.isInteger(q)&&q>=0&&q<questions.length&&requested.indexOf(q)===i),cursor:0,lane:1,x:.5,dig:0,intro:0,elapsed:0,hearts:3,score:0,combo:0,bestCombo:0,results:[]};};
export const startMiner=(state:MinerState,reduced=false):MinerState=>state.phase!=='ready'?state:{...state,phase:state.queue.length?(reduced?'playing':'intro'):'finished'};
export const moveMiner=(state:MinerState,direction:-1|1,reduced=false):MinerState=>{
  if(state.phase!=='playing'||state.dig>0||(direction!==-1&&direction!==1))return state;
  const lane=Math.max(0,Math.min(2,state.lane+direction)) as MinerLane;
  return lane===state.lane?state:{...state,lane,x:reduced?lane/2:state.x};
};
export const canDigMiner=(state:MinerState)=>state.phase==='playing'&&state.dig===0&&Math.abs(state.x-state.lane/2)<.015;
export const digMiner=(state:MinerState):MinerState=>canDigMiner(state)?{...state,dig:.001}:state;
export function resolveMinerDig(state:MinerState):MinerState{
  if(state.phase!=='playing'||state.dig<=0)return state;
  const question=state.queue[state.cursor],correct=state.lane===state.questions[question].correct,combo=correct?state.combo+1:0;
  return {...state,phase:'feedback',dig:1,hearts:state.hearts-(correct||state.mode==='practice'?0:1),score:state.score+(correct?100+20*Math.min(combo-1,4):0),combo,bestCombo:Math.max(combo,state.bestCombo),results:[...state.results,{question,chosen:state.lane,correct}]};
}
export function tickMiner(state:MinerState,delta:number):MinerState{
  if(!Number.isFinite(delta)||delta<=0||(state.phase!=='intro'&&state.phase!=='playing'))return state;
  const dt=Math.min(delta,.06);
  if(state.phase==='intro'){const intro=state.intro+dt;return {...state,intro,phase:intro>=3?'playing':'intro'};}
  const target=state.lane/2,distance=target-state.x,x=state.x+Math.sign(distance)*Math.min(Math.abs(distance),dt*1.6);
  const next={...state,x,elapsed:state.elapsed+dt,dig:state.dig>0?Math.min(1,state.dig+dt/.8):0};
  return next.dig>=1?resolveMinerDig(next):next;
}
export const nextMiner=(state:MinerState):MinerState=>state.phase!=='feedback'?state:state.hearts===0||state.cursor+1>=state.queue.length?{...state,phase:'finished'}:{...state,phase:'playing',cursor:state.cursor+1,dig:0};
export const pauseMiner=(state:MinerState):MinerState=>state.phase==='intro'||state.phase==='playing'?{...state,phase:'paused',resume:state.phase}:state;
export const resumeMiner=(state:MinerState):MinerState=>state.phase==='paused'&&state.resume?{...state,phase:state.resume,resume:null}:state;
export const MINER_RECORD_KEY='mtm-miner-record-v1';
type MinerStore=Pick<Storage,'getItem'|'setItem'>;
export type MinerRecord={best:number;completed:number};
const validRecord=(value:any):value is MinerRecord=>!!value&&Number.isInteger(value.best)&&value.best>=0&&value.best<=1240&&value.best%20===0&&Number.isInteger(value.completed)&&value.completed>=0&&value.completed<=8;
export function minerRecordKey(mode:MinerMode='standard',scope:string|null=null):string|null{
  if(!['standard','practice'].includes(mode)||(scope!==null&&!STUDY_GAME_TOPICS.some(topic=>topic.id===scope)))return null;
  return scope?`mtm-miner-record-v2-${scope}-${mode}`:mode==='standard'?MINER_RECORD_KEY:'mtm-miner-record-v2-practice';
}
export function readMinerRecord(store?:MinerStore,mode:MinerMode='standard',scope:string|null=null):MinerRecord{try{const key=minerRecordKey(mode,scope),record=key?JSON.parse(store?.getItem(key)??'null'):null;if(validRecord(record))return {best:record.best,completed:record.completed};}catch{}return {best:0,completed:0};}
export function saveMinerRecord(store:MinerStore|undefined,state:MinerState):boolean{
  if(!store||state.phase!=='finished')return false;
  const key=minerRecordKey(state.mode,state.scope),previous=readMinerRecord(store,state.mode,state.scope),record={best:Math.max(previous.best,state.score),completed:Math.max(previous.completed,state.results.length)};
  if(!key||!validRecord(record))return false;
  try{store.setItem(key,JSON.stringify(record));return true;}catch{return false;}
}
