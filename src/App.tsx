import {Component,lazy,Suspense,useEffect,type ReactNode} from 'react';
import {routeMetadata} from './migration/route-policy';
import {legacyLearningAlias} from './migration/legacy-alias';
import {SEOProvider} from './components/SEOProvider';import {SEO} from './components/SEO';import {StructuredData} from './components/StructuredData';


import {Footer} from './components/Footer';import {FloatingContact} from './components/FloatingContact';import {Toaster} from './components/ui/sonner';

import {MigrationHeader,PreviewNotice,AccessDialog} from './migration/Experience';
const siteThemeReady=import('./migration/R106SiteTheme');
void siteThemeReady.catch(()=>{});
const R106SiteTheme=lazy(()=>siteThemeReady);
const Home=lazy(()=>import('./migration/Home'));
const Catalogue=lazy(()=>import('./native/NativeCourses').then(m=>({default:m.NativeCatalogue})));
const CourseDetail=lazy(()=>import('./native/NativeCourses').then(m=>({default:m.NativeCourseDetail})));
const NativeLesson=lazy(()=>import('./native/NativeCourses').then(m=>({default:m.NativeLesson})));
const NativeResources=lazy(()=>import('./native/NativeResources'));
const NativeExams=lazy(()=>import('./native/admin/PublishedExams'));
const PracticeLibrary=lazy(()=>import('./native/chapters/PracticeLibrary'));
const RankArena=lazy(()=>import('./native/homework/RankArena'));
const HonorTicker=lazy(()=>import('./native/homework/HonorTicker'));
const AdminExams=lazy(()=>import('./native/admin/AdminExams'));

const HomeworkSession=lazy(()=>import('./native/homework/HomeworkSession'));
const AdminHomework=lazy(()=>import('./native/homework/AdminHomework'));
const StudentAppearanceButton=lazy(()=>import('./components/StudentAppearance').then(m=>({default:m.StudentAppearanceButton})));
import {publicSnapshot} from './native/model';
const Notebook=lazy(()=>import('./migration/Notebook'));
const Guide=lazy(()=>import('./migration/Guide'));
const Playground=lazy(()=>import('./native/playground/Playground'));
const NotFound=lazy(()=>import('./migration/StudyRoutes').then(m=>({default:m.NotFound})));
class RouteError extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}render(){return this.state.failed?<section className="mig-container mig-panel mig-load-error" role="alert"><h1>Chưa tải được nội dung</h1><p>Kết nối có thể đã gián đoạn hoặc phiên bản trang vừa thay đổi. Bản sổ tay đã lưu trên trình duyệt không bị xóa.</p><button type="button" className="mig-button outline" onClick={()=>location.reload()}>Thử tải lại trang</button></section>:this.props.children;}}

import {Link,useRoute,RoutePosition,navigate} from './migration/navigation';import {findCourse} from './migration/catalogue';
export default function App(){const route=useRoute();const path=route.pathname;const alias=legacyLearningAlias(path,route.search,route.hash);useEffect(()=>{if(alias)navigate(alias,{replace:true});},[alias]);const slug=path.startsWith('/khoa-hoc/')?path.slice('/khoa-hoc/'.length):'';const course=slug?findCourse(slug):undefined;const name=path==='/'?'Học cùng MTM':path==='/khoa-hoc'?'Khóa học Toán':course?.title||({ '/thi-thu':'Thi thử và bài tập','/so-tay':'Sổ tay học tập','/tai-lieu':'Thư viện học liệu','/huong-dan':'Hướng dẫn học sinh, phụ huynh'} as Record<string,string>)[path]||'Không tìm thấy trang';
useEffect(()=>{const click=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const target=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href^="#"]'):null;const hash=target?.getAttribute('href');if(hash&&hash.length>1){event.preventDefault();if(hash==='#main-content'){navigate(location.pathname+location.search+hash);}else if(hash==='#tai-lieu-tham-khao'){navigate('/tai-lieu'+hash);}else{navigate('/'+hash);}}};document.addEventListener('click',click);return()=>document.removeEventListener('click',click);},[]);
const metadata=routeMetadata(path,location.hostname,route.search);
return <SEOProvider><SEO {...metadata}/><StructuredData/><div className={'mtm-migration r106-site'+(path!=='/'?' is-learning':' r106-home-page')}><a className="mtm-skip" href="#main-content">Đến nội dung chính</a>{!(path==='/btvn'||path.startsWith('/btvn/'))&&<><MigrationHeader pathname={path}/><PreviewNotice/>{path!=='/'&&path!=='/xep-hang'&&!path.startsWith('/quan-tri')&&<Suspense fallback={null}><HonorTicker/></Suspense>}</>}<main id="main-content" tabIndex={-1}><RouteError key={path}><Suspense fallback={<div className="mig-container mig-route-loading" role="status" aria-live="polite">Đang tải nội dung…</div>}>{path==='/'?<Home/>:path==='/khoa-hoc'?<Catalogue search={route.search}/>:course?<CourseDetail key={course.slug} course={course}/>:path.startsWith('/bai-hoc/')?<NativeLesson key={path+route.search} pathname={path} search={route.search}/>:path==='/thi-thu'||path.startsWith('/thi-thu/')?(publicSnapshot.exams.some(x=>path==='/thi-thu/'+x.id)?<NativeResources kind="exams" pathname={path} search={route.search}/>:<NativeExams pathname={path} search={route.search}/>):path==='/luyen-tap'?<PracticeLibrary/>:path==='/xep-hang'?<RankArena/>:(path==='/btvn'||path.startsWith('/btvn/'))?<HomeworkSession key={path} pathname={path} profileControl={state=><Suspense fallback={null}><StudentAppearanceButton identity={state.fullName+'|'+state.className} autoOpen={import.meta.env.DEV&&state.demo&&['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(route.search).get('demo-profile')==='1'}/></Suspense>}/>:path==='/quan-tri/btvn'?<AdminHomework/>:path==='/quan-tri/de-thi'?<AdminExams/>:path==='/so-tay'?<Notebook/>:path==='/huong-dan'?<Guide/>:path==='/san-choi'?<Playground/>:path==='/tai-lieu'||path.startsWith('/tai-lieu/')?<NativeResources kind="documents" pathname={path} search={route.search}/>:alias?<section className="mig-container mig-panel" role="status"><h1>Đang mở trang</h1><p>{alias.startsWith('/btvn')?'Góc học tập nằm ở BTVN.':'Bảng điểm công khai nằm ở bảng xếp hạng. Điểm riêng vẫn ở BTVN sau khi đăng nhập.'}</p></section>:<NotFound/>}<R106SiteTheme/></Suspense></RouteError></main><Footer/><FloatingContact pathname={path} search={route.search}/><AccessDialog/><RoutePosition pathname={path} hash={route.hash}/><Toaster position="top-center"/></div></SEOProvider>;
}

import './migration/r106-chrome.css';
