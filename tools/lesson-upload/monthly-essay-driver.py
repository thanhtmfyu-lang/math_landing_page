"""Queue-only anonymous photo grading; no provider call on VPS."""
import hashlib,json
def encoded(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def digest(v):return hashlib.sha256(encoded(v)).hexdigest()
def need(v,c):
 if not v:raise ValueError(c)
def run(runtime,value,atomic):
 fields=['provider','questions','images','rubric','max_score','submission_hash','rubric_hash']
 request={'task':'monthly-essay',**{k:value[k] for k in fields}};key=digest(request);queue=runtime.brain_root()/'cau-noi/lesson-upload-review';path=queue/'requests'/(key+'.json');record={'schema':3,'request_hash':key,**request}
 if path.exists():need(json.loads(path.read_text())==record,'ESSAY_REQUEST_CHANGED')
 else:atomic(path,record)
 resultfile=queue/'results'/(key+'.json')
 if not resultfile.exists():return {'status':'pending','request_hash':key}
 result=json.loads(resultfile.read_text());receipt=result.get('provider_receipt',{});grade=receipt.get('result',{})
 need(result.get('request_hash')==key and result.get('provider')==value['provider'] and result.get('receipt_hash')==digest(receipt),'ESSAY_RECEIPT_REQUIRED')
 models=list(receipt.get('modelUsage',{})) or [receipt.get('model')];request_id=next((receipt[k] for k in ['requestId','request_id','sessionId','session_id'] if receipt.get(k)),None)
 need(all(models) and request_id and grade.get('images_seen') is True and grade.get('image_shas')==[i['sha256'] for i in value['images']],'ESSAY_IMAGES_NOT_SEEN')
 need(grade.get('submission_hash')==value['submission_hash'] and grade.get('rubric_hash')==value['rubric_hash'] and grade.get('max_score')==value['max_score'],'ESSAY_SOURCE_CHANGED')
 return {k:grade[k] for k in ['submission_hash','rubric_hash','max_score','score','images_seen']}|{'provider':value['provider'],'model':','.join(models),'request_id':request_id,'receipt_hash':result['receipt_hash']}
