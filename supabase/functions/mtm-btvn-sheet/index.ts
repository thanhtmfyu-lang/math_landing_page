// Xuất CSV bảng điểm BTVN + bảng xếp hạng cho Google Sheet (IMPORTDATA). Chỉ đọc, cần mã ?t= khớp MTM_SHEET_TOKEN.
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_SHEET_TOKEN") ?? "";
// Mã riêng cho Apps Script (gửi qua header, nằm trong Script Properties), tách khỏi mã ?t= của IMPORTDATA.
const MA_SCRIPT = Deno.env.get("MTM_SHEET_SCRIPT_TOKEN") ?? "";

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Apps Script gửi ScriptApp.getIdentityToken() (Google ký): chỉ nhận đúng email chủ Sheet (secret MTM_SHEET_SCRIPT_EMAIL), không cần mã bí mật trong script.
const EMAIL_CHU = (Deno.env.get("MTM_SHEET_SCRIPT_EMAIL") ?? "").toLowerCase();
async function laChuSheet(req: Request): Promise<boolean> {
  const m = /^Bearer ([A-Za-z0-9._-]{100,4096})$/.exec(req.headers.get("authorization") ?? "");
  if (!m || !EMAIL_CHU) return false;
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + m[1]);
  if (!r.ok) return false;
  const t = await r.json() as Record<string, string>;
  return ["accounts.google.com", "https://accounts.google.com"].includes(t.iss) && String(t.email_verified) === "true"
    && (t.email ?? "").toLowerCase() === EMAIL_CHU && Number(t.exp) * 1000 > Date.now();
}

// 059: Apps Script của Sheet tổng gọi POST {op:'feedback',after} với header x-mtm-sheet-token (mã KHÔNG nằm trong URL):
// trả tối đa 5 phản hồi có id > after, kèm ảnh bằng chứng base64 tải từ bucket riêng tư.
async function phanHoi(req: Request): Promise<Response> {
  if (!(MA_SCRIPT && bang(req.headers.get("x-mtm-sheet-token") ?? "", MA_SCRIPT)) && !(await laChuSheet(req))) return new Response("forbidden", { status: 403 });
  let b: { op?: string; after?: number };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (b.op !== "feedback" || !Number.isSafeInteger(b.after ?? 0)) return Response.json({ error: "bad op" }, { status: 400 });
  const h = { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" };
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_btvn_feedback_since`, { method: "POST", headers: h, body: JSON.stringify({ p_after: b.after ?? 0, p_limit: 5 }) });
  if (!r.ok) return new Response("loi du lieu " + r.status, { status: 502 });
  const rows = await r.json() as Record<string, unknown>[];
  for (const row of rows) {
    const path = row.imagePath;
    if (typeof path !== "string" || !/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}\.png$/.test(path)) continue;
    const img = await fetch(`${URL_DB}/storage/v1/object/mtm-feedback-proof/${path}`, { headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}` } });
    if (!img.ok) continue;
    const bytes = new Uint8Array(await img.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    row.imagePng = btoa(s);
  }
  return Response.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "POST") return await phanHoi(req);
  const u = new URL(req.url);
  const tab = u.searchParams.get("tab") ?? "";
  if (req.method !== "GET" || !MA || !bang(u.searchParams.get("t") ?? "", MA)) return new Response("forbidden", { status: 403 });
  if (!["diem", "xephang", "diemdanh", "zoom", "vantay", "chuyenbuoi", "cahomnay", "cachitiet", "tongquan", "hocsinh", "phanhoi"].includes(tab)) return new Response("bad tab", { status: 400 });
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_btvn_sheet_csv5`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tab: tab }),
  });
  if (!r.ok) return new Response("loi du lieu " + r.status, { status: 502 });
  const csv: string = await r.json();
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
});
