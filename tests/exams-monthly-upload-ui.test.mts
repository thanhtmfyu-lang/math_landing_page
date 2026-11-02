import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MonthlyExamUpload} from '../src/native/lesson-upload/MonthlyExamUpload';
import type {MonthlyDashboard} from '../src/native/lesson-upload/monthly-model';
// esbuild's test runner uses classic JSX. Production uses Vite's automatic JSX.
(globalThis as any).React=React;
for(const role of ['gv','ql','admin'] as const){
 const data:MonthlyDashboard={staff:{user_id:'fixture-owner',short_name:'fixture',display_name:'Nhân sự giả',role,teacher_key:role==='gv'?'fixture':null},classes:[{class_id:'fixture-class',class_name:'Lớp giả',teacher_key:'fixture'}],uploads:[{id:'fake',title:'Đề giả',class_ids:['fixture-class'],class_names:{'fixture-class':'Lớp giả'},exam_date:'2026-11-03',opens_at:'2026-11-03T12:30:00Z',closes_at:'2026-11-03T14:30:00Z',version:1,status:'blocked',detail:'Đáp án chưa khớp',created_at:'2026-11-02T00:00:00Z'}],scheduled_classes:1,ready_classes:0,blocked_classes:1};
 const html=renderToStaticMarkup(React.createElement(MonthlyExamUpload,{owner:'fixture-owner',initialData:data}));
 assert.match(html,/Đề mã 101/);assert.match(html,/Đề mã 102/);assert.match(html,/Đáp án mã 101/);assert.match(html,/Đáp án mã 102/);assert.equal((html.match(/type="file"/g)||[]).length,4);assert.equal((html.match(/data-paper-key=/g)||[]).length,2);
 assert.match(html,/type="date"/);assert.equal((html.match(/type="time"/g)||[]).length,2);assert.match(html,/type="checkbox"/);assert.match(html,/Bài giữ chờ/);assert.match(html,/role="alert"/);assert.match(html,/Điểm tối đa phần tự luận/);
 assert.equal(html.includes('Quản lý/admin được đăng thay'),role!=='gv');assert.doesNotMatch(html,/answer_text|acceptedAnswers|claim_token|mtm-lesson-private/);
}
console.log('Monthly React SSR: actual form renders two private paper/key inputs, times, classes, rubric, QL/admin attribution and red HOLD. No browser/viewport claim.');
