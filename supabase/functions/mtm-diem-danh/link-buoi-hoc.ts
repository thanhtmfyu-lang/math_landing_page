// 29/10/2026: action "link_buoi_hoc" cho bot Zalo làm mới bản link buổi học mỗi giờ (VPS chỉ có MTM_DD_TOKEN, không có khóa service_role).
// Chuyển sang RPC chỉ đọc mtm_bot_link_buoi_hoc (migration 20261029_2030): lớp, ngày, tên bài, loại bài, cờ có video/handout.
const NGAY = /^\d{4}-\d{2}-\d{2}$/;

export function isLinkBuoiHoc(p: unknown): boolean {
  return !!p && typeof p === "object" && (p as { action?: unknown }).action === "link_buoi_hoc";
}

export async function linkBuoiHoc(p: unknown, db: { url: string; key: string }, call: typeof fetch = fetch): Promise<Response> {
  const { from, to } = p as { from?: unknown; to?: unknown };
  if (typeof from !== "string" || typeof to !== "string" || !NGAY.test(from) || !NGAY.test(to)) {
    return Response.json({ error: "bad_range" }, { status: 400 });
  }
  const r = await call(`${db.url}/rest/v1/rpc/mtm_bot_link_buoi_hoc`, {
    method: "POST",
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_from: from, p_to: to }),
  });
  const t = await r.text();
  return new Response(t, { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
