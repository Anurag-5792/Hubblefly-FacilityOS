/** SEC-090-05: browser-only lifetime fence. No authentication or grant is created here. */
export type IntakeTicket=Readonly<{epoch:number;contextId:string}>;
export const validIntakeContext=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export class IntakeAccessFence{
 private epoch=0;
 private contextId='';
 private expiresAt=0;
 capture():IntakeTicket{return {epoch:this.epoch,contextId:this.contextId};}
 current(t: IntakeTicket,now=Date.now()/1000):boolean{
  return t.epoch===this.epoch&&t.contextId===this.contextId&&(!this.contextId||this.expiresAt>now);
 }
 admit(t:IntakeTicket,contextId:string,expiresAt:number,now=Date.now()/1000):boolean{
  if(!this.current(t,now)||!validIntakeContext(contextId)||!Number.isSafeInteger(expiresAt)||expiresAt<=now||
   (t.contextId!==''&&t.contextId!==contextId))return false;
  this.contextId=contextId;this.expiresAt=expiresAt;return true;
 }
 invalidate(){this.epoch++;this.contextId='';this.expiresAt=0;}
}
export type IntakePending=Readonly<{contextId:string;requestId:string;itemId:string;expectedRevision:number}>;
const prefix='hft.intake.pending.';
export function intakeMarkerKey(ctx:string){
 if(!validIntakeContext(ctx))throw Error('INVALID_CONTEXT');
 return prefix+'v2.'+ctx;
}
type MarkerStorage=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export function readIntakeMarker(store:MarkerStorage,ctx:string):IntakePending|null{
 const raw=store.getItem(intakeMarkerKey(ctx));if(raw===null)return null;
 const p=JSON.parse(raw) as IntakePending;
 if(!p||typeof p!=='object'||Object.keys(p).length!==4||p.contextId!==ctx||
  typeof p.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.requestId)||
  typeof p.itemId!=='string'||!/^(CM|OP)-[0-9]+$/.test(p.itemId)||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)
  throw Error('INVALID_MARKER');
 return p;
}
// Inspect key names only. Never read, migrate, show or delete another owner's or a v1 marker.
export function hasOtherIntakeMarkers(store:MarkerStorage,ctx:string):boolean{
 const own=intakeMarkerKey(ctx);
 for(let i=0;i<store.length;i++){const k=store.key(i);if(k?.startsWith(prefix)&&k!==own)return true;}
 return false;
}
export function sameIntakeMarker(a:IntakePending|null,b:IntakePending):boolean{
 return !!a&&a.contextId===b.contextId&&a.requestId===b.requestId&&a.itemId===b.itemId&&a.expectedRevision===b.expectedRevision;
}
export function persistIntakeMarker(store:MarkerStorage,p:IntakePending){
 if(hasOtherIntakeMarkers(store,p.contextId)||readIntakeMarker(store,p.contextId))throw Error('UNRESOLVED_MARKER');
 store.setItem(intakeMarkerKey(p.contextId),JSON.stringify(p));
 if(!sameIntakeMarker(readIntakeMarker(store,p.contextId),p))throw Error('MARKER_WRITE_UNCONFIRMED');
}
export function clearIntakeMarker(store:MarkerStorage,p:IntakePending){
 if(!sameIntakeMarker(readIntakeMarker(store,p.contextId),p))throw Error('MARKER_CHANGED');
 store.removeItem(intakeMarkerKey(p.contextId));
 if(readIntakeMarker(store,p.contextId)!==null)throw Error('MARKER_REMOVE_UNCONFIRMED');
}
