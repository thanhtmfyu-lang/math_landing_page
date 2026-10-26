import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {createLeadStatusHandler} from './handler.ts';
// Platform server env only. Never return/log service credentials or J33 token.
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
});
Deno.serve(createLeadStatusHandler({rpc:(token,command)=>db.rpc('mtm_lead_nm8_status',{p_token:token,p_command:command})}));
