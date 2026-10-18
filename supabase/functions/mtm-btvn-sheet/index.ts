// Xuất CSV bảng điểm BTVN + bảng xếp hạng cho Google Sheet (IMPORTDATA). Chỉ đọc, cần mã ?t= khớp MTM_SHEET_TOKEN.
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_SHEET_TOKEN") ?? "";

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const tab = u.searchParams.get("tab") ?? "";
  if (req.method !== "GET" || !MA || !bang(u.searchParams.get("t") ?? "", MA)) return new Response("forbidden", { status: 403 });
  if (!["diem", "xephang", "diemdanh", "zoom", "vantay", "chuyenbuoi"].includes(tab)) return new Response("bad tab", { status: 400 });
  const r = await fetch(`${URL_DB}/rest/v1/rpc/mtm_btvn_sheet_csv2`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tab: tab }),
  });
  if (!r.ok) return new Response("loi du lieu " + r.status, { status: 502 });
  const csv: string = await r.json();
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
});
