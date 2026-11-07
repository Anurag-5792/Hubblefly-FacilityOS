/**
 * HFT R1 P0: Strict physical location and count-evidence contracts.
 * SOURCE-ONLY; no database writes or authorization to post/open/transfer stock.
 * A location is a scoped immutable ID resolved through its actual ancestors.
 */
import {parseQuantity, formatQuantity, formatSignedQuantity} from './quantity.ts';

export type LocationKind = 'RACK'|'LEVEL'|'POSITION'|'STACK_SLOT'|'BIN'|'CONTAINER'|'AREA';
export type LocationScope = Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type PhysicalLocation = Readonly<LocationScope&{
  id:string; parentId:string|null; kind:LocationKind; active:boolean;
  /** Only an authorized open-floor AREA can be a leaf, with evidence. */
  openFloorApproved?:boolean; openFloorEvidenceId?:string;
}>;
export type ResolvedLocation = Readonly<LocationScope&{
  leafLocationId:string; path:readonly Readonly<{id:string;kind:LocationKind}>[];
  fullPath:string; locationKind:LocationKind;
}>;

const ident=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const hierarchy:Readonly<Record<LocationKind,readonly LocationKind[]>>={
  RACK:['LEVEL'], LEVEL:['POSITION'], POSITION:['STACK_SLOT','BIN'],
  STACK_SLOT:['BIN','CONTAINER'], BIN:['CONTAINER'], CONTAINER:[],
  AREA:['BIN','CONTAINER']
};
function validId(id:string):boolean {return typeof id==='string' && ident.test(id);}
function scopeKey(s:LocationScope):string {return JSON.stringify([s.legalEntityId,s.siteId,s.warehouseId]);}
function assertScope(s:LocationScope):void {
  if(!validId(s.legalEntityId)||!validId(s.siteId)||!validId(s.warehouseId))
    throw new Error('LOCATION_SCOPE_INVALID');
}
/** Validation never trusts a pre-rendered/free-text path supplied by an operator. */
export function resolveLeafLocation(nodes:readonly PhysicalLocation[],scope:LocationScope,leafId:string):ResolvedLocation {
  assertScope(scope);
  if(!validId(leafId))throw new Error('LOCATION_LEAF_ID_INVALID');
  if(!Array.isArray(nodes)||nodes.length===0||nodes.length>20000)throw new Error('LOCATION_REGISTRY_INVALID');
  const index=new Map<string,PhysicalLocation>();
  for(const node of nodes){
    if(!validId(node.id)||node.parentId!==null&&!validId(node.parentId)||!Object.hasOwn(hierarchy,node.kind)
      ||typeof node.active!=='boolean')throw new Error('LOCATION_NODE_INVALID');
    if(scopeKey(node)!==scopeKey(scope))throw new Error('LOCATION_CROSS_SCOPE');
    if(index.has(node.id))throw new Error('LOCATION_DUPLICATE_ID');
    index.set(node.id,node);
  }
  const found=index.get(leafId);
  if(!found)throw new Error('LOCATION_LEAF_NOT_FOUND');
  const seen=new Set<string>();
  const reverse:PhysicalLocation[]=[];
  let node:PhysicalLocation|undefined=found;
  while(node){
    if(seen.has(node.id))throw new Error('LOCATION_CYCLE');
    seen.add(node.id);
    if(!node.active)throw new Error('LOCATION_INACTIVE_ANCESTOR');
    reverse.push(node);
    if(node.parentId===null)break;
    const parent=index.get(node.parentId);
    if(!parent)throw new Error('LOCATION_PARENT_NOT_FOUND');
    if(!hierarchy[parent.kind].includes(node.kind))throw new Error('LOCATION_HIERARCHY_INVALID');
    node=parent;
  }
  const root=reverse.at(-1)!;
  if(root.kind!=='RACK'&&root.kind!=='AREA')throw new Error('LOCATION_ROOT_KIND_INVALID');
  if(index.size===0)throw new Error('LOCATION_REGISTRY_INVALID');
  if([...index.values()].some(x=>x.parentId===leafId))throw new Error('LOCATION_NOT_LEAF');
  const isFloor=found.kind==='AREA'&&found.openFloorApproved===true
     &&typeof found.openFloorEvidenceId==='string'&&validId(found.openFloorEvidenceId);
  if(found.kind!=='BIN'&&found.kind!=='CONTAINER'&&!isFloor)
    throw new Error('LOCATION_BIN_OR_APPROVED_FLOOR_REQUIRED');
  if(found.kind==='AREA'&&!isFloor)throw new Error('LOCATION_FLOOR_AUTHORITY_REQUIRED');
  const path=reverse.reverse().map(n=>Object.freeze({id:n.id,kind:n.kind}));
  return Object.freeze({...scope,leafLocationId:leafId,path:Object.freeze(path),
    fullPath:[scope.warehouseId,...path.map(p=>p.id)].join('/'),locationKind:found.kind});
}

