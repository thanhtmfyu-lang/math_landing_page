/** Logical edit counter, never a client clock or an authority over grading. */
export const validClientRevision=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER-2;
export const validBaseRevision=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** A write intent needs both its local counter and the canonical base it read. */
export const validWriteRevisions=(client:unknown,base:unknown)=>
  client===undefined&&base===undefined||validClientRevision(client)&&validBaseRevision(base);
