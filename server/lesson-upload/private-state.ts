import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateStateDigest,type PrivateState} from './worker';

/** Durable server disk, outside web roots. Contains answer keys: never sync to public artifacts. */
export function createPrivateFileState(directory:string):PrivateState {
 if(!isAbsolute(directory))throw Error('PRIVATE_STATE_DIR_REQUIRED');
 const root=resolve(directory);
 return {
  async save(uploadId,stage,value){
   if(!/^[a-z0-9-]{1,80}$/i.test(uploadId)||! /^[a-z]{1,20}$/.test(stage))throw Error('INVALID_STATE_KEY');
   const hash=privateStateDigest(value),ref=`${uploadId}-${stage}-${hash}.json`;
   await mkdir(root,{recursive:true,mode:0o700});
   const temp=join(root,ref+'.'+randomUUID()+'.tmp');
   await writeFile(temp,JSON.stringify(value),{encoding:'utf8',mode:0o600,flag:'wx'});
   await rename(temp,join(root,ref));return ref;
  },
  async load(ref){
   const match=/^[a-z0-9-]{1,80}-[a-z]{1,20}-([a-f0-9]{64})\.json$/i.exec(ref);
   if(!match)throw Error('INVALID_STATE_REFERENCE');
   const value=JSON.parse(await readFile(join(root,ref),'utf8'));
   if(privateStateDigest(value)!==match[1])throw Error('STATE_HASH_MISMATCH');
   return value;
  }
 };
}
