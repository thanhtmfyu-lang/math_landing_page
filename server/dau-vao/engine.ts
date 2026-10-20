/** Kiểm tra đầu vào (/kiem-tra-dau-vao): phần lõi thuần dùng chung cho /api/kiem-tra-dau-vao và test.
 * Đề tự ghép theo ngày làm bài: tuần năm học quyết định chủ đề trường đã dạy, sổ tiến độ quyết định chủ đề trung tâm đã dạy.
 * Đề không lưu ở máy chủ: cùng (khối, ngày, seed) luôn ghép ra cùng một đề, nên máy chủ ghép lại để chấm. Đáp án không rời máy chủ. */
export const DV_TRACKS=['6','7','8','9','10','11','12','hsa'] as const;
export type DvTrack=typeof DV_TRACKS[number];
export const DV_TRACK_LABEL:Record<DvTrack,string>={'6':'Lớp 6','7':'Lớp 7','8':'Lớp 8','9':'Lớp 9','10':'Lớp 10','11':'Lớp 11','12':'Lớp 12',hsa:'HSA'};
export const isDvTrack=(v:unknown):v is DvTrack=>typeof v==='string'&&(DV_TRACKS as readonly string[]).includes(v);
export type Level=1|2|3|4;
export const LEVEL_LABEL:Record<Level,string>={1:'Nhận biết',2:'Thông hiểu',3:'Vận dụng',4:'Vận dụng cao'};
export type Topic={id:string;name:string;chapter:string;school:[number,number];key?:boolean};
export type Kind='mc'|'num'|'tf';
/** tf: câu Đúng/Sai 4 ý kiểu đề tốt nghiệp từ 2025 (statements a-d, answer 4 giá trị). dang, bay: nhãn theo NHAN_CAU_TN_2025_2026.csv để báo điểm yếu theo dạng. */
export type Question={id:string;topic:string;level:Level;kind:Kind;prompt:string;choices?:string[];statements?:string[];answer:number|string|boolean[];explain?:string;check?:string;dang?:string;boiCanh?:boolean;bay?:string};
export type Bank={khoi:string;sach?:string;topics:Topic[];questions:Question[]};
export type Group={id:string;name:string;now:string;start?:string;covered:Record<string,number>;follows?:'school'};
export type Progress={version:1;capNhat:string;namHoc:{nam:string;tuan1:string}[];khoi:Record<DvTrack,{groups:Group[]}>};
export type SectionId='nen'|'truong'|'trung-tam'|'dac-thu'|'tot-nghiep';
export const SECTION_LABEL:Record<SectionId,string>={nen:'Nền tảng lớp dưới',truong:'Kiến thức trên trường đã học','trung-tam':'Phần lớp MTM đã dạy trước','dac-thu':'Dạng bài đặc thù HSA','tot-nghiep':'Mini đề kiểu thi tốt nghiệp (3 phần)'};
export type Part='I'|'II'|'III';
export const PART_LABEL:Record<Part,string>={I:'Phần I. Trắc nghiệm nhiều lựa chọn',II:'Phần II. Trắc nghiệm đúng sai',III:'Phần III. Trả lời ngắn'};
const PART_OF:Record<Kind,Part>={mc:'I',tf:'II',num:'III'};
export type PaperQuestion={no:number;id:string;section:SectionId;topic:string;topicName:string;level:Level;kind:Kind;prompt:string;choices?:string[];statements?:string[];part?:Part};
export type Paper={khoi:DvTrack;ngay:string;seed:number;code:string;week:number;summer:boolean;schoolYear:string;durationMinutes:number;sections:{id:SectionId;label:string;count:number}[];questions:PaperQuestion[]};
type Pick={q:Question;section:SectionId;topic:Topic};

