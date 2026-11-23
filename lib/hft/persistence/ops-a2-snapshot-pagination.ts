/**
 * OPS-A2 source-only snapshot cursor protocol. Never builds stock authority.
 *
 * A qualified PostgreSQL snapshot issuer must first freeze a complete,
 * ordinally ordered, scope-isolated result set in independently controlled
 * snapshot storage. This codec only binds continuation to that result.
 * It cannot turn separate READ COMMITTED/REPEATABLE READ requests into a
 * consistent snapshot by itself. No runtime API imports this module.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {storesReadFields,validateStoresQuery} from '../stores/p0-readback.ts';

const hex=/^[0-9a-f]{64}$/;
const identity=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const version='HFT-OPS-A2-SNAPSHOT-CURSOR-V1';
const lifetime=300;
const maxRows=10000;
export type SnapshotAnchor=Readonly<{
 snapshotId:string;scopeSha256:string;sourceEpoch:string;
 policyGeneration:number;totalRows:number;snapshotSha256:string;
 expiresAt:number;actorSubject:string;sessionId:string;
}>;
export type SnapshotPage<T>=Readonly<{
 anchor:SnapshotAnchor;offset:number;rows:readonly T[];
 nextCursor:string;
}>;
export type OrdinalRow=Readonly<{ordinal:number;rowSha256:string;movementId:string}>;
function secret(key:Uint8Array):void{
 if(!(key instanceof Uint8Array)||key.length<32)
  throw Error('OPS_A2_CURSOR_PRIVATE_KEY_REQUIRED');
}
function validAnchor(a:SnapshotAnchor):void{
 if(!uuid.test(a.snapshotId)||!hex.test(a.scopeSha256)||!hex.test(a.snapshotSha256)||
  !identity.test(a.sourceEpoch)||!identity.test(a.actorSubject)||
  !identity.test(a.sessionId)||!Number.isSafeInteger(a.policyGeneration)||
  a.policyGeneration<1||!Number.isSafeInteger(a.totalRows)||
  a.totalRows<0||a.totalRows>maxRows||!Number.isSafeInteger(a.expiresAt)||
  a.expiresAt<1)throw Error('OPS_A2_SNAPSHOT_ANCHOR_INVALID');
}
export function snapshotScopeSha256(query:unknown):string{
 const q=validateStoresQuery(query);
 // The signed P0 query covers the actual cursor. The snapshot identity
 // instead fixes the full filter and page limit, excluding cursor.
 return createHash('sha256').update(lengthPrefixedUtf8(
  storesReadFields({...q,cursor:''}))).digest('hex');
}
function fields(a:SnapshotAnchor,offset:number,pageSize:number):readonly string[]{
 return [version,a.snapshotId,a.scopeSha256,a.sourceEpoch,
  String(a.policyGeneration),String(a.totalRows),a.snapshotSha256,
  String(a.expiresAt),a.actorSubject,a.sessionId,String(offset),String(pageSize)];
}
function token(a:SnapshotAnchor,offset:number,pageSize:number,key:Uint8Array):string{
 secret(key);validAnchor(a);
 if(!Number.isSafeInteger(offset)||offset<0||offset>a.totalRows||
  !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)
  throw Error('OPS_A2_CURSOR_ORDINAL_INVALID');
 const signed=fields(a,offset,pageSize);
 const mac=createHmac('sha256',key).update(lengthPrefixedUtf8(signed)).digest('hex');
 const output=Buffer.from(JSON.stringify([...signed,mac]),'utf8').toString('base64url');
 if(output.length>512)throw Error('OPS_A2_CURSOR_TOO_LARGE');
 return output;
}
export function issueSnapshotCursor(a:SnapshotAnchor,offset:number,
 pageSize:number,key:Uint8Array):string{return token(a,offset,pageSize,key);}
export function inspectSnapshotCursor(encoded:string,query:unknown,
 actor:{subject:string;sessionId:string},key:Uint8Array,
 now=Math.floor(Date.now()/1000)):Readonly<{anchor:SnapshotAnchor;offset:number;pageSize:number}>{
 secret(key);
 const q=validateStoresQuery(query);
 if(typeof encoded!=='string'||encoded.length<40||encoded.length>512||
  !/^[A-Za-z0-9_-]+$/.test(encoded))
  throw Error('OPS_A2_CURSOR_ENCODING_INVALID');
 const bytes=Buffer.from(encoded,'base64url');
 if(bytes.toString('base64url')!==encoded)throw Error('OPS_A2_CURSOR_NONCANONICAL');
 let value:unknown;try{value=JSON.parse(bytes.toString('utf8'));}
 catch{throw Error('OPS_A2_CURSOR_JSON_INVALID');}
 if(!Array.isArray(value)||value.length!==13||
  value.some(x=>typeof x!=='string'))
  throw Error('OPS_A2_CURSOR_EXACT_FIELDS_REQUIRED');
 const [v,snapshotId,scopeSha256,sourceEpoch,generation,total,
  snapshotSha256,expiry,subject,sessionId,position,size,mac]=value as string[];
 const anchor={snapshotId,scopeSha256,sourceEpoch,
  policyGeneration:Number(generation),totalRows:Number(total),
  snapshotSha256,expiresAt:Number(expiry),actorSubject:subject,sessionId};
 validAnchor(anchor);
 const offset=Number(position),pageSize=Number(size);
 if(v!==version||String(anchor.policyGeneration)!==generation||
   String(anchor.totalRows)!==total||String(anchor.expiresAt)!==expiry||
   String(offset)!==position||String(pageSize)!==size||
   !Number.isSafeInteger(now)||now<1||anchor.expiresAt<=now||
   anchor.expiresAt>now+lifetime||anchor.actorSubject!==actor.subject||
   anchor.sessionId!==actor.sessionId||
   anchor.scopeSha256!==snapshotScopeSha256(q)||pageSize!==q.limit)
  throw Error('OPS_A2_CURSOR_EXPIRED_SCOPE_POLICY_OR_SESSION_MISMATCH');
 const expected=createHmac('sha256',key).update(lengthPrefixedUtf8(
  fields(anchor,offset,pageSize))).digest();
 if(!hex.test(mac)||!timingSafeEqual(expected,Buffer.from(mac,'hex')))
  throw Error('OPS_A2_CURSOR_SIGNATURE_INVALID');
 if(!Number.isSafeInteger(offset)||offset<1||offset>=anchor.totalRows)
  throw Error('OPS_A2_CURSOR_OFFSET_INVALID');
 return Object.freeze({anchor:Object.freeze(anchor),offset,pageSize});
}
/** Check a complete frozen collection. The upstream snapshot digest must be
 * computed on these ordinals by the qualified snapshot issuer, not the UI.
 */
