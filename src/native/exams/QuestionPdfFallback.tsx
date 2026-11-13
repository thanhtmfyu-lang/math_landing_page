import {validSourcePdf} from './data';
import type {QuestionPdf} from './pdf-source';

/** Only the current authorized question document; never use sourceUrl (may contain solutions). */
export default function QuestionPdfFallback({file,url}:{file:QuestionPdf;url?:string}){
  if(!validSourcePdf(file))return null;
  return <p className="ep-pdf-fallback">Nếu bản đề tải lâu hoặc không hiển thị, em vẫn có thể làm và nộp bài. <a href={url||file.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở đề PDF ở tab mới</a></p>;
}