const DAY=86400000;
/** Ngày theo giờ Việt Nam dạng YYYY-MM-DD. */
export function vnDate(now:number){return new Date(now+7*3600000).toISOString().slice(0,10);}
const utc=(d:string)=>Date.parse(d+'T00:00:00Z');
export const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(utc(v))&&new Date(utc(v)).toISOString().slice(0,10)===v;
/** Thứ Hai đầu tiên từ ngày 5/9: mốc tuần 1 mặc định khi sổ tiến độ chưa ghi năm học đó. */
function defaultWeek1(year:number){const d=new Date(Date.UTC(year,8,5));const shift=(8-d.getUTCDay())%7;return utc(new Date(d.getTime()+shift*DAY).toISOString().slice(0,10));}
/** Tuần năm học của một ngày. Từ 01/06 đến khai giảng là hè: tuần âm, tính theo năm học sắp tới (em đăng ký lớp của năm sau). */
export function schoolWeek(date:string,progress:{namHoc:Progress['namHoc']}){
 const t=utc(date),y=new Date(t).getUTCFullYear(),m=new Date(t).getUTCMonth()+1;
 const startYear=m>=6?y:y-1;
 const named=progress.namHoc.find(n=>n.nam===`${startYear}-${startYear+1}`);
 const week1=named?utc(named.tuan1):defaultWeek1(startYear);
 const week=Math.floor((t-week1)/(7*DAY))+(t>=week1?1:0);
 return {week:t>=week1?Math.min(week,35):Math.min(week,0),summer:t<week1,schoolYear:`${startYear}-${startYear+1}`};
}

