type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const KEY='mtm-lesson-pending-v1';
const ownerKey=(owner:string)=>`${KEY}:${encodeURIComponent(owner)}`;
export type PendingRecord={owner:string;payload:Record<string,unknown>};
export function loadPending(store:Store,owner:string):Record<string,unknown>|null{
  const raw=store.getItem(ownerKey(owner))??store.getItem(KEY);if(!raw)return null;
  let record:PendingRecord;try{record=JSON.parse(raw);}catch{throw Error('Biên nhận đang lưu bị lỗi. Cần kiểm tra lịch sử trước khi gửi thêm bài.');}
  if(record.owner!==owner)return null;
  if(!record.payload||typeof record.payload!=='object'||typeof record.payload.client_request_id!=='string'||!Array.isArray(record.payload.class_ids))throw Error('Biên nhận đang lưu chưa hợp lệ. Cần kiểm tra lịch sử trước khi gửi thêm bài.');
  return record.payload;
}
export function savePending(store:Store,owner:string,payload:Record<string,unknown>){
  const value=JSON.stringify({owner,payload});
  try{store.setItem(ownerKey(owner),value);if(store.getItem(ownerKey(owner))!==value)throw Error();}
  catch{throw Error('Chưa lưu được biên nhận trên máy này. Bài chưa được gửi; kiểm tra bộ nhớ trình duyệt rồi thử lại.');}
}
export function clearPending(store:Store,owner:string){
  for(const key of [ownerKey(owner),KEY]){const raw=store.getItem(key);if(!raw)continue;try{if(JSON.parse(raw).owner===owner)store.removeItem(key);}catch{/* Keep an unknown record for reconciliation. */}}
}
