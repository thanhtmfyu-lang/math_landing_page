// API kho điểm danh chung cho Javis (bot Zalo) và máy quét Zoom: POST JSON {action,...}, header x-mtm-token = MTM_DD_TOKEN.
// action: link_buoi_hoc (bot Zalo, xem link-buoi-hoc.ts) | btvn_bot_catalog (bot Zalo, xem btvn-bot-catalog.ts) | find | move | cancel_move | mark | raw | session | moves | ... | pin_reset | pin_status | profile_update | missing_profile | phone_add. Xem migration 033-056.
import { feedbackImageSource, prepareFeedbackImages } from "./feedback-images.ts";
import { isLinkBuoiHoc, linkBuoiHoc } from "./link-buoi-hoc.ts";
import { isBtvnBotCatalog, btvnBotCatalog } from "./btvn-bot-catalog.ts";
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_DD_TOKEN") ?? "";

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !MA || !bang(req.headers.get("x-mtm-token") ?? "", MA)) return new Response("forbidden", { status: 403 });
  let p: unknown;
  try { p = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (isLinkBuoiHoc(p)) return linkBuoiHoc(p, { url: URL_DB, key: KHOA });
  if (isBtvnBotCatalog(p)) return btvnBotCatalog(p, { url: URL_DB, key: KHOA });
  // Tên file phụ thuộc source+hash ảnh, retry không tạo path mới hoặc ghi đè ảnh khác.
  // Lệnh đã có journal chỉ chuẩn hóa payload để RPC kiểm replay/conflict, không upload lại.
  let skipUploads = false;
  const imageSource = feedbackImageSource(p);
  if (imageSource) {
    const probe = await fetch(`${URL_DB}/rest/v1/rpc/mtm_dd_api15`, {
      method: "POST", headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p: { action: "sync_status", sourceMsg: imageSource } }),
    });
    if (!probe.ok) return Response.json({ error: "sync_status_unavailable" }, { status: 502 });
    const status = await probe.json();
    if (status?.ok !== true) return Response.json({ error: "sync_status_unavailable" }, { status: 502 });
    skipUploads = !!status.command;
  }
  try { await prepareFeedbackImages(p, { url: URL_DB, key: KHOA, skipUploads }); }
  catch (e) { return Response.json({ error: String((e as Error).message) }, { status: 400 }); }
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_dd_api15`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p }),
  });
  const t = await r.text();
  return new Response(t, { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
});
