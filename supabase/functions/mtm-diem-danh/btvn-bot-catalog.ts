// Action "btvn_bot_catalog" chuyển nguyên payload sang RPC catalog BTVN chỉ đọc.
export function isBtvnBotCatalog(p: unknown): boolean {
  return !!p && typeof p === "object" && (p as { action?: unknown }).action === "btvn_bot_catalog";
}

export async function btvnBotCatalog(p: unknown, db: { url: string; key: string }, call: typeof fetch = fetch): Promise<Response> {
  const r = await call(`${db.url}/rest/v1/rpc/mtm_btvn_bot_catalog`, {
    method: "POST",
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p }),
  });
  const t = await r.text();
  return new Response(t, { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
