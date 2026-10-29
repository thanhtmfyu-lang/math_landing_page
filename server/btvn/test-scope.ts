/** Map only at the production transport boundary; missing migration fails closed.
 * Original RPCs stay available to external consumers pending their own rollout. */
const REPORTS=new Set(['mtm_btvn_leaderboard','mtm_btvn_leaderboard_class','mtm_btvn_my_rank','mtm_btvn_arena',
 'mtm_btvn_scorebook','mtm_btvn_admin_scores','mtm_btvn_opening_materials',
 'mtm_ph_children','mtm_ph_extras','mtm_ph_child_session','mtm_tu_luan_teacher',
 'mtm_pt_xep_hang','mtm_pt_xep_hang_dot','mtm_pt_khao_sat','mtm_pt_lich_su','mtm_pt_bao_phu_huynh','mtm_pt_ghi_luot']);
export function productionRpc(name:string){return name==='mtm_btvn_read'?'mtm_btvn_read_scoped100':REPORTS.has(name)?name+'_real100':name;}
export const isTestRow=(row:any)=>row?.is_test===true||row?.isTest===true||row?.studentIsTest===true||row?.lessonIsTest===true;
