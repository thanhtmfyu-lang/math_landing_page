type Row = Record<string, unknown>;
type Options = { url: string; key: string; fetcher?: typeof fetch; skipUploads?: boolean };

function feedbackBody(value: unknown): Row | undefined {
  if (!value || typeof value !== "object") return;
  const outer = value as Row;
  const body = outer.action === "sync_execute" ? outer.command as Row : outer;
  if (body && body.action === "feedback_add") return body;
}

export function feedbackImageSource(value: unknown): string | undefined {
  const body = feedbackBody(value);
  if (!body) return;
  const rows = (Array.isArray(body.rows) ? body.rows : [body]) as Row[];
  if (!rows.some((row) => typeof row?.imagePng === "string" && row.imagePng)) return;
  const source = (value as Row).sourceMsg ?? body.sourceMsg;
  return typeof source === "string" && source ? source : undefined;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function prepareFeedbackImages(value: unknown, options: Options): Promise<void> {
  const body = feedbackBody(value);
  if (!body) return;
  const outer = value as Row;
  const rows = (Array.isArray(body.rows) ? body.rows : [body]) as Row[];
  const fetcher = options.fetcher ?? fetch;
  const headers = { apikey: options.key, Authorization: `Bearer ${options.key}` };
  for (const [index, row] of rows.entries()) {
    const b64 = row.imagePng;
    delete row.imagePng;
    if (typeof b64 !== "string" || !b64) continue;
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b64.replace(/^data:image\/png;base64,/, "")), (c) => c.charCodeAt(0)); }
    catch { throw Error("imagePng must be valid base64"); }
    if (bytes.length > 2097152 || bytes.length < 8 || [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].some((n, i) => bytes[i] !== n)) {
      throw Error("imagePng must be PNG <= 2MB");
    }
    const inherited = body.sourceMsg ?? outer.sourceMsg;
    if (!row.sourceMsg && typeof inherited === "string" && inherited) {
      row.sourceMsg = Array.isArray(body.rows) ? `${inherited}#feedback-${index + 1}` : inherited;
    }
    const contentHash = await digest(bytes);
    const source = typeof row.sourceMsg === "string" ? row.sourceMsg : "legacy";
    const nameHash = await digest(new TextEncoder().encode(`feedback-image:v1\0${source}\0${contentHash}`));
    const uuid = `${nameHash.slice(0, 8)}-${nameHash.slice(8, 12)}-${nameHash.slice(12, 16)}-${nameHash.slice(16, 20)}-${nameHash.slice(20, 32)}`;
    const month = typeof row.date === "string" ? row.date.match(/^(\d{4}-\d{2})-/)?.[1] : undefined;
    const path = `${month ?? "1970-01"}/${uuid}.png`;
    const endpoint = `${options.url}/storage/v1/object/mtm-feedback-proof/${path}`;
    if (!options.skipUploads) {
      let existing = await fetcher(endpoint, { method: "GET", headers });
      let missing = existing.status === 404;
      // Storage có thể bọc lỗi object404 trong HTTP400. Không coi mọi HTTP400 là không tồn tại.
      if (existing.status === 400) {
        try {
          const failure = await existing.clone().json();
          missing = failure?.code === "NoSuchKey" || (String(failure?.statusCode) === "404" && failure?.error === "not_found");
        } catch { missing = false; }
      }
      if (missing) {
        const uploaded = await fetcher(endpoint, { method: "POST", headers: { ...headers, "Content-Type": "image/png" }, body: bytes });
        if (!uploaded.ok) {
          if (![400, 409].includes(uploaded.status)) throw Error("upload failed");
          existing = await fetcher(endpoint, { method: "GET", headers });
          if (!existing.ok || await digest(new Uint8Array(await existing.arrayBuffer())) !== contentHash) throw Error("image_path_conflict");
        }
      } else if (!existing.ok) {
        throw Error("image_lookup_failed");
      } else if (await digest(new Uint8Array(await existing.arrayBuffer())) !== contentHash) {
        throw Error("image_path_conflict");
      }
    }
    row.imagePath = path;
    delete row.imageUrl;
  }
}
