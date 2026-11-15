/** Authorized server metadata only; does not contain answers or a credential. */
export class HomeworkWriteConflict extends Error {
  constructor(message:string,public readonly attemptId:string,public readonly revision:number){super(message);this.name='HomeworkWriteConflict';}
}