export type CountItemControl='NONE'|'SERIAL'|'BATCH';
export type CountCondition='GOOD'|'DAMAGED'|'QUARANTINE';
export type CountBucket='LOOSE'|'INSTALLED_WIP'|'QUARANTINE'|'OTHER';
export type PhysicalCountLine=Readonly<{
  lineId:string;leafLocationId:string;itemCode:string;productVersion:string;
  itemControl:CountItemControl;quantity:string;uom:string;serialNo?:string;batchNo?:string;
  condition:CountCondition;bucket:CountBucket;counterPersonId:string;
  countedAt:string;evidenceId:string;
}>;
export type CountSession=Readonly<LocationScope&{
  sessionId:string;stockEpoch:string;lines:readonly PhysicalCountLine[];
}>;
export type CountObservation=Readonly<{
  lineId:string;sessionId:string;stockEpoch:string;itemCode:string;
  productVersion:string;leafLocationId:string;locationPath:string;
  serialNo:string;batchNo:string;condition:CountCondition;bucket:CountBucket;
  countedQuantity:string;referenceQuantity:string;variance:string;
  /** Evidence only: does not authorize adjustment, transfer or stock posting. */
  postingAuthorized:false;
}>;
/** One scope/epoch/leaf/item/version/batch/serial/condition identifies one physical count line. */
export function countObservationKey(scope:LocationScope,epoch:string,line:PhysicalCountLine):string {
  return JSON.stringify([scope.legalEntityId,scope.siteId,scope.warehouseId,epoch,
    line.leafLocationId,line.itemCode,line.productVersion,line.serialNo??'',
    line.batchNo??'',line.bucket,line.condition]);
}
/**
 * Count-only normalization and reconciliation. No stock mutation or inference
 * that counted items are AVAILABLE. The authoritative reference must come from
 * a separately verified, single-watermark database snapshot.
 */
export function preparePhysicalCounts(session:CountSession,locations:readonly PhysicalLocation[],
  referenceByExactKey:ReadonlyMap<string,string>):readonly CountObservation[] {
  assertScope(session);
  if(!validId(session.sessionId)||!validId(session.stockEpoch)||
    !Array.isArray(session.lines)||session.lines.length===0||session.lines.length>50000)
    throw new Error('COUNT_SESSION_INVALID');
  const seenKeys=new Set<string>(),seenLines=new Set<string>(),seenSerials=new Set<string>();
  return Object.freeze(session.lines.map(line=>{
    if(!validId(line.lineId)||!validId(line.itemCode)||!validId(line.productVersion)||
      !validId(line.uom)||!validId(line.counterPersonId)||!validId(line.evidenceId)||
      !['NONE','SERIAL','BATCH'].includes(line.itemControl)||
      !['GOOD','DAMAGED','QUARANTINE'].includes(line.condition)||
      !['LOOSE','INSTALLED_WIP','QUARANTINE','OTHER'].includes(line.bucket)||
      !Number.isFinite(Date.parse(line.countedAt))||
      new Date(line.countedAt).toISOString()!==line.countedAt)
      throw new Error('COUNT_LINE_INVALID');
    if(seenLines.has(line.lineId))throw new Error('COUNT_LINE_ID_DUPLICATE');
    seenLines.add(line.lineId);
    const s=line.serialNo??'',b=line.batchNo??'';
    if(line.itemControl==='SERIAL'){
      if(!validId(s)||b)throw new Error('COUNT_SERIAL_INVALID');
      const serialKey=JSON.stringify([session.legalEntityId,line.itemCode,s]);
      if(seenSerials.has(serialKey))throw new Error('COUNT_SERIAL_MULTIPLE_LOCATIONS');
      seenSerials.add(serialKey);
    }else if(s)throw new Error('COUNT_UNEXPECTED_SERIAL');
    if(line.itemControl==='BATCH'&&!validId(b))throw new Error('COUNT_BATCH_REQUIRED');
    if(line.itemControl!=='BATCH'&&b)throw new Error('COUNT_UNEXPECTED_BATCH');
    const observed=parseQuantity(line.quantity);
    if(line.itemControl==='SERIAL'&&observed!==0n&&observed!==1000000n)
      throw new Error('COUNT_SERIAL_QTY_INVALID');
    const location=resolveLeafLocation(locations,session,line.leafLocationId);
    const key=countObservationKey(session,session.stockEpoch,line);
    if(seenKeys.has(key))throw new Error('COUNT_DUPLICATE_IDENTITY_AND_LOCATION');
    seenKeys.add(key);
    const baseline=parseQuantity(referenceByExactKey.get(key)??'0');
    return Object.freeze({lineId:line.lineId,sessionId:session.sessionId,stockEpoch:session.stockEpoch,
      itemCode:line.itemCode,productVersion:line.productVersion,
      leafLocationId:location.leafLocationId,locationPath:location.fullPath,
      serialNo:s,batchNo:b,condition:line.condition,bucket:line.bucket,
      countedQuantity:formatQuantity(observed),referenceQuantity:formatQuantity(baseline),
      variance:formatSignedQuantity(observed-baseline),postingAuthorized:false as const});
  }));
}
/** Read-only transfer intent; must be executed later by the one protected DB writer. */
export function prepareLocationTransfer(scope:LocationScope,locations:readonly PhysicalLocation[],
 sourceLeafId:string,destinationLeafId:string,quantity:string):Readonly<{
  source:ResolvedLocation;destination:ResolvedLocation;quantity:string;posted:false
}> {
 const source=resolveLeafLocation(locations,scope,sourceLeafId);
 const destination=resolveLeafLocation(locations,scope,destinationLeafId);
 if(source.leafLocationId===destination.leafLocationId)throw new Error('TRANSFER_SAME_LOCATION');
 const q=parseQuantity(quantity);
 if(q<=0n)throw new Error('TRANSFER_QUANTITY_INVALID');
 return Object.freeze({source,destination,quantity:formatQuantity(q),posted:false as const});
}
