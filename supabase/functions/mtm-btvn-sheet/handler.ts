type SheetConfig = { databaseUrl: string; serviceKey: string; scriptToken: string; ownerEmail: string; legacyToken?: string };
type Fetcher = typeof fetch;
const TABS = new Set(["diem", "xephang", "diemdanh", "zoom", "vantay", "chuyenbuoi", "cahomnay", "cachitiet", "tongquan", "hocsinh", "phanhoi", "onchuongxs"]);
const PRIVATE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function equalSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function createSheetHandler(config: SheetConfig, fetcher: Fetcher = fetch) {
  const databaseHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" };

  // Giữ xác thực Google đã dùng cho đồng bộ ảnh phản hồi. CSV dùng Script Properties.
  async function isFeedbackOwner(req: Request): Promise<boolean> {
    const match = /^Bearer ([A-Za-z0-9._-]{100,4096})$/.exec(req.headers.get("authorization") ?? "");
    if (!match || !config.ownerEmail) return false;
    try {
      const response = await fetcher("https://oauth2.googleapis.com/tokeninfo?id_token=" + match[1]);
      if (!response.ok) return false;
      const token = await response.json() as Record<string, string>;
      return ["accounts.google.com", "https://accounts.google.com"].includes(token.iss)
        && String(token.email_verified) === "true"
        && (token.email ?? "").toLowerCase() === config.ownerEmail.toLowerCase()
        && Number(token.exp) * 1000 > Date.now();
    } catch { return false; }
  }

  async function feedback(req: Request): Promise<Response> {
    let body: { op?: string; after?: number };
    try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400, headers: PRIVATE }); }
    if (body.op !== "feedback" || !Number.isSafeInteger(body.after ?? 0) || (body.after ?? 0) < 0) {
      return Response.json({ error: "bad op" }, { status: 400, headers: PRIVATE });
    }
    const response = await fetcher(`${config.databaseUrl}/rest/v1/rpc/mtm_btvn_feedback_since`, {
      method: "POST", headers: databaseHeaders, body: JSON.stringify({ p_after: body.after ?? 0, p_limit: 5 }),
    });
    if (!response.ok) return new Response("loi du lieu " + response.status, { status: 502, headers: PRIVATE });
    const rows = await response.json() as Record<string, unknown>[];
    for (const row of rows) {
      const path = row.imagePath;
      if (typeof path !== "string" || !/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}\.png$/.test(path)) continue;
      const image = await fetcher(`${config.databaseUrl}/storage/v1/object/mtm-feedback-proof/${path}`, { headers: databaseHeaders });
      if (!image.ok) continue;
      const bytes = new Uint8Array(await image.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      row.imagePng = btoa(binary);
    }
    return Response.json({ rows }, { headers: PRIVATE });
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { ...PRIVATE, Allow: "GET, POST" } });
    const hasHeader = equalSecret(req.headers.get("x-mtm-sheet-token") ?? "", config.scriptToken);
    // Lùi tạm H3 ngày 19/10/2026 để IMPORTDATA cũ hoạt động trong lúc chuyển Apps Script.
    // Mã URL cũ chỉ đọc CSV bằng GET, tách khỏi mã header và quyền POST phản hồi.
    const hasLegacyToken = req.method === "GET" && equalSecret(url.searchParams.get("t") ?? "", config.legacyToken ?? "");
    if (!hasHeader && !hasLegacyToken && !(req.method === "POST" && await isFeedbackOwner(req))) return new Response("forbidden", { status: 403, headers: PRIVATE });
    if (!config.databaseUrl || !config.serviceKey) return new Response("unavailable", { status: 503, headers: PRIVATE });
    try {
      if (req.method === "POST") return await feedback(req);
      const tab = url.searchParams.get("tab") ?? "";
      if (!TABS.has(tab)) return new Response("bad tab", { status: 400, headers: PRIVATE });
      // Bản _real100 bỏ tài khoản/bài thử (is_test) trước khi đếm, liệt kê ca.
      // onchuongxs (29/10): 2K9 XPS làm 22 đề ôn 3 chương xác suất, hạn 08/11; hàm riêng, cũng bỏ is_test.
      const response = tab === "onchuongxs"
        ? await fetcher(`${config.databaseUrl}/rest/v1/rpc/mtm_on_chuong_csv`, { method: "POST", headers: databaseHeaders, body: "{}" })
        : await fetcher(`${config.databaseUrl}/rest/v1/rpc/mtm_btvn_sheet_csv6_real100`, {
          method: "POST", headers: databaseHeaders, body: JSON.stringify({ p_tab: tab }),
        });
      if (!response.ok) return new Response("loi du lieu " + response.status, { status: 502, headers: PRIVATE });
      const csv = await response.json();
      if (typeof csv !== "string") return new Response("loi du lieu", { status: 502, headers: PRIVATE });
      return new Response(csv, { headers: { ...PRIVATE, "Content-Type": "text/csv; charset=utf-8" } });
    } catch { return new Response("loi du lieu", { status: 502, headers: PRIVATE }); }
  };
}
