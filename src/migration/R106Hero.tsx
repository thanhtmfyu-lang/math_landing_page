import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type TouchEvent} from 'react';
import {ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, X} from 'lucide-react';
import {courses, step as courseStep, displayCourseTitle} from './catalogue';
import {Link} from './navigation';
import {SocialLinks} from '../components/SocialLinks';
import './R106Hero.css';

const photographs = [
  {src: '/r104-photos/classroom-original.png', tab: 'Lớp học', caption: 'Một khoảnh khắc cùng lớp', alt: 'Ảnh lớp học Minh Thành Math từ thư viện MTM'},
  {src: '/r104-photos/learning-original.webp', tab: 'Học cùng MTM', caption: 'Học cùng thầy cô và những người bạn', alt: 'Thầy và các bạn cùng học tại Minh Thành Math'},
  {src: '/r104-photos/teacher-original.jpg', tab: 'Thầy Thành', caption: 'Thầy Tô Minh Thành', alt: 'Ấn phẩm giới thiệu thầy Tô Minh Thành được giữ nguyên từ MTM'},
] as const;
const programmes = ['THCS', 'Toán 10 & 11', 'Toán 12', 'HSA'] as const;
const labels = ['Nền tảng', 'Vận dụng', 'Nâng cao', 'Luyện đề', 'HSA'];
const roadmap = [1, 2, 3, 4, 5].map(n => courses.find(course => course.grade === 12 && courseStep(course) === n));
type Programme = typeof programmes[number];
type Variables = CSSProperties & Record<`--${string}`, string | number>;
const wrap = (n: number) => (n + photographs.length) % photographs.length;

