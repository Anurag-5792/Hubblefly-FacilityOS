/** Hosted client tracking is not authorization. No business payload or token is stored. */
export type OperatorScope={legalEntityId:string;siteId:string;warehouseId:string};
export type PendingOperatorRequest={requestId:string;scope:OperatorScope};
export type OperatorCapability={scope:OperatorScope;rolesRead:boolean;stockRead:boolean;receive:boolean};
export type OperatorContext={contextId:string;expiresAt:number;capabilities:OperatorCapability[]};
const digest=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
function object(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('HOSTED_OPERATOR_RESPONSE_INVALID');
 return v as Record<string,unknown>;
}
function scope(v:unknown):OperatorScope{
 const s=object(v);
 if(Object.keys(s).length!==3||!['legalEntityId','siteId','warehouseId'].every(k=>typeof s[k]==='string'&&id.test(s[k])))throw Error('HOSTED_OPERATOR_SCOPE_INVALID');
 return s as OperatorScope;
}
export function parseOperatorContext(v:unknown,now=Date.now()/1000):OperatorContext{
 const c=object(v);
 if(c.state!=='OPERATOR_CONTEXT'||typeof c.contextId!=='string'||!digest.test(c.contextId)||
  typeof c.expiresAt!=='number'||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||
  !Array.isArray(c.capabilities)||c.capabilities.length<1||c.capabilities.length>32)
  throw Error('HOSTED_OPERATOR_RESPONSE_INVALID');
 const capabilities=c.capabilities.map(v=>{
  const x=object(v);
  if(!['rolesRead','stockRead','receive'].every(k=>typeof x[k]==='boolean')||(!x.rolesRead&&!x.stockRead&&!x.receive))
   throw Error('HOSTED_OPERATOR_RESPONSE_INVALID');
  return {scope:scope(x.scope),rolesRead:x.rolesRead as boolean,stockRead:x.stockRead as boolean,receive:x.receive as boolean};
 });
 if(new Set(capabilities.map(x=>JSON.stringify(x.scope))).size!==capabilities.length)throw Error('HOSTED_OPERATOR_RESPONSE_INVALID');
 return {contextId:c.contextId,expiresAt:c.expiresAt,capabilities};
}
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
type Duty='role'|'receive';
const prefix=(d:Duty)=>'hft.hosted.'+d+'.pending.v1.';
function key(d:Duty,c:string){if(!digest.test(c))throw Error('HOSTED_OPERATOR_CONTEXT_INVALID');return prefix(d)+c;}
export function operatorPending(s:Store,d:Duty,c:string):PendingOperatorRequest|null{
 const raw=s.getItem(key(d,c));if(raw===null)return null;const p=object(JSON.parse(raw));
 if(Object.keys(p).length!==2||typeof p.requestId!=='string'||!uuid.test(p.requestId))throw Error('HOSTED_OPERATOR_MARKER_INVALID');
 return {requestId:p.requestId,scope:scope(p.scope)};
}
export function operatorOtherPending(s:Store,d:Duty,c:string):boolean{
 const own=key(d,c);for(let i=0;i<s.length;i++){const k=s.key(i);if(k&&k.startsWith(prefix(d))&&k!==own)return true;}return false;
}
export function writeOperatorPending(s:Store,d:Duty,c:string,p:PendingOperatorRequest){
 if(operatorPending(s,d,c)||operatorOtherPending(s,d,c))throw Error('HOSTED_OPERATOR_ORIGINAL_REQUEST_HELD');
 s.setItem(key(d,c),JSON.stringify(p));const got=operatorPending(s,d,c);
 if(!got||got.requestId!==p.requestId||JSON.stringify(got.scope)!==JSON.stringify(p.scope))throw Error('HOSTED_OPERATOR_MARKER_UNVERIFIED');
}
export function clearOperatorPending(s:Store,d:Duty,c:string,p:PendingOperatorRequest){
 const got=operatorPending(s,d,c);
 if(!got||got.requestId!==p.requestId||JSON.stringify(got.scope)!==JSON.stringify(p.scope))throw Error('HOSTED_OPERATOR_MARKER_CHANGED');
 s.removeItem(key(d,c));if(operatorPending(s,d,c))throw Error('HOSTED_OPERATOR_MARKER_UNVERIFIED');
}