/** PRNG mulberry32: cùng seed, cùng dãy, trên mọi máy. */
function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle<T>(items:T[],rand:()=>number){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

/** Tuần nhóm lớp học xong chủ đề; undefined nếu nhóm chưa dạy. Nhóm theo tiến độ trường dùng tuần trường bắt đầu dạy. */
function coveredWeek(g:Group,t:Topic){return g.covered[t.id]??(g.follows==='school'&&t.school[0]>0?t.school[0]:undefined);}
/** Trường đã dạy: bắt đầu dạy ít nhất 1 tuần trước ngày làm bài. Chủ đề đang dạy dở chỉ ra câu mức 1-2. */
function schoolState(t:Topic,week:number):'done'|'partial'|'none'{if(t.school[0]===0)return 'none';if(week>t.school[1])return 'done';if(week>t.school[0])return 'partial';return 'none';}

type Plan={section:SectionId;pool:{topic:Topic;maxLevel:Level}[];levels:Level[]};
const LEVELS_FOUNDATION:Level[]=[2,3,2,3,1,3,2,3,2,4,3,2],LEVELS_SCHOOL:Level[]=[1,2,3,2,3,4,1,2,3,4,3,2],LEVELS_CENTER:Level[]=[2,3,1,4,3,2,3,4];
const take=(src:Level[],n:number)=>Array.from({length:n},(_,i)=>src[i%src.length]);

/** Chọn câu theo kế hoạch: xoay vòng chủ đề (đã trộn theo seed), mỗi lượt lấy câu đúng mức cần; thiếu thì lấy mức gần nhất. */
function fill(plan:Plan,questions:Question[],used:Set<string>,rand:()=>number):Pick[]{
 const out:Pick[]=[];if(!plan.pool.length)return out;
 const pool=shuffle(plan.pool,rand);let k=0;
 for(const want of plan.levels){
  for(let tries=0;tries<pool.length;tries++){
   const {topic,maxLevel}=pool[(k+tries)%pool.length];
   const lv=Math.min(want,maxLevel) as Level;
   const cands=questions.filter(q=>q.topic===topic.id&&!used.has(q.id)&&q.level<=maxLevel);
   if(!cands.length)continue;
   const best=Math.min(...cands.map(q=>Math.abs(q.level-lv)));
   const choice=shuffle(cands.filter(q=>Math.abs(q.level-lv)===best),rand)[0];
   used.add(choice.id);out.push({q:choice,section:plan.section,topic});k=(k+tries+1)%pool.length;break;
  }
 }
 return out;
}

/** '12-tn': ngân hàng mini đề kiểu tốt nghiệp của lớp 12, câu gắn mã chủ đề của ngân hàng 10, 11, 12. */
export type Banks=Partial<Record<DvTrack|'12-tn',Bank>>;
// Mini đề lớp 12: 6 nhiều lựa chọn + 2 đúng sai + 2 trả lời ngắn; bắt buộc có xác suất, tối ưu, tổ hợp đếm (nhóm dạng chặn điểm của đề Bộ).
const TN_SLOTS:Kind[]=['mc','mc','mc','mc','mc','mc','tf','tf','num','num'];
const TN_MUST:string[][]=[['T12-18','T12-17','T10-18','T11-17'],['T12-02','T12-05','T10-03'],['T10-16']];
function fillTn(qs:Question[],known:Map<string,{topic:Topic;maxLevel:Level}>,used:Set<string>,rand:()=>number):Pick[]{
 const cands=shuffle(qs.filter(q=>!used.has(q.id)&&known.has(q.topic)&&q.level<=known.get(q.topic)!.maxLevel),rand);
 const slots=TN_SLOTS.slice(),out:Pick[]=[];
 const take1=(q:Question)=>{slots.splice(slots.indexOf(q.kind),1);used.add(q.id);out.push({q,section:'tot-nghiep',topic:known.get(q.topic)!.topic});};
 for(const must of TN_MUST){
  // Xác suất: ưu tiên Bayes khi đã học, rồi có điều kiện, rồi lớp 10-11.
  for(const id of must){const q=cands.find(q=>q.topic===id&&!used.has(q.id)&&slots.includes(q.kind));if(q){take1(q);break;}}
 }
 for(const kind of slots.slice()){
  const seen=new Set(out.map(p=>p.q.topic));
  const q=cands.find(q=>q.kind===kind&&!used.has(q.id)&&!seen.has(q.topic))??cands.find(q=>q.kind===kind&&!used.has(q.id));
  if(q)take1(q);
 }
 const order:Kind[]=['mc','tf','num'];
 return out.sort((a,b)=>order.indexOf(a.q.kind)-order.indexOf(b.q.kind));
}

const PREV:Record<DvTrack,DvTrack|null>={'6':null,'7':'6','8':'7','9':'8','10':'9','11':'10','12':'11',hsa:null};

/** Ghép đề. 6-12: 20 câu, 60 phút: nền lớp dưới + trường đã học + trung tâm đã dạy (trường chưa dạy), tỉ lệ đổi theo thời điểm.
 * HSA: 25 câu, 50 phút: nền 10-11, phần lớp 12 đã học (trường hoặc lớp HSA), dạng đặc thù HSA. */
export function assemble(khoi:DvTrack,ngay:string,seed:number,banks:Banks,progress:Progress):{paper:Paper;picks:Pick[]}{
 const rand=rng(seed^hash(khoi+ngay));
 const {week,summer,schoolYear}=schoolWeek(ngay,progress);
 const groups=progress.khoi[khoi]?.groups??[];
 const used=new Set<string>();const plans:{plan:Plan;questions:Question[]}[]=[];let tn=false;
 if(khoi==='hsa'){
  const b10=banks['10'],b11=banks['11'],b12=banks['12'],bh=banks.hsa;
  if(!b10||!b11||!b12||!bh)throw Error('Thiếu ngân hàng HSA');
  const hsaGroups=progress.khoi.hsa?.groups??[];
  const known12=b12.topics.filter(t=>schoolState(t,week)!=='none'||hsaGroups.some(g=>{const w=coveredWeek(g,t);return w!==undefined&&w<=week;}));
  const nen=[...b10.topics,...b11.topics].filter(t=>t.key);
  const nenQs=[...b10.questions,...b11.questions];
  const n12=known12.length>=2?7:0;
  plans.push({plan:{section:'nen',pool:nen.map(topic=>({topic,maxLevel:4})),levels:take(LEVELS_FOUNDATION,10+(7-n12))},questions:nenQs});
  if(n12)plans.push({plan:{section:'trung-tam',pool:known12.map(topic=>({topic,maxLevel:schoolState(topic,week)==='partial'&&!hsaGroups.some(g=>coveredWeek(g,topic)!==undefined)?2:4})),levels:take(LEVELS_SCHOOL,n12)},questions:b12.questions});
  const dac=bh.topics.filter(t=>t.school[0]<=Math.max(week,1)||hsaGroups.some(g=>{const w=coveredWeek(g,t);return w!==undefined&&w<=week;}));
  plans.push({plan:{section:'dac-thu',pool:dac.map(topic=>({topic,maxLevel:4})),levels:take(LEVELS_CENTER,8)},questions:bh.questions});
 }else{
  const bank=banks[khoi];if(!bank)throw Error('Thiếu ngân hàng '+khoi);
  const prev=PREV[khoi]?banks[PREV[khoi]!]:undefined;
  const nenTopics=prev?prev.topics.filter(t=>t.key):bank.topics.filter(t=>t.school[0]===0);
  const nenQs=prev?prev.questions:bank.questions;
  const truong=bank.topics.filter(t=>schoolState(t,week)!=='none');
  tn=khoi==='12'&&!!banks['12-tn']&&!!banks['10']&&!!banks['11'];
  const total=tn?14:20;
  const center=bank.topics.filter(t=>schoolState(t,week)==='none'&&t.school[0]>0&&groups.some(g=>{const w=g.covered[t.id];return w!==undefined&&w<=week;}));
  // Đầu năm (trường chưa dạy gì): dồn vào nền; trung tâm chưa vượt trường: dồn vào phần trường.
  let nT=truong.length>=3?total/2:truong.length?4:0,nC=Math.min(center.length?total/4|0:0,center.length*2+1),nN=total-nT-nC;
  if(!center.length&&truong.length>=3){nT=total-6;nN=6;}
  if(!nenTopics.length){nT+=nN;nN=0;}
  plans.push({plan:{section:'nen',pool:nenTopics.map(topic=>({topic,maxLevel:4})),levels:take(LEVELS_FOUNDATION,nN)},questions:nenQs});
  plans.push({plan:{section:'truong',pool:truong.map(topic=>({topic,maxLevel:schoolState(topic,week)==='partial'?2:4})),levels:take(LEVELS_SCHOOL,nT)},questions:bank.questions});
  if(nC)plans.push({plan:{section:'trung-tam',pool:center.map(topic=>({topic,maxLevel:4})),levels:take(LEVELS_CENTER,nC)},questions:bank.questions});
 }
 const target=khoi==='hsa'?25:tn?14:20;
 const picks=plans.flatMap(p=>fill(p.plan,p.questions,used,rand));
 // Ngân hàng một phần hết câu (vd. lớp 6 dịp hè chỉ có nền tiểu học): lấy thêm câu chưa dùng của cùng phần, rồi chủ đề đầu năm mức 1-2 làm nền.
 for(const p of plans){if(picks.length>=target)break;picks.push(...fill({...p.plan,levels:take(p.plan.levels.length?p.plan.levels:LEVELS_SCHOOL,target-picks.length)},p.questions,used,rand));}
 if(picks.length<target&&khoi!=='hsa'){const bank=banks[khoi]!;picks.push(...fill({section:'nen',pool:bank.topics.filter(t=>t.school[0]>0&&t.school[0]<=7).map(topic=>({topic,maxLevel:3 as Level})),levels:take([1,2,3],target-picks.length)},bank.questions,used,rand));}
 const order:SectionId[]=['nen','truong','trung-tam','dac-thu'];picks.sort((a,b)=>order.indexOf(a.section)-order.indexOf(b.section));
 if(tn){
  // Chỉ chủ đề mọi học sinh mới đều đã học: cả lớp 10, 11; lớp 12 trường đã dạy (phần MTM dạy trước không đưa vào để không thiệt em mới).
  // Chủ đề trường đang dạy dở chỉ ra câu mức 1-2.
  const known=new Map<string,{topic:Topic;maxLevel:Level}>();
  for(const t of [...banks['10']!.topics,...banks['11']!.topics])known.set(t.id,{topic:t,maxLevel:4});
  for(const t of banks['12']!.topics){const st=schoolState(t,week);if(st!=='none')known.set(t.id,{topic:t,maxLevel:st==='partial'?2:4});}
  picks.push(...fillTn(banks['12-tn']!.questions,known,used,rand));
 }
 const sections=(['nen','truong','trung-tam','dac-thu','tot-nghiep'] as SectionId[]).map(id=>({id,label:id==='trung-tam'&&khoi==='hsa'?'Lớp 12 đã học (trường hoặc lớp HSA)':SECTION_LABEL[id],count:picks.filter(p=>p.section===id).length})).filter(s=>s.count);
 const paper:Paper={khoi,ngay,seed,code:paperCode(khoi,ngay,seed),week,summer,schoolYear,durationMinutes:khoi==='hsa'?50:tn&&picks.some(p=>p.section==='tot-nghiep')?75:60,sections,
  questions:picks.map((p,i)=>({no:i+1,id:p.q.id,section:p.section,topic:p.topic.id,topicName:p.topic.name,level:p.q.level,kind:p.q.kind,prompt:p.q.prompt,...(p.q.kind==='mc'?{choices:p.q.choices}:p.q.kind==='tf'?{statements:p.q.statements}:{}),...(p.section==='tot-nghiep'?{part:PART_OF[p.q.kind]}:{})}))};
 return {paper,picks};
}
function hash(s:string){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function paperCode(khoi:DvTrack,ngay:string,seed:number){return `DV${khoi.toUpperCase()}-${ngay.slice(2).replace(/-/g,'')}-${(seed>>>0).toString(36).toUpperCase().padStart(6,'0').slice(-6)}`;}

/** Chuẩn hóa câu trả lời số: bỏ khoảng trắng, dấu phẩy thành chấm. */
export function normalizeNum(v:string){const s=v.trim().replace(/\s+/g,'').replace(',','.');return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)?Number(s):null;}
/** Số ý đúng của câu đúng sai; học sinh gửi mảng 4 phần tử true/false/null. */
function tfHits(q:Question,a:unknown){if(!Array.isArray(a)||a.length!==4||!Array.isArray(q.answer))return 0;return a.reduce((n:number,x,i)=>n+(typeof x==='boolean'&&x===(q.answer as boolean[])[i]?1:0),0);}
function isCorrect(q:Question,a:unknown){
 if(q.kind==='mc')return typeof a==='number'&&a===q.answer;
 if(q.kind==='tf')return tfHits(q,a)===4;
 if(typeof a!=='string'||a.length>12)return false;const n=normalizeNum(a),k=Number(q.answer);return n!==null&&Math.abs(n-k)<1e-9;
}
/** Thang điểm đề tốt nghiệp từ 2025: nhiều lựa chọn 0,25; đúng sai 0,1/0,25/0,5/1 theo 1/2/3/4 ý đúng; trả lời ngắn 0,5. */
const TF_POINTS=[0,0.1,0.25,0.5,1],KIND_MAX:Record<Kind,number>={mc:0.25,tf:1,num:0.5};
function tnPoints(q:Question,a:unknown){return q.kind==='tf'?TF_POINTS[tfHits(q,a)]:isCorrect(q,a)?KIND_MAX[q.kind]:0;}
const answeredValue=(a:unknown)=>Array.isArray(a)?a.some(x=>typeof x==='boolean'):a!==undefined&&a!==null&&a!=='';
const WEIGHT:Record<Level,number>={1:1,2:1,3:1.5,4:2};
export type TopicResult={topic:string;name:string;section:SectionId;correct:number;total:number;status:'vung'|'cung-co'|'hong'};
export type Suggestion={group:string;level:string;why:string;extra:string[]};
export type TnResult={score:number;earned:number;max:number;parts:{part:Part;label:string;earned:number;max:number}[];byDang:{dang:string;correct:number;total:number}[]};
export type Result={code:string;khoi:DvTrack;ngay:string;week:number;score:number;scoreNote:string;correct:number;total:number;tn?:TnResult;
 bySection:{id:SectionId;label:string;correct:number;total:number;percent:number}[];byLevel:{level:Level;label:string;correct:number;total:number}[];
 topics:TopicResult[];items:{no:number;correct:boolean;answered:boolean;topicName:string;level:Level;hits?:number}[];suggestion:Suggestion};

export function grade(paper:Paper,picks:Pick[],answers:Record<string,unknown>,groups:Group[]):Result{
 // Lớp 6-12: phần trung tâm dạy trước (trường chưa dạy) chỉ để xét nhóm học trước và chỉ ra phần cần bù, không tính vào điểm.
 // Mini đề kiểu tốt nghiệp chấm riêng theo thang Bộ, không trộn vào điểm chẩn đoán.
 const counted=(p:Pick)=>paper.khoi==='hsa'||(p.section!=='trung-tam'&&p.section!=='tot-nghiep');
 let earned=0,max=0,correct=0;
 const items=picks.map((p,i)=>{const a=answers[p.q.id];const ok=isCorrect(p.q,a);if(counted(p)){max+=WEIGHT[p.q.level];if(ok)earned+=WEIGHT[p.q.level];}if(ok)correct++;
  return {no:i+1,correct:ok,answered:answeredValue(a),topicName:p.topic.name,level:p.q.level,section:p.section,topic:p.topic,...(p.q.kind==='tf'?{hits:tfHits(p.q,a)}:{})};});
 const score=Math.round((max?earned/max*10:0)*10)/10;
 const bySection=paper.sections.map(s=>{const xs=items.filter(x=>x.section===s.id);const c=xs.filter(x=>x.correct).length;return {id:s.id,label:s.label,correct:c,total:xs.length,percent:xs.length?Math.round(c/xs.length*100):0};});
 const byLevel=([1,2,3,4] as Level[]).map(level=>{const xs=items.filter(x=>x.level===level);return {level,label:LEVEL_LABEL[level],correct:xs.filter(x=>x.correct).length,total:xs.length};}).filter(x=>x.total);
 const map=new Map<string,TopicResult>();
 for(const x of items){const key=x.section+':'+x.topic.id;const r=map.get(key)??{topic:x.topic.id,name:x.topic.name,section:x.section,correct:0,total:0,status:'vung' as const};r.total++;if(x.correct)r.correct++;map.set(key,r);}
 const tnPicks=picks.filter(p=>p.section==='tot-nghiep');let tn:TnResult|undefined;
 if(tnPicks.length){
  const r2=(x:number)=>Math.round(x*100)/100;
  const parts=(['I','II','III'] as Part[]).map(part=>{const xs=tnPicks.filter(p=>PART_OF[p.q.kind]===part);return {part,label:PART_LABEL[part],earned:r2(xs.reduce((s,p)=>s+tnPoints(p.q,answers[p.q.id]),0)),max:r2(xs.reduce((s,p)=>s+KIND_MAX[p.q.kind],0))};}).filter(x=>x.max);
  const e=r2(parts.reduce((s,x)=>s+x.earned,0)),m=r2(parts.reduce((s,x)=>s+x.max,0));
  const dang=new Map<string,{dang:string;correct:number;total:number}>();
  for(const p of tnPicks){const k=p.q.dang||p.topic.name;const d=dang.get(k)??{dang:k,correct:0,total:0};d.total++;if(isCorrect(p.q,answers[p.q.id]))d.correct++;dang.set(k,d);}
  tn={score:Math.round(e/m*100)/10,earned:e,max:m,parts,byDang:[...dang.values()]};
 }
 const topics=[...map.values()].map(r=>({...r,status:(r.correct===r.total?'vung':r.correct*2>=r.total?'cung-co':'hong') as TopicResult['status']}));
 return {code:paper.code,khoi:paper.khoi,ngay:paper.ngay,week:paper.week,score,scoreNote:[paper.khoi!=='hsa'&&picks.some(p=>p.section==='trung-tam')?'Điểm tính trên phần nền và phần trường đã học; phần trung tâm dạy trước không tính điểm.':'',tn?'Mini đề kiểu thi tốt nghiệp chấm riêng theo thang điểm của Bộ.':''].filter(Boolean).join(' '),correct,total:items.length,...(tn?{tn}:{}),bySection,byLevel,topics,
  items:items.map(({no,correct,answered,topicName,level,hits})=>({no,correct,answered,topicName,level,...(hits!==undefined?{hits}:{})})),suggestion:suggest(paper,score,bySection,byLevel,groups)};
}

/** Gợi ý xếp lớp. Học sinh mới ưu tiên nhóm XPT (theo tiến độ trường); nhóm học trước chỉ gợi ý khi phần trung tâm và câu vận dụng đều vững. */
export function suggest(paper:Paper,score:number,bySection:Result['bySection'],byLevel:Result['byLevel'],groups:Group[]):Suggestion{
 const pct=(id:SectionId)=>bySection.find(s=>s.id===id);const nen=pct('nen'),center=pct('trung-tam');
 const hi=byLevel.filter(l=>l.level>=3);const hiPct=hi.reduce((a,l)=>a+l.total,0)?hi.reduce((a,l)=>a+l.correct,0)/hi.reduce((a,l)=>a+l.total,0):0;
 const extra:string[]=[];
 if(nen&&nen.total&&nen.percent<50)extra.push(paper.khoi==='hsa'?'Nền lớp 10-11 còn hổng: lớp HSA giao thêm phiếu ôn nền theo các mảng sai.':'Nền lớp dưới còn hổng: tuần đầu giáo viên giao phiếu bù nền theo các chủ đề sai trước khi học bài mới.');
 if(center&&center.total&&center.percent<50)extra.push('Phần lớp đã học trước ở trung tâm em còn thiếu: trung tâm gửi video bài giảng và phiếu bù của các buổi đó.');
 const g=(id:string)=>groups.find(x=>x.id===id);
 if(paper.khoi==='hsa'){
  const strong=score>=7&&hiPct>=0.6;const main=g(strong?'HSA':'HSA2')??groups[0];
  return {group:main?main.name:'Lớp HSA',level:score>=8?'Mục tiêu 100+ điểm HSA':score>=6?'Mục tiêu 85-100 điểm HSA':'Xây nền trước, mục tiêu 75-85 điểm HSA',why:strong?'Em làm tốt câu vận dụng và phần lớp 12, theo kịp lớp đã học từ hè.':'Lớp mở từ tháng 10, tiến độ phù hợp để học chắc từ chuyên đề đầu.',extra};
 }
 const level=score<5?'Step 1 Nền tảng':score<8?'Step 2 Vận dụng':'Step 3 Vận dụng cao';
 const thcsLevel=score<5?'Nhóm củng cố nền':score<8?'Nhóm vận dụng':'Nhóm nâng cao (học sinh giỏi, ôn chuyên)';
 const xps=g('XPS'),xpt=g('XPT');
 const ahead=!!xps&&score>=8&&hiPct>=0.6&&(!center||!center.total||center.percent>=70);
 const main=ahead?xps!:xpt??groups[0];
 if(ahead)extra.push('Có thể xét '+xps!.name+': học thử 1 buổi để giáo viên xác nhận em theo kịp, nếu chưa thì vào '+(xpt?.name??'nhóm theo tiến độ trường')+'.');
 const thcs=['6','7','8','9'].includes(paper.khoi);
 return {group:main?main.name:'Lớp '+paper.khoi,level:thcs?thcsLevel:level,why:ahead?'Em vững cả phần trường và phần trung tâm đã học trước, làm tốt câu vận dụng.':'Nhóm học theo tiến độ trường; học sinh mới được ưu tiên xếp vào nhóm này.',extra};
}
