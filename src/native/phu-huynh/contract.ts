/** Dữ liệu Góc phụ huynh trả về trình duyệt. Không có SĐT, học phí, tên/điểm học sinh khác. */
export type ParentChild={id:string;fullName:string;className:string};
export type ParentHomeworkStatus='da-nop'|'muon'|'chua-nop'|'qua-han'|'chua-mo';
export type ParentHomework={lessonCode:string;title:string;date:string;kind:string;dueAt:number|null;bestScore:number|null;submittedAt:number|null;late:boolean;status:ParentHomeworkStatus};
export type ParentAttendance={date:string;status:string;label:string};
export type ParentPaper={testCode:string;date:string|null;subject:string|null;score:number;maxScore:number};
export type ParentTopic={lessonCode:string;title:string;date:string;score:number};
export type ParentReport={
 parentName:string|null;children:ParentChild[];child:ParentChild;generatedAt:number;upcoming:string|null;
 attendance:ParentAttendance[];homework:ParentHomework[];papers:ParentPaper[];
 rank:{rank:number;score:number|null;submitted:number|null;total:number|null}|null;
 summary:{monthAttendance:{attended:number;total:number}|null;submitted:number;dueTotal:number;averageScore:number|null;strong:ParentTopic[];weak:ParentTopic[];missing:{lessonCode:string;title:string;date:string}[]};
};
