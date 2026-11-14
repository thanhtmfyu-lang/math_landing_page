import {createHash} from 'node:crypto';
import {CLASS_CONTEXT_CONTRACT,contextReceiptFromNative,validateClassContext,type ClassContextJob} from './class-context';
import {NATIVE_PDF_NORMALIZATION_CONTRACT,nativeCanonicalDigest,normalizeNativePdfPaths,type ChangedNativePdfNormalizationReceipt} from './native-pdf-normalization';
import type {Draft} from './worker';

export const OPERATOR_CACHED_DRAFT_CONTRACT='MTM-OPERATOR-CACHED-DRAFT-20261114-v1';
export const NATIVE_DRAFT_INVENTORY_CONTRACT='MTM-WEB-TEXT-INVENTORY-20261114-v3-teacher-class-context';
export type OperatorCachedDraftBinding={contract:typeof OPERATOR_CACHED_DRAFT_CONTRACT;source_ref:string;source_state_sha256:string;raw_native_draft_sha256:string;class_metadata_sha256:string;normalizer_contract:typeof NATIVE_PDF_NORMALIZATION_CONTRACT;normalizer_sha256:string;normalization_receipt_sha256:string;normalized_record_sha256:string;normalized_private_draft_sha256:string;normalized_draft_ref:string;source_version:string};
export type NativeDraftJob=ClassContextJob&{id?:string;version?:number;is_test?:boolean;operator_cached_draft?:unknown};
/** Private metadata; never include nativeNormalization in exam/material/publish. */
export type PreparedNativeDraft=Draft&{nativeNormalization?:ChangedNativePdfNormalizationReceipt};
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const record=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function need(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
/** Exactly the worker/private-state serialization, including insertion order. */
export function privateStateDigest(value:unknown){const raw=JSON.stringify(value);need(typeof raw==='string','PRIVATE_STATE_JSON_REQUIRED');return createHash('sha256').update(raw).digest('hex');}

const bindingFields=['contract','source_ref','source_state_sha256','raw_native_draft_sha256','class_metadata_sha256','normalizer_contract','normalizer_sha256','normalization_receipt_sha256','normalized_record_sha256','normalized_private_draft_sha256','normalized_draft_ref','source_version'] as const;
function cachedBinding(job:NativeDraftJob,value:Record<string,any>):OperatorCachedDraftBinding|null{
 if(job.operator_cached_draft==null)return null;
 const binding=job.operator_cached_draft;
 need(record(binding)&&Object.keys(binding).length===bindingFields.length&&bindingFields.every(key=>Object.hasOwn(binding,key)),'OPERATOR_CACHED_DRAFT_BINDING_REQUIRED');
 need(job.id==='14227822-ce9a-4f0f-8df3-489a60b11392'&&job.version===1&&job.is_test===true,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
 need(binding.contract===OPERATOR_CACHED_DRAFT_CONTRACT&&binding.normalizer_contract===NATIVE_PDF_NORMALIZATION_CONTRACT,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
 need(['source_state_sha256','raw_native_draft_sha256','class_metadata_sha256','normalizer_sha256','normalization_receipt_sha256','normalized_record_sha256','normalized_private_draft_sha256','source_version'].every(key=>sha(binding[key])),'OPERATOR_CACHED_DRAFT_BINDING_REQUIRED');
 need(binding.source_ref===`${job.id}-source-${binding.source_state_sha256}.json`&&binding.normalized_draft_ref===`${job.id}-draft-${binding.normalized_private_draft_sha256}.json`,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
 need(value.native_cache_record_sha256===binding.raw_native_draft_sha256&&value.sourceVersion===binding.source_version&&value.class_metadata_sha256===binding.class_metadata_sha256&&value.class_context_contract===CLASS_CONTEXT_CONTRACT&&value.inventory_contract===NATIVE_DRAFT_INVENTORY_CONTRACT,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
 // normalizer_sha256 identifies the owner-pinned tracked source in the immutable
 // runtime/SQL grant. A pure helper cannot attest its own source-file bytes.
 return binding as OperatorCachedDraftBinding;
}

/** Pure same-source conversion; cached mode never invokes native AI or reads disk. */
export function prepareNativeDraft(job:NativeDraftJob,value:unknown):PreparedNativeDraft{
 need(record(value),'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');
 const contextReceipt=contextReceiptFromNative(job,value),binding=cachedBinding(job,value);
 const normalized=normalizeNativePdfPaths(value,value.sourceVersion),native=normalized.value;
 const draft:PreparedNativeDraft={exam:native.draft.exam,assets:native.draft.assets,contextReceipt,...(normalized.receipt.changed?{nativeNormalization:normalized.receipt}:{})};
 validateClassContext(job,{sourceVersion:native.sourceVersion,contextReceipt},draft);
 if(binding){
  need(normalized.receipt.changed===true,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
  need(nativeCanonicalDigest(normalized.receipt)===binding.normalization_receipt_sha256&&nativeCanonicalDigest(native)===binding.normalized_record_sha256&&normalized.receipt.output_record_sha256===binding.normalized_record_sha256,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
  need(privateStateDigest(draft)===binding.normalized_private_draft_sha256,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');
 }
 return draft;
}
