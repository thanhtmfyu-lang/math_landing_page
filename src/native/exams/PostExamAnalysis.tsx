import {useEffect,useState} from 'react';
import {Link} from '../../migration/navigation';
import {recoveryTopics,publicDistribution,type Distribution} from '../../../server/phong-thi/analysis-model';
import {tenChuDe,type PtKetQua} from '../../../server/phong-thi/engine';

export default function PostExamAnalysis({result,ticket}:{result:PtKetQua;ticket:string}){
 const [distribution,setDistribution]=useState<Distribution|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setDistribution(null);setFailed(false);
  fetch('/api/phong-thi',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({action:'phan-tich',de:result.de,ve:ticket})})
   .then(async response=>{if(!response.ok)throw Error();return response.json();})
   .then(value=>{if(!controller.signal.aborted)setDistribution(publicDistribution(value));})
   .catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>controller.abort();
 },[result.de,ticket]);
 const topics=recoveryTopics(result);
 return <section className="hsa-card pt-analysis"><h2>Em nên ôn gì tiếp theo?</h2>
  {topics.length?<ol>{topics.map(item=><li key={item.topic}><strong>{tenChuDe(item.topic)}</strong><p>Đọc lại lời giải rồi tự làm lại {item.questions.map((q,i)=><span key={q.id}>{i?', ':''}<a href={'#pt-review-'+q.id}>câu {q.number}</a></span>)}.</p></li>)}</ol>:<p>Chưa có chủ đề cần luyện lại từ những câu đã được gắn nhãn trong bài này.</p>}
  <p><Link href="/btvn">Mở BTVN của lớp</Link> để chọn bài ôn cùng chủ đề. Chưa có ghép tự động giữa mã câu và bài tập lớp.</p>
  <h3>Phổ điểm {distribution?.available&&distribution.scope==='dot'?'cùng đề trong đợt thi':'cùng mã đề'}</h3>
  {distribution?.available?<><p>Quy về thang 10; mỗi người lấy lượt đầu không quá giờ. {distribution.total} lượt được tính.</p><ol className="pt-score-distribution">{distribution.bins.map(b=><li key={b.bin}><span>{b.bin}–{b.bin===9?'10':`<${b.bin+1}`}</span><meter min={0} max={distribution.total} value={b.count} aria-label={`Khoảng ${b.bin} đến ${b.bin+1}: ${b.count} lượt`}/><strong>{b.count}</strong></li>)}</ol></>:<p role="status">{failed?'Chưa tải được phổ điểm. Điểm của em vẫn giữ nguyên.':distribution?'Phổ điểm chưa được bật hoặc chưa đủ dữ liệu để hiển thị.':'Đang đọc phổ điểm…'}</p>}
 </section>;
}