/** R100.6 composition, with the real course catalogue and native navigation. */
export default function R106Hero() {
  const [programme, setProgramme] = useState<Programme>('Toán 12');
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [photo, setPhoto] = useState(1);
  const [shown, setShown] = useState(1);
  const [incoming, setIncoming] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [view, setView] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const imageLayer = useRef<HTMLImageElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const shownRef = useRef(shown);
  const generation = useRef(0);
  const gesture = useRef<{x: number; y: number} | null>(null);
  const suppressOpenUntil = useRef(0);
  const thumbnailBar = useRef<HTMLDivElement>(null);
  const album = useRef<HTMLDivElement>(null);
  shownRef.current = shown;
  const guided = programme === 'THCS' || programme === 'Toán 10 & 11';
  const effectiveStep = programme === 'HSA' ? 4 : selected;
  const course = roadmap[effectiveStep];
  const courseTitle = guided ? programme === 'THCS' ? 'Học chắc nền tảng Toán THCS' : 'Từng bước vững Toán 10 & 11' : (course && displayCourseTitle(course)) || 'Tìm lộ trình phù hợp';
  const courseHref = guided ? '/#courses' : course ? '/khoa-hoc/' + encodeURIComponent(course.slug) : '/khoa-hoc';

  useEffect(() => {
    const token = ++generation.current;
    setIncoming(null);
    setPhotoError('');
    if (shownRef.current === photo) {setPhotoStatus('idle'); return;}
    setPhotoStatus('loading');
    let disposed = false;
    const preload = new Image();
    preload.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {preload.onload = () => resolve(); preload.onerror = () => reject(new Error('image-unavailable'));});
    preload.src = photographs[photo].src;
    // Both promises have rejection handlers immediately, including browsers with decode().
    const ready = typeof preload.decode === 'function' ? Promise.all([loaded, preload.decode()]) : loaded;
    void ready.then(() => {
      if (disposed || generation.current !== token) return;
      setPhotoStatus('idle');
      if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) setShown(photo);
      else setIncoming(photo);
    }).catch(() => {if (!disposed && generation.current === token) {setPhotoStatus('error'); setPhotoError('Chưa tải được ảnh này. Ảnh hiện tại vẫn được giữ.');}});
    return () => {disposed = true; preload.onload = null; preload.onerror = null;};
  }, [photo, paused, photoAttempt]);

  useLayoutEffect(() => {
    if (incoming === null) return;
    const layer = imageLayer.current;
    if (!layer) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    const commit = () => {if (!disposed) {setShown(incoming); setIncoming(null);}};
    if (paused || media.matches || typeof layer.animate !== 'function') {commit(); return;}
    const animation = layer.animate([{opacity: 0, transform: 'translateX(0px)'}, {opacity: 1, transform: 'translateX(0)'}], {duration: 360, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'});
    const change = () => {if (media.matches) commit();};
    media.addEventListener('change', change);
    void animation.finished.then(commit).catch(() => {});
    return () => {disposed = true; animation.cancel(); media.removeEventListener('change', change);};
  }, [incoming, paused]);

  useLayoutEffect(() => {
    const bar = thumbnailBar.current;
    if (!bar) return;
    const measure = () => {const target = bar.children[shown] as HTMLElement | undefined; if (!target) return; bar.style.setProperty('--tab-x', target.offsetLeft + 'px'); bar.style.setProperty('--tab-y', target.offsetTop + 'px'); bar.style.setProperty('--tab-w', target.offsetWidth + 'px'); bar.style.setProperty('--tab-h', target.offsetHeight + 'px');};
    const observer = new ResizeObserver(measure);
    observer.observe(bar); measure();
    return () => observer.disconnect();
  }, [shown]);


  useEffect(()=>{const el=album.current;if(!el)return;const reduce=matchMedia('(prefers-reduced-motion:reduce)');let raf=0,last=0,x=0,y=0,tx=0,ty=0;
    const draw=(t:number)=>{raf=0;const a=1-Math.exp(-Math.min((t-(last||t-16))/1000,.05)*12);last=t;x+=(tx-x)*a;y+=(ty-y)*a;el.style.setProperty('--px',x.toFixed(3));el.style.setProperty('--py',y.toFixed(3));if(Math.abs(tx-x)+Math.abs(ty-y)>.005)raf=requestAnimationFrame(draw);else last=0};
    const move=(e:PointerEvent)=>{if(paused||reduce.matches||e.pointerType==='touch')return;const r=el.getBoundingClientRect();tx=(e.clientX-r.left)/r.width-.5;ty=(e.clientY-r.top)/r.height-.5;if(!raf)raf=requestAnimationFrame(draw)};
    const leave=()=>{tx=ty=0;if(!raf)raf=requestAnimationFrame(draw)};const reset=()=>{cancelAnimationFrame(raf);raf=0;x=y=tx=ty=0;el.style.setProperty('--px','0');el.style.setProperty('--py','0')};reset();el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerleave',leave);reduce.addEventListener('change',reset);return()=>{reset();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);reduce.removeEventListener('change',reset)};
  },[paused]);
  const advance = (delta: number) => setPhoto(current => wrap(current + delta));
  const openPhoto = () => {if (performance.now() < suppressOpenUntil.current) return; opener.current = document.activeElement as HTMLElement; setView(shownRef.current); dialog.current?.showModal();};
  const photoKeys = (event: KeyboardEvent) => {if (event.altKey || event.ctrlKey || event.metaKey) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1);}};
  const touchEnd = (event: TouchEvent) => {const start = gesture.current; gesture.current = null; const end = event.changedTouches[0]; if (!start || !end) return; const dx = end.clientX - start.x, dy = end.clientY - start.y; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {suppressOpenUntil.current = performance.now() + 550; advance(dx < 0 ? 1 : -1);}};
  const selectStep = (next: number) => {setSelected(next); setProgramme('Toán 12');};
  const roadmapKeys = (event: KeyboardEvent<HTMLDivElement>) => {let next: number; if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (effectiveStep + 1) % 5; else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (effectiveStep + 4) % 5; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = 4; else return; event.preventDefault(); selectStep(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();};

  return <section className="r106-hero" id="home" aria-labelledby="r106-home-title" data-motion-paused={paused}>
    <div className="r106-workspace">
      <GoldenArch selected={effectiveStep} programme={programme} paused={paused}/>
      <header className="r106-intro"><div><p className="r106-eyebrow"><span/> TOÁN THCS · THPT · HSA</p><h1 id="r106-home-title">Hiểu bản chất.<br/><em>Vững từng bước.</em></h1></div><div className="r106-welcome"><p>Học Toán cùng thầy cô và những người bạn.<br/>Từ nền tảng đến vận dụng.</p><div className="mtm-hero-actions"><Link href="/#courses" className="r106-primary">Tìm lớp phù hợp <span><ArrowUpRight size={19}/></span></Link><SocialLinks label="Kênh MTM cạnh nút tìm lớp"/><Link href="/btvn" className="r106-text-link">Vào BTVN <ArrowRight size={17}/></Link></div></div></header>
      <aside className="r106-programmes" aria-label="Chương trình học">
        <span className="r106-kicker">CHỌN ĐIỂM BẮT ĐẦU</span>
        <div className="r106-programme-nav" style={{'--programme': programmes.indexOf(programme)} as Variables}>{programmes.map((item, index) => <button type="button" key={item} aria-pressed={item === programme} onClick={() => setProgramme(item)}><small>0{index + 1}</small><strong>{item}</strong><ArrowUpRight size={17}/></button>)}</div>
        <label className="r106-programme-select"><span>Chương trình của em</span><select value={programme} onChange={event => setProgramme(event.target.value as Programme)}>{programmes.map(item => <option key={item}>{item}</option>)}</select></label>
        <div className="r106-programme-note"><i/><p>Mỗi bạn một điểm bắt đầu.<br/>Tìm lộ trình phù hợp cùng MTM.</p></div><Link className="r106-schedule" href="/#timetable">Xem lịch học <ArrowUpRight size={16}/></Link>
      </aside>
      <div className="r106-album" ref={album}>
        <div className="r106-photo-top"><span><i/> CÓ TOÁN. CÓ BẠN. CÓ MTM.</span><span aria-live="polite">0{shown+1} / 03</span></div>
        <div className="r106-photo-plane"><button ref={photoButton} className="r106-photo" type="button" aria-label="Mở ảnh MTM đầy đủ" aria-busy={photoStatus === 'loading'} onClick={openPhoto} onKeyDown={photoKeys} onTouchStart={event => {const touch = event.touches[0]; gesture.current = event.touches.length === 1 ? {x: touch.clientX, y: touch.clientY} : null;}} onTouchEnd={touchEnd} onTouchCancel={() => {gesture.current = null;}} onDragStart={event => event.preventDefault()}>
          <img className="r106-photo-front" src={photographs[shown].src} alt={photographs[shown].alt} width={2048} height={1282} decoding="async" draggable={false}/>
          {incoming !== null && <img ref={imageLayer} className="r106-incoming" src={photographs[incoming].src} alt="" aria-hidden="true" width={2048} height={1282} decoding="async" draggable={false}/>}
        </button></div>
        <div className="r106-photo-dock"><div className="r106-photo-tabs" ref={thumbnailBar} role="group" aria-label="Chọn ảnh MTM" onKeyDown={event=>{const items=Array.from(event.currentTarget.querySelectorAll('button')),at=items.indexOf(document.activeElement as HTMLButtonElement);let next:number;if(event.key==='ArrowRight')next=wrap(at+1);else if(event.key==='ArrowLeft')next=wrap(at-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();setPhoto(next);items[next]?.focus();}}>{photographs.map((item, index) => <button type="button" key={item.src} aria-pressed={shown === index} tabIndex={shown===index?0:-1} className={shown===index?'selected':''} onClick={() => setPhoto(index)}><img src={item.src} alt="" width={90} height={82} decoding="async"/><span>{item.tab}</span></button>)}</div><div className="r106-photo-controls"><button type="button" aria-label="Ảnh MTM trước" onClick={()=>advance(-1)}><ChevronLeft size={18}/></button><button type="button" aria-label="Mở ảnh MTM đang hiển thị" onClick={openPhoto}><ArrowUpRight size={18}/></button><button type="button" aria-label="Ảnh MTM sau" onClick={()=>advance(1)}><ChevronRight size={18}/></button></div></div>
        <span className="r106-photo-note" aria-live="polite">{photoStatus === 'loading' ? 'Đang tải ảnh '+photographs[photo].tab+'. Ảnh hiện tại vẫn được giữ.' : photographs[shown].caption}</span>{photoError && <p className="r106-image-error" role="status">{photoError} <button className="r106-image-retry" type="button" onClick={() => {if (photoStatus === 'error') {photoButton.current?.focus(); setPhotoAttempt(value => value + 1);}}}>Thử tải lại ảnh</button></p>}
      </div>
      <article className="r106-course" aria-label="Lộ trình của em">
        <div className="r106-course-top"><span>LỘ TRÌNH CỦA EM</span><span>{guided ? 'LỚP HỌC' : programme === 'Toán 12' ? 'TOÁN 12' : 'HSA'}</span></div>
        <div className="r106-course-heading"><span className="r106-course-number" aria-hidden="true">{guided ? '↗' : '0' + (effectiveStep + 1)}</span><h2>{courseTitle.startsWith('Step ') ? <><small>{courseTitle.split(':')[0]}:</small>{courseTitle.split(':').slice(1).join(':').trim()}</> : courseTitle}</h2></div>
        {guided ? <div className="r106-guidance"><p>Học chắc nền tảng, rèn cách trình bày và tìm lớp phù hợp tiến độ ở trường.</p><Link href="/#timetable" className="r106-text-link">Xem lịch tham chiếu <ArrowRight size={16}/></Link></div> : <div className="r106-dial"><div className="r106-dial-label"><span>Chọn bước phù hợp</span><strong>0{effectiveStep+1} / 05</strong></div><div className="r106-roadmap" role="group" aria-label="Chọn khóa học" onKeyDown={roadmapKeys}>{labels.map((label, index) => <button type="button" key={label} aria-label={`Khóa ${index + 1}: ${label}`} aria-pressed={effectiveStep === index} className={effectiveStep===index?'selected':''} tabIndex={effectiveStep === index ? 0 : -1} onClick={() => selectStep(index)}><span className="r106-node">0{index + 1}</span><small>{label}</small></button>)}</div><p className="r106-dial-note">Từ hiểu bản chất đến tự tin vận dụng.</p></div>}
        <Link href={courseHref} className="r106-course-explore"><span>{guided ? 'Tìm lớp phù hợp' : 'Xem nội dung khóa học'}</span><span><ArrowUpRight size={19}/></span></Link>
        <div className="r106-course-foot"><span>Hiểu điều kiện.<br/>Trình bày có căn cứ.</span><div><button type="button" aria-label="Khóa học trước" onClick={() => selectStep((effectiveStep + 4) % 5)}><ChevronLeft size={16}/></button><button type="button" aria-label="Khóa học tiếp theo" onClick={() => selectStep((effectiveStep + 1) % 5)}><ChevronRight size={16}/></button></div></div>
      </article>
      <button className="r106-motion-control" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12}/> : <Pause size={12}/>} {paused ? 'Bật' : 'Dừng'} chuyển động</button>
    </div>
    <div className="r106-bottom"><span>Học chắc từng bước. Tiến bộ cùng nhau.</span><nav aria-label="Học cùng MTM"><Link href="/de-giua-ky-1">Thi thử giữa kỳ I <ArrowUpRight size={15}/></Link><Link href="/kiem-tra-dau-vao">Kiểm tra đầu vào miễn phí <ArrowUpRight size={15}/></Link><Link href="/btvn">Bài tập về nhà <ArrowUpRight size={15}/></Link><Link href="/#timetable">Lịch học <ArrowUpRight size={15}/></Link><a href="#home-leaderboard">Bảng xếp hạng <ArrowUpRight size={15}/></a></nav></div>
    <dialog ref={dialog} className="r106-photo-dialog" aria-label="Ảnh MTM đầy đủ" onClose={() => opener.current?.focus()} onClick={event => {if (event.target === dialog.current) dialog.current?.close();}} onKeyDown={event => {if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); setView(value => wrap(value + (event.key === 'ArrowRight' ? 1 : -1)));}}}>
      <div className="r106-dialog-head"><strong>{photographs[view].caption}</strong><button type="button" aria-label="Đóng ảnh" onClick={() => dialog.current?.close()}><X size={22}/></button></div><img src={photographs[view].src} alt={photographs[view].alt} decoding="async"/><div className="r106-dialog-controls"><button type="button" onClick={() => setView(value => wrap(value - 1))}>← Ảnh trước</button><span>{view + 1} / 3</span><button type="button" onClick={() => setView(value => wrap(value + 1))}>Ảnh sau →</button></div>
    </dialog>
  </section>;
}

