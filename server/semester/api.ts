import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {allowedBtvnOrigin} from '../btvn/origin-policy';

type Env = Record<string, string | undefined>;
type Req = {method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>};
type Res = {setHeader: (k: string, v: string) => void; status: (n: number) => {json: (v: unknown) => void}};
export const semesterSession = (cookie: unknown) => typeof cookie === 'string'
  ? cookie.split(';').map(s => s.trim()).find(s => /^mtm_btvn_demo=[a-f0-9]{64}$/.test(s))?.slice(14) || '' : '';
export function activationDigest(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[ -]/g, '');
  return /^[A-F0-9]{40}$/.test(code) ? createHash('sha256').update('mtm-hk1-book:' + code).digest('hex') : null;
}
const messages: Record<string, [number, string]> = {
  login: [401, 'Em đăng nhập BTVN trước để dùng đúng tài khoản học sinh.'],
  register: [403, 'Em đăng ký khóa ôn trước khi xem bài.'],
  closed: [403, 'Bài học chưa đến ngày mở.'], advanced: [403, 'Bài nâng cao cần mã kích hoạt trong sách MTM.'],
  limit: [403, 'Em đã dùng hết lượt xem của video này.'], missing: [404, 'Video chưa được mở.'],
  invalid: [400, 'Mã chưa hợp lệ hoặc đã được sử dụng.'], rate: [429, 'Em thử lại mã sau 15 phút hoặc nhắn Zalo 0967 365 413.'],
};
const fields:Record<string,string[]>={state:['action','grade'],play:['action','grade','video','requestId'],activate:['action','grade','code']};
export function createSemesterApi(getEnv: () => Env = () => process.env, clientFactory = createClient, clock = Date.now) {
  return async (req: Req, res: Res) => {
    res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'POST') {res.setHeader('Allow', 'POST'); return res.status(405).json({message: 'Chỉ nhận POST.'});}
    const env = getEnv(), origin = req.headers.origin;
    if (typeof origin !== 'string' || origin !== `https://${req.headers.host}` || !allowedBtvnOrigin(origin, env))
      return res.status(403).json({message: 'Không thể mở khóa từ trang này.'});
    let b: any = req.body;
    try {if (typeof b === 'string') b = JSON.parse(b);} catch {b = null;}
    if (!b || typeof b !== 'object' || Array.isArray(b) || !['state', 'play', 'activate'].includes(b.action)
      || !['10', '11', '12'].includes(b.grade) || Object.keys(b).some(k => !(fields[b.action] || []).includes(k))
      || (b.action === 'play' && (typeof b.video !== 'string' || !/^hk1-(10|11|12)-w[1-4]-(core|advanced)$/.test(b.video) || typeof b.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestId)))
      || (b.action === 'activate' && !activationDigest(b.code))) return res.status(400).json({message: 'Yêu cầu không hợp lệ.'});
    const session = semesterSession(req.headers.cookie);
    if (!session) return res.status(401).json({message: messages.login[1]});
    if (env.MTM_SEMESTER_ENABLED === '0' || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      return res.status(503).json({message: 'Khóa ôn chưa mở trên máy chủ. Em nhắn Zalo 0967 365 413 để được hỗ trợ.'});
    try {
      if (new URL(env.SUPABASE_URL).protocol !== 'https:') throw Error('HTTPS required');
      const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
      const {data, error} = await db.rpc('mtm_hk1_access', {p_session: session, p_action: b.action, p_grade: b.grade,
        p_video: b.video || '', p_request: b.requestId || null, p_hash: b.action === 'activate' ? activationDigest(b.code) : ''});
      if (error || !data) throw Error('RPC unavailable');
      if (data.status !== 'ok') {if(data.status==='invalid'&&b.action==='play')return res.status(409).json({message:'Yêu cầu mở video không khớp. Em bấm mở lại.'});const [status, message] = messages[data.status] || [503, 'Chưa mở được bài học. Em thử lại sau.']; return res.status(status).json({message});}
      if (b.action !== 'play') return res.status(200).json(data);
      // Retry cùng request chỉ dùng thời hạn đã cấp; không kéo dài URL để lách lượt xem.
      const ttl = Math.min(3600, Math.floor((Date.parse(data.expiresAt) - clock()) / 1000));
      if (ttl < 1) return res.status(409).json({message: 'Lượt xem đã hết thời gian. Em mở một lượt mới.'});
      if (typeof data.path !== 'string' || !data.path.startsWith('hk1/') || data.path.includes('..')) throw Error('Invalid private path');
      const signed = await db.storage.from('mtm-semester').createSignedUrl(data.path, ttl);
      if (signed.error || !signed.data) throw Error('Storage unavailable');
      return res.status(200).json({url: signed.data.signedUrl, views: data.views, limit: data.limit, expiresAt: data.expiresAt});
    } catch {return res.status(503).json({message: 'Chưa mở được video. Em bấm thử lại để giữ nguyên lượt đã yêu cầu.'});}
  };
}
