"""Nhận sự kiện trong lượt quét quản lý hiện có, không tạo lịch hoặc gửi tin.

Đích chưa có adapter ghi/đọc đã kiểm được giữ blocked. Không dùng hash payload
đã gửi thay cho hash đọc lại. Bộ worker này ghi nhận việc còn thiếu chính xác,
không tự nhận hệ ngoài đã đồng bộ.
"""
from pathlib import Path
import datetime, hashlib, json, os, time
LOADED_SOURCE_SHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

BLOCKED = {
    'web': 'web_live_readback_adapter_missing',
    'attendance': 'attendance_readback_adapter_missing',
    'sheet_import': 'sheet_import_readback_adapter_missing',
    'sheet_roster': 'roster_sheet_adapter_not_verified',
    'sheet_attendance': 'attendance_sheet_adapter_not_verified',
    'guardian_report': 'guardian_report_owner_gate',
    'bot_profile': 'bot_profile_owner_lock',
    'group_invite_proposal': 'group_invite_owner_gate',
    'ranking': 'ranking_readback_adapter_missing',
}

def run_once(call=None, output=None, adapters=None, clock=time.monotonic):
    helper_hash=None
    if call is None:
        import mtm_dd
        from mtm_dd import goi
        call=goi
        helper_hash=getattr(mtm_dd,'LOADED_SOURCE_SHA256',None)
    adapters=adapters or {}
    started=clock()
    at=datetime.datetime.now(datetime.timezone.utc)
    # Cùng bucket năm phút chạy lại vẫn một lệnh, lần sau không áp trùng.
    bucket=int(at.timestamp())//300
    result={'version':'SYNC-20261019-v1','at':at.isoformat(),'status':'running','claimed':0,'verified':0,'blocked':0,'retry':0,'sent_messages':0,'errors':[]}
    result.update(worker_loaded_sha256=LOADED_SOURCE_SHA256,helper_loaded_sha256=helper_hash)
    stage='tick'
    def request(body):
        http,data=call(body,timeout=12)
        if http in (401,403):
            raise PermissionError('permission_denied')
        if http>=400 or not isinstance(data,dict) or data.get('error') or data.get('ok') is False or data.get('syncStatus') in ('partial','failed','rejected'):
            raise RuntimeError('warehouse_request_failed')
        return data
    try:
        try:
            tick=request({'action':'sync_execute','sourceMsg':'system:sync-tick:'+str(bucket),'command':{'action':'sync_tick'}})
            result['lifecycle_command']=tick.get('commandId')
            result['lifecycle_quarantined']=int(tick.get('lifecycleQuarantined') or 0)
            if result['lifecycle_quarantined']:
                result['errors'].append('lifecycle_records_quarantined')
        except PermissionError:
            raise
        except RuntimeError:
            # Tick không làm mất hàng đợi sự kiện đã ghi từ các nguồn khác.
            result['errors'].append('tick_failed')
        stage='claim'
        claim=request({'action':'sync_claim','worker':'mtm-sync-existing-scan','limit':10,'leaseSeconds':120})
        deliveries=claim.get('deliveries')
        if not isinstance(deliveries,list):
            raise RuntimeError('invalid_claim_response')
        result['claimed']=len(deliveries)
        for delivery in deliveries:
            if clock()-started>25:
                result['errors'].append('time_budget_reached_leases_expire_safely')
                break
            sink=delivery.get('sink')
            ack={'action':'sync_ack','deliveryId':delivery['deliveryId'],'leaseToken':delivery['leaseToken'],'version':delivery['version']}
            handler=adapters.get(sink)
            if handler is None:
                ack.update(status='blocked',errorCode=BLOCKED.get(sink,'adapter_not_verified'))
            else:
                try:
                    readback=handler(delivery,deadline_seconds=max(1,25-(clock()-started)))
                    # Adapter phải tự ghi/đọc đích và trả bytes đọc lại + receipt thật.
                    if not isinstance(readback,dict) or not isinstance(readback.get('readback_bytes'),bytes) or not isinstance(readback.get('expected_bytes'),bytes) or not readback.get('receipt_ref'):
                        raise ValueError('missing_readback_receipt')
                    if readback['readback_bytes']!=readback['expected_bytes']:
                        raise ValueError('readback_does_not_match_expected_projection')
                    ack.update(status='verified',readbackHash=hashlib.sha256(readback['readback_bytes']).hexdigest(),receiptRef=readback['receipt_ref'])
                except PermissionError:
                    ack.update(status='blocked',errorCode='sink_permission_denied')
                except Exception:
                    ack.update(status='retry',errorCode='sink_readback_failed')
            stage='ack'
            try:
                response=request(ack)
            except PermissionError:
                raise
            except RuntimeError:
                # Lease cũ bị từ chối không chặn các delivery độc lập khác.
                result['errors'].append('ack_failed')
                continue
            if response.get('status') not in ('verified','blocked','retry','failed'):
                raise RuntimeError('ack_not_confirmed')
            counter='retry' if response.get('status')=='failed' else response['status']
            result[counter]+=1
        result['status']='partial_blocked' if result['blocked'] or result['errors'] else 'completed' if not result['retry'] else 'retry_pending'
    except PermissionError:
        result['status']='permission_blocked';result['errors'].append(stage+'_permission_denied')
    except Exception:
        result['status']='failed';result['errors'].append(stage+'_request_failed')
    if output is not None:
        path=Path(output);path.parent.mkdir(parents=True,exist_ok=True)
        tmp=path.with_suffix(path.suffix+'.tmp')
        tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        os.replace(tmp,path)
    return result

if __name__=='__main__':
    out=Path('/brains/Brain Default/memory/internal/dong-bo-du-lieu-19-10/worker-latest.json')
    result=run_once(output=out)
    print(json.dumps(result,ensure_ascii=False))