function GoldenArch({selected, programme, paused}: {selected: number; programme: Programme; paused: boolean}) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useRef({paused}); settings.current.paused = paused;
  const id = useId().replace(/:/g, '');
  useLayoutEffect(() => {
    const el = host.current, area = el?.parentElement;
    if (!el || !area) return;
    const svg = el.querySelector('svg')!, paths = el.querySelectorAll<SVGPathElement>('path');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, last = 0, current: number[] | null = null, target: number[] | null = null, visible = true, disposed = false;
    const wake = () => {if (!disposed && !raf && visible && !document.hidden) raf = requestAnimationFrame(draw);};
    const measure = () => {
      const photo = area.querySelector('.r106-album'), node = area.querySelector('.r106-roadmap button[aria-pressed="true"] .r106-node') || area.querySelector('.r106-course-explore');
      if (!photo || !node) return;
      const a = area.getBoundingClientRect(), p = photo.getBoundingClientRect(), n = node.getBoundingClientRect(), rail = area.querySelector('.r106-programme-nav')?.getBoundingClientRect();
      const compact = innerWidth <= 760;
      target = [p.left - a.left, p.top - a.top, p.width, p.height, n.left - a.left + n.width / 2, n.top - a.top + n.height / 2, rail?.width ? rail.right - a.left + 44 : compact ? -8 : -10000, compact ? a.width - 2 : a.width + 300];
      svg.setAttribute('viewBox', `0 0 ${a.width} ${a.height}`);
      if (!current || settings.current.paused || media.matches) current = target.slice();
      wake();
    };
    function draw(time: number) {
      raf = 0; if (!current || !target) return;
      const ease = settings.current.paused || media.matches ? 1 : 1 - Math.exp(-Math.min((time - (last || time - 16)) / 1000, .05) * 13); last = time;
      current = current.map((value, index) => value + (target![index] - value) * ease);
      const [x, y, width, height, ex, ey, limit, edge] = current, right = Math.min(x + width, edge), gap = Math.min(right + 27, edge);
      const d = innerWidth <= 760
        ? `M ${Math.max(x-9,8)} ${y+height*.75} C ${Math.max(x-22,8)} ${y+38}, ${x+width*.28} ${y-10}, ${right-30} ${y+2} C ${Math.min(right+6,edge)} ${y+18}, ${Math.min(right+6,edge)} ${ey-30}, ${Math.min(gap,edge)} ${ey-20} S ${ex-20} ${ey-3}, ${ex} ${ey}`
        : `M ${Math.max(x - 40, limit)} ${y + height * .81} C ${Math.max(x - 112, limit)} ${y + 44}, ${x + width * .3} ${y - 92}, ${right - 35} ${y - 17} C ${Math.min(right + 47, edge)} ${y - 1}, ${gap - 8} ${ey - 35}, ${Math.min(gap + 15, edge)} ${ey - 20} S ${ex - 20} ${ey - 3}, ${ex} ${ey}`;
      paths.forEach(path => path.setAttribute('d', d)); el!.dataset.frames=String(Number(el!.dataset.frames||0)+1);
      if (current.some((value, index) => Math.abs(value - target![index]) > .08)) wake(); else last = 0;
    }
    const mutation = new MutationObserver(measure); mutation.observe(el, {attributes: true, attributeFilter: ['data-step', 'data-programme', 'data-paused']});
    const resize = new ResizeObserver(measure); resize.observe(area); for (const child of area.querySelectorAll('.r106-album,.r106-course')) resize.observe(child);
    const intersection = new IntersectionObserver(entries => {visible = entries[0].isIntersecting; if (visible) measure(); else {cancelAnimationFrame(raf); raf = 0; last = 0;}}); intersection.observe(area);
    const visibility = () => {if (document.hidden) {cancelAnimationFrame(raf); raf = 0; last = 0;} else measure();};
    void document.fonts.ready.then(() => {if (!disposed) measure();});
    media.addEventListener('change', measure); document.addEventListener('visibilitychange', visibility); measure();
    return () => {disposed = true; cancelAnimationFrame(raf); mutation.disconnect(); resize.disconnect(); intersection.disconnect(); media.removeEventListener('change', measure); document.removeEventListener('visibilitychange', visibility);};
  }, []);
  return <div ref={host} className="r106-arch" aria-hidden="true" data-step={selected} data-programme={programme} data-paused={paused}><svg preserveAspectRatio="none"><defs><linearGradient id={'r106-gold-' + id} x1="0" y1="0" x2=".75" y2="1"><stop stopColor="#fff4b2"/><stop offset=".19" stopColor="#ffcf24"/><stop offset=".4" stopColor="#ffe983"/><stop offset=".55" stopColor="#ffcf24"/><stop offset=".8" stopColor="#e4b622"/><stop offset="1" stopColor="#fff0a1"/></linearGradient><filter id={'r106-shadow-' + id} x="-20%" y="-45%" width="145%" height="200%"><feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#213269" floodOpacity=".11"/></filter></defs><g fill="none" strokeLinecap="round" filter={`url(#r106-shadow-${id})`}><path stroke="#d5ab24" strokeWidth="43"/><path stroke={`url(#r106-gold-${id})`} strokeWidth="41"/><path stroke="#fff4b2" strokeWidth="32" opacity=".2"/><path stroke="#fff8cf" strokeWidth="1" opacity=".55"/></g></svg></div>;
}
