import { createSheetHandler } from "./handler.ts";

// CSV chỉ nhận mã qua header từ Apps Script; không còn nhận mã trong URL.
Deno.serve(createSheetHandler({
  databaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  scriptToken: Deno.env.get("MTM_SHEET_SCRIPT_TOKEN") ?? "",
  ownerEmail: Deno.env.get("MTM_SHEET_SCRIPT_EMAIL") ?? "",
}));
