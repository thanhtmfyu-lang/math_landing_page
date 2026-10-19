// Bảng tin trung tâm (19/10/2026) cho Javis: POST JSON {action,...}, header x-mtm-token = MTM_DD_TOKEN (dùng chung với mtm-diem-danh).
// nhan_anh {group, groupLabel, sourceMsg, sentAt, sender?, caption?, width?, height?, image (base64 jpeg/png/webp <= 6MB)}
//   -> lưu bucket riêng tư mtm-bang-tin, tên file = sha256 nội dung (gửi lại không tạo bản mới) -> mtm_bang_tin_nhan_anh.
// cho_duyet {limit?} -> bài đang chờ kèm link ảnh ký 15 phút để bước duyệt xem ảnh.
// duyet {postId, photoIds?, title?, summary?, kind?, pinned?, reviewer?, note?} | an {postId? | photoId?}. Xem migration 071.
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_DD_TOKEN") ?? "";
const H = { apikey: KHOA, Authorization: `Bearer ${KHOA}` };
const BUCKET = "mtm-bang-tin";

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function rpc(name: string, body: unknown): Promise<Response> {
  const r = await fetch(`${URL_DB}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return new Response(await r.text(), { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function imageType(b: Uint8Array): [string, string] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["jpg", "image/jpeg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["png", "image/png"];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ["webp", "image/webp"];
  return null;
}
const str = (v: unknown, max: number) => typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

Deno.serve(async (req) => {
  if (req.method !== "POST" || !MA || !bang(req.headers.get("x-mtm-token") ?? "", MA)) return new Response("forbidden", { status: 403 });
  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (!p || typeof p !== "object") return Response.json({ error: "bad json" }, { status: 400 });

  if (p.action === "nhan_anh") {
    const group = str(p.group, 120), source = str(p.sourceMsg, 200), sentAt = str(p.sentAt, 40), b64 = typeof p.image === "string" ? p.image : "";
    if (!group || !source || !sentAt || !Number.isFinite(Date.parse(sentAt)) || !b64) return Response.json({ error: "thiếu group, sourceMsg, sentAt hoặc image" }, { status: 400 });
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b64.replace(/^data:image\/[a-z]+;base64,/, "")), (c) => c.charCodeAt(0)); }
    catch { return Response.json({ error: "image phải là base64" }, { status: 400 }); }
    const type = bytes.length >= 12 && bytes.length <= 6291456 ? imageType(bytes) : null;
    if (!type) return Response.json({ error: "image phải là JPEG, PNG hoặc WebP <= 6MB" }, { status: 400 });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
    const month = new Date(Date.parse(sentAt) + 7 * 3600_000).toISOString().slice(0, 7);
    const path = `${month}/${hash}.${type[0]}`;
    const up = await fetch(`${URL_DB}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...H, "Content-Type": type[1], "x-upsert": "false" }, body: bytes });
    // Cùng nội dung đã có (409 / 400 Duplicate) thì dùng lại, tên file là băm nội dung nên không thể ghi đè ảnh khác.
    if (!up.ok && ![400, 409].includes(up.status)) return Response.json({ error: "upload failed" }, { status: 502 });
    const int = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 20000 ? v : null;
    return rpc("mtm_bang_tin_nhan_anh", { p_group: group, p_group_label: str(p.groupLabel, 60), p_source_msg: source, p_path: path, p_sent_at: sentAt,
      p_sender_role: str(p.sender, 60), p_width: int(p.width), p_height: int(p.height), p_caption: str(p.caption, 200) });
  }
  if (p.action === "cho_duyet") {
    const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_bang_tin_cho_duyet`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ p_limit: Number.isInteger(p.limit) ? p.limit : 60 }) });
    if (!r.ok) return Response.json({ error: "queue_unavailable" }, { status: 502 });
    const posts = await r.json() as { photos: { path: string; url?: string }[] | null }[];
    const paths = posts.flatMap((x) => (x.photos ?? []).map((f) => f.path));
    if (paths.length) {
      const s = await fetch(`${URL_DB}/storage/v1/object/sign/${BUCKET}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 900, paths }) });
      if (!s.ok) return Response.json({ error: "sign failed" }, { status: 502 });
      const map = new Map((await s.json() as { path: string; signedURL: string | null }[]).filter((x) => x.signedURL).map((x) => [x.path, `${URL_DB}/storage/v1${x.signedURL}`]));
      for (const x of posts) for (const f of x.photos ?? []) f.url = map.get(f.path);
    }
    return Response.json({ ok: true, posts });
  }
  if (p.action === "duyet") {
    const ids = Array.isArray(p.photoIds) ? p.photoIds.filter((x) => typeof x === "string") : null;
    return rpc("mtm_bang_tin_duyet", { p_post: str(p.postId, 80), p_photo_ids: ids, p_title: str(p.title, 120), p_summary: typeof p.summary === "string" ? p.summary.slice(0, 1500) : null,
      p_kind: str(p.kind, 20), p_pinned: typeof p.pinned === "boolean" ? p.pinned : null, p_reviewer: str(p.reviewer, 60) ?? "cong-ty", p_note: str(p.note, 300) });
  }
  if (p.action === "an") return rpc("mtm_bang_tin_an", { p_post: str(p.postId, 80), p_photo: str(p.photoId, 40) });
  return Response.json({ error: "action không hỗ trợ" }, { status: 400 });
});
