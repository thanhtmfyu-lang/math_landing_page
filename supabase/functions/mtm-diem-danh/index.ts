// API kho điểm danh chung cho Javis (bot Zalo) và máy quét Zoom: POST JSON {action,...}, header x-mtm-token = MTM_DD_TOKEN.
// action: find | move | cancel_move | mark | raw (kèm sessions thì tự đánh điểm danh) | session | moves. Xem migration 033, 034.
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
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_dd_api9`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p }),
  });
  const t = await r.text();
  return new Response(t, { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
});
