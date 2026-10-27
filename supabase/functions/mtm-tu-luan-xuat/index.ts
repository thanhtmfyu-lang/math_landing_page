// Ảnh tự luận đã nộp trên web cho bộ chấm (Javis), CHỈ ĐỌC: POST JSON {action:"list", lessons:[mã bài] | prefix:"thi-thang-2026-10-..."},
// header x-mtm-token = MTM_DD_TOKEN (dùng chung với mtm-diem-danh). Trả từng trang ảnh đã xác nhận nhận kèm link ký 1 giờ.
// Bảng tu_luan_images không cấp cho service_role (migration 099) nên đọc qua SUPABASE_DB_URL như mtm-btvn-publish. Không ghi DB/Storage.
import postgres from "npm:postgres@3.4.5";
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KHOA = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MA = Deno.env.get("MTM_DD_TOKEN") ?? "";
const BUCKET = "mtm-tu-luan";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

function bang(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function kyLink(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let k = 0; k < paths.length; k += 100) {
    const r = await fetch(`${URL_DB}/storage/v1/object/sign/${BUCKET}`, {
      method: "POST",
      headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600, paths: paths.slice(k, k + 100) }),
    });
    if (!r.ok) throw Error("sign_failed");
    for (const d of await r.json()) if (d?.path && d?.signedURL) out.set(d.path, `${URL_DB}/storage/v1${d.signedURL}`);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !MA || !bang(req.headers.get("x-mtm-token") ?? "", MA)) return new Response("forbidden", { status: 403 });
  let p: { action?: unknown; lessons?: unknown; prefix?: unknown };
  try { p = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const lessons = Array.isArray(p?.lessons) ? p.lessons : [];
  const prefix = typeof p?.prefix === "string" ? p.prefix : "";
  const lessonsOk = lessons.length >= 1 && lessons.length <= 20 && lessons.every((l) => typeof l === "string" && /^[a-z0-9-]{1,160}$/.test(l));
  const prefixOk = /^thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]{0,120}$/.test(prefix);
  if (p?.action !== "list" || (!lessonsOk && !prefixOk)) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const rows = await sql`select i.student_id::text as "studentId", s.full_name as "fullName", c.label as "className",
        i.lesson_code as "lessonCode", i.page_number as "pageNumber", i.received_at as "receivedAt", i.storage_path as "path"
      from mtm_hw_private.tu_luan_images i
      join mtm_hw_private.students s on s.id = i.student_id
      join mtm_hw_private.classes c on c.id = s.class_id
      where i.received_at is not null
        and ${lessonsOk ? sql`i.lesson_code = any(${lessons as string[]}::text[])` : sql`starts_with(i.lesson_code, ${prefix})`}
      order by i.lesson_code, s.full_name, s.id, i.page_number
      limit 3000`;
    const urls = await kyLink(rows.map((r) => r.path as string));
    const items = rows.map((r) => ({ ...r, url: urls.get(r.path as string) ?? null }));
    return Response.json({ count: items.length, items }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message === "sign_failed" ? "sign_failed" : "read_failed" }, { status: 502 });
  }
});
