export const INTAKE_VIEWS=['items','opening','current','issues','hft_issues','movement_holds','racks','positions','containers','stickers'] as const;
export type IntakeView=typeof INTAKE_VIEWS[number];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Read={intent:'READ';view:IntakeView;search:string;offset:number;limit:number};
type Rename={intent:'RENAME';requestId:string;itemId:string;revision:number;name:string;reason:string};
type Reconcile={intent:'RECONCILE';requestId:string};
export type IntakeRequest=Read|Rename|Reconcile;
function keys(x:Record<string,unknown>,expected:string[]){return Object.keys(x).length===expected.length&&expected.every(k=>Object.hasOwn(x,k));}
const clean=(x:unknown,min:number,max:number):x is string=>typeof x==='string'&&x.length>=min&&x.length<=max&&x===x.trim()&&!/[\u0000-\u001f\u007f]/.test(x);
export function parseIntakeRequest(raw:unknown):IntakeRequest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INTAKE_INVALID');
 const x=raw as Record<string,unknown>;
 if(x.intent==='READ'&&keys(x,['intent','view','search','offset','limit'])&&INTAKE_VIEWS.includes(x.view as IntakeView)&&
 clean(x.search,0,100)&&typeof x.offset==='number'&&Number.isSafeInteger(x.offset)&&x.offset>=0&&x.offset<=100000&&
 typeof x.limit==='number'&&Number.isSafeInteger(x.limit)&&x.limit>=1&&x.limit<=100)
 return {intent:'READ',view:x.view as IntakeView,search:x.search,offset:x.offset,limit:x.limit};
 if(x.intent==='RECONCILE'&&keys(x,['intent','requestId'])&&typeof x.requestId==='string'&&uuid.test(x.requestId))return {intent:'RECONCILE',requestId:x.requestId};
 if(x.intent==='RENAME'&&keys(x,['intent','requestId','itemId','revision','name','reason'])&&
 typeof x.requestId==='string'&&uuid.test(x.requestId)&&typeof x.itemId==='string'&&/^(CM|OP)-[0-9]+$/.test(x.itemId)&&
 typeof x.revision==='number'&&Number.isSafeInteger(x.revision)&&x.revision>0&&clean(x.name,1,240)&&clean(x.reason,8,300))
 return {intent:'RENAME',requestId:x.requestId,itemId:x.itemId,revision:x.revision,name:x.name,reason:x.reason};
 throw Error('INTAKE_INVALID');
}
