const SECRET_KEY = /^(pin|otp|token|session|cookie|phone|sdt|password|secret|code|ma|matkhau|authorization|access_token)$/i;

function safeQuery(search: string): string {
  const incoming = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const kept = new URLSearchParams();
  for (const [key, value] of incoming) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key) || SECRET_KEY.test(key)) continue;
    const clean = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    if (!clean || /\d{9,}/.test(clean) || /^[0-9a-f]{32,}$/i.test(clean)) continue;
    kept.append(key, clean);
  }
  const text = kept.toString();
  return text ? '?' + text : '';
}

function safeHash(hash: string): string {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!body || !/^[A-Za-z0-9._:-]{1,80}$/.test(body)) return '';
  return '#' + body;
}

/** Alias cũ. Xác thực BTVN nằm ở cookie cùng origin, không nằm ở query.
 * Query giữ lại chỉ khi không giống mã, PIN, điện thoại hoặc token. /bang-diem không chuyển query sang trang công khai. */
export function legacyLearningAlias(pathname: string, search = '', hash = ''): string | null {
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('//')) return null;
  const path = (pathname.replace(/\/+$/, '') || '/').toLowerCase();
  if (path === '/goc-hoc-tap') return '/btvn' + safeQuery(search) + safeHash(hash);
  if (path === '/bang-diem') return '/xep-hang' + safeHash(hash);
  // 29/10: đường dẫn hay gõ nhầm trước đây ra 404 tiếng Anh của Vercel.
  if (['/dang-nhap', '/login', '/hoc-sinh', '/bai-tap', '/bai-tap-ve-nha'].includes(path)) return '/btvn';
  if (path === '/bang-tin') return '/';
  return null;
}
