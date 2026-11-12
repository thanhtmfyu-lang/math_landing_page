export class LessonSubmitError extends Error {
  constructor(message:string,public outcome:'rejected'|'unknown'){super(message);}
}

/** A retry failing before the RPC does not resolve an earlier unknown commit. */
export function pendingAfterFailure(current:Record<string,unknown>|null,payload:Record<string,unknown>,error:unknown){
  if(error instanceof LessonSubmitError)return error.outcome==='rejected'?null:payload;
  return current;
}
