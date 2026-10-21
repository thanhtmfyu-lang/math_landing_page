import {docVe,maNguoi,type PtVe} from './handler';
import type {PtNguoiXem} from './engine';

export function analysisTicket(body:Record<string,unknown>,key:Buffer,ai:PtNguoiXem,now:number):PtVe|null{
 if(Object.keys(body).some(k=>!['action','de','ve'].includes(k))||body.action!=='phan-tich')return null;
 if(typeof body.ve!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.ve))return null;
 const ticket=docVe(body.ve,key);
 if(!ticket||ticket.d!==body.de||ticket.s>now+60000||now-ticket.s>25*3600000||!/^[A-Za-z0-9_-]{8,40}$/.test(ticket.n))return null;
 if(ticket.a!==maNguoi(ai)&&ticket.a!=='khach')return null;
 return ticket;
}
export {publicDistribution} from './analysis-model';
