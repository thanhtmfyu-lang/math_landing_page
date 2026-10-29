// KT-06 (Đợt 3): ngân hàng đề Luyện tập (khoảng 3 MB JSON). Chỉ nạp bằng import() động (qua PracticeShelf.tsx)
// sau khi khung trang /luyen-tap đã vẽ. Nội dung, ID, hash giữ nguyên như khi nhập tĩnh trước đây.
import tests from './practice-tests.json';
import archives from './archived-tests.json';
import exactTests from './exact-tests.json';
import probabilityTests from './probability-tests.json';
import chapterSequence from './chapter-sequence.json';
import {chapterRoman,foundationLabel,lessonName,routeGroupsOf,type PracticeItem} from './practice-shared';

const rawBank=[...tests,...exactTests,...probabilityTests] as unknown as PracticeItem[];
export const sequences=chapterSequence as Record<string,unknown>;
const rawIds=new Set(rawBank.map(p=>p.exam.id));
export const sequenceNumber=new Map<string,number>();
for(const v of Object.values(sequences))routeGroupsOf(v).flatMap(g=>g.items.map(i=>i.id)).filter(id=>rawIds.has(id)).forEach((id,i)=>sequenceNumber.set(id,i+1));
export const bank=rawBank.map(p=>{const coverage=p.displayCoverage??(p.isFoundation?foundationLabel(p):p.sourceEdition?lessonName(p.coverage):p.coverage);const n=sequenceNumber.get(p.exam.id);return {...p,coverage,presentationTitle:n?`Toán ${p.track} · Chương ${chapterRoman(p.chapter)} · Bài ${n}: ${coverage}`:p.presentationTitle??(["HSA","TSA"].includes(p.track)?p.exam.title:`Toán ${p.track} · Chương ${chapterRoman(p.chapter)} · ${p.isChapterEnd?"Kiểm tra kết thúc chương":"Bài "+p.order+": "+coverage}`)};});
const currentIds=new Set(bank.map(p=>p.exam.id));
export const pilotBank=(archives as unknown as PracticeItem[]).filter(p=>!currentIds.has(p.exam.id));
