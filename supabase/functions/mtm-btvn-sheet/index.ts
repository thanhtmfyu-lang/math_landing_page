import { createSheetHandler } from "./handler.ts";

// Lùi tạm H3: giữ header Apps Script và nhận lại mã URL cũ cho GET IMPORTDATA.
Deno.serve(createSheetHandler({
  databaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  scriptToken: Deno.env.get("MTM_SHEET_SCRIPT_TOKEN") ?? "",
  ownerEmail: Deno.env.get("MTM_SHEET_SCRIPT_EMAIL") ?? "",
  legacyToken: Deno.env.get("MTM_SHEET_TOKEN") ?? "",
}));
