"""Web upload bindings on the EXISTING reconciler/ledger; never resets usage."""
import hashlib,json,sqlite3
from pathlib import Path
import native_budget_reconcile as n

class WebReconciler(n.DynamicReconciler):
 def __init__(self,policy_path,row,hs,gv,scope_hash,upload_id,paper,root,lock):
  policy,_=n.read_json(policy_path);resolve=lambda k:(Path(policy_path).parent/policy[k]).resolve()
  super().__init__(policy_path,rows_supplier=lambda:[row],source_reader=lambda _row:(hs,gv),group_paths=[resolve('shared_final_registry_file')],legacy_ledger_path=root/'final-review-chatgpt-ledger.sqlite',audit_paths=[root/'ai-usage.jsonl'],structured_ledger_path=resolve('ledger_path'),lock_check=lock)
  self.scope_hash,self.upload_id,self.paper=scope_hash,upload_id,paper
 def refresh(self,*,context=None,budget=None):
  with self.mutex:
   self.lock_check();policy,_=n.read_json(self.policy_path);resolve=lambda k:(self.policy_path.parent/policy[k]).resolve()
   n.need(policy.get('preserve_existing_ledgers') is True,'RECONCILE_POLICY_INVALID')
   oauth=[p for p in policy['providers'] if p['provider']=='chatgpt-oauth'];n.need(oauth and all(p['daily_calls']==1024 for p in oauth),'RECONCILE_OAUTH_SHARED_CAP_1024_REQUIRED')
   document,registry_hash=n.read_json(self.group_paths[0]);n.need(registry_hash==policy['shared_final_registry_sha256'],'RECONCILE_REGISTRY_HASH_CHANGED')
   n.need(self.structured_ledger_path==resolve('ledger_path') and self.group_paths[0]==resolve('shared_final_registry_file'),'RECONCILE_LEDGER_PATH_CHANGED')
   rows=n.source_rows(self.rows_supplier(),self.source_reader);n.need(len(rows)==1,'RECONCILE_CONTEXT_ACTUAL_SOURCE_MISSING');row=rows[0]
   groups=n.groups_from_documents([document]);known=[g for g in groups if g['source_version']==row['source_version']]
   if known:
    candidates=[g for g in known if g.get('canonical_buoi')==row['canonical_date'] or row['class_dates'] in g['allowed_class_dates'].values()]
    n.need(len(candidates)==1,'NEED_GROUP_MEMBERSHIP_REVIEW');group=candidates[0]
    group['lesson_bases']=list(set(group['lesson_bases'])|{row['base']});group['allowed_class_dates']={**group['allowed_class_dates'],row['base']:row['class_dates']}
   ledger=resolve('ledger_path');state=n.structured_state(ledger);legacy=n.read_sqlite(self.legacy_ledger_path,'calls')
   raw=self.audit_paths[0].read_bytes();audits=[(str(self.audit_paths[0]),raw)]
   evidence={'at':n.now().isoformat(),'groups':[{'path':str(self.group_paths[0]),'sha256':registry_hash}], 'legacy_ledger':str(self.legacy_ledger_path),'legacy_calls_query_sha256':n.digest(legacy),'audits':[{'path':str(self.audit_paths[0]),'sha256':hashlib.sha256(raw).hexdigest()}], 'fresh_sources':[{k:row[k] for k in ('lesson_key','source_version','hs_sha256','gv_sha256','class_dates')}], 'authorized_web_upload':{'upload_id':self.upload_id,'paper':self.paper,'task_scope_sha256':self.scope_hash}}
   if context:
    n.need(context['source_version']==row['source_version'] and context['lesson_key'].split('-v-')[0]==row['base'],'RECONCILE_CONTEXT_REQUIRED');row['aliases']=sorted(set(row['aliases'])|{context['lesson_key']})
   final={'contract':n.VERSION,'reconciled':True,'source_evidence':evidence,'bindings':n.final_bindings(rows,groups,legacy,state,evidence)}
   usage={'contract':n.VERSION,'reconciled':True,'source_evidence':evidence,'provider_calls':n.provider_usage(audits,state)}
   n.atomic(resolve('legacy_usage_evidence_file'),usage);n.atomic(resolve('final_source_session_evidence_file'),final)
   if budget is not None:
    n.need(budget.limits.get('chatgpt-oauth')==1024,'RECONCILE_ENGINE_OAUTH_CAP_CHANGED');budget.legacy_ledger_path=self.legacy_ledger_path
    budget.legacy_group_aliases={b['source_session_key']:b['evidence']['legacy_group_identities'] for b in final['bindings']}
    budget.before_reserve=lambda provider,stage,current:self.atomic_before_reserve(budget,current,stage=stage)
    budget.import_usage(usage['provider_calls']);budget.reconcile_final_bindings(final['bindings'])
    # Same SQLite journal and transaction, immutable UUID + actual bytes + scope.
    budget.db.execute('create table if not exists mtm_web_upload_bindings(upload_id text,paper integer,source_version text,scope_sha256 text,source_key text,primary key(upload_id,paper))')
    binding=next(b for b in final['bindings'] if b['lesson_key']==row['lesson_key'])
    current=budget.db.execute('select source_version,scope_sha256,source_key from mtm_web_upload_bindings where upload_id=? and paper=?',(self.upload_id,self.paper)).fetchone()
    value=(row['source_version'],self.scope_hash,binding['source_session_key']);n.need(current is None or tuple(current)==value,'WEB_UPLOAD_BINDING_IMMUTABLE')
    budget.db.execute('insert or ignore into mtm_web_upload_bindings values(?,?,?,?,?)',(self.upload_id,self.paper,*value))
   return {'usage':usage,'final':final}