export function snapshotRowsSha256(rows:readonly OrdinalRow[]):string{
 // The shared encoder limits each call to 64 fields. Hash a fixed domain
 // followed by each row's three length-prefixed fields incrementally, rather
 // than imposing a hidden 21-row snapshot limit.
 const digest=createHash('sha256').update(
  lengthPrefixedUtf8(['HFT-OPS-A2-SNAPSHOT-ROWS-V1']));
 for(const r of rows)digest.update(lengthPrefixedUtf8([
  String(r.ordinal),r.rowSha256,r.movementId]));
 return digest.digest('hex');
}
export function verifyCompleteSnapshotPages(pages:readonly SnapshotPage<OrdinalRow>[]):void{
 if(pages.length===0)throw Error('OPS_A2_SNAPSHOT_NO_PAGES');
 const anchor=pages[0].anchor;validAnchor(anchor);
 const all:OrdinalRow[]=[];let expectedOffset=0;
 for(let i=0;i<pages.length;i++){
  const page=pages[i];validAnchor(page.anchor);
  if(JSON.stringify(page.anchor)!==JSON.stringify(anchor)||
   page.offset!==expectedOffset||page.rows.length===0&&anchor.totalRows!==0||
   page.rows.length>100)
   throw Error('OPS_A2_SNAPSHOT_PAGE_GAP_OR_ANCHOR_DRIFT');
  for(const row of page.rows){
   if(!Number.isSafeInteger(row.ordinal)||row.ordinal!==expectedOffset||
    !hex.test(row.rowSha256)||!identity.test(row.movementId))
    throw Error('OPS_A2_SNAPSHOT_DUPLICATE_GAP_OR_FORGED_ROW');
   all.push(row);expectedOffset++;
  }
  if(i<pages.length-1&&!page.nextCursor||
   i===pages.length-1&&page.nextCursor)
   throw Error('OPS_A2_SNAPSHOT_TRUNCATED_OR_EXTRA_PAGE');
 }
 if(expectedOffset!==anchor.totalRows||
   snapshotRowsSha256(all)!==anchor.snapshotSha256)
  throw Error('OPS_A2_SNAPSHOT_INCOMPLETE_OR_DIGEST_INVALID');
}
