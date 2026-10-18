// API kho điểm danh chung cho Javis (bot Zalo) và máy quét Zoom: POST JSON {action,...}, header x-mtm-token = MTM_DD_TOKEN.
// action: find | move | cancel_move | mark | raw | session | moves | ... | pin_reset | pin_status | profile_update | missing_profile. Xem migration 033-054.
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_DD_TOKEN") ?? "";

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// 053: feedback_add kèm imagePng (base64 PNG <= 2 MB, thẻ phản hồi ẩn danh do Javis vẽ) -> tải vào bucket công khai mtm-feedback-cards, thay bằng imageUrl.
async function taiAnhPhanHoi(p: unknown) {
  const o = p as Record<string, unknown>;
  if (!o || o.action !== "feedback_add") return;
  const rows = (Array.isArray(o.rows) ? o.rows : [o]) as Record<string, unknown>[];
  for (const row of rows) {
    const b64 = row.imagePng;
    delete row.imagePng;
    if (typeof b64 !== "string" || !b64) continue;
    const bytes = Uint8Array.from(atob(b64.replace(/^data:image\/png;base64,/, "")), (c) => c.charCodeAt(0));
    if (bytes.length > 2097152 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw Error("imagePng must be PNG <= 2MB");
    const ten = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
    const up = await fetch(`${URL_DB}/storage/v1/object/mtm-feedback-cards/${ten}`, {
      method: "POST", headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "image/png" }, body: bytes,
    });
    if (!up.ok) throw Error("upload failed");
    row.imageUrl = `${URL_DB}/storage/v1/object/public/mtm-feedback-cards/${ten}`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !MA || !bang(req.headers.get("x-mtm-token") ?? "", MA)) return new Response("forbidden", { status: 403 });
  let p: unknown;
  try { p = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  try { await taiAnhPhanHoi(p); } catch (e) { return Response.json({ error: String((e as Error).message) }, { status: 400 }); }
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_dd_api11`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p }),
  });
  const t = await r.text();
  return new Response(t, { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
});
