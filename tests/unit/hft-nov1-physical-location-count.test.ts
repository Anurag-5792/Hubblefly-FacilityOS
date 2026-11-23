import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLeafLocation,preparePhysicalCounts,prepareLocationTransfer,
  countObservationKey,type PhysicalLocation,type CountSession
} from '../../lib/hft/domain/physical-location-count.ts';
const s={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const node=(id:string,kind:PhysicalLocation['kind'],parentId:string|null,extra:Partial<PhysicalLocation>={}):PhysicalLocation=>({...s,id,kind,parentId,active:true,...extra});
const loc:readonly PhysicalLocation[]=[
  node('R01','RACK',null),node('L02','LEVEL','R01'),node('P03','POSITION','L02'),
  node('S1','STACK_SLOT','P03'),node('BN04','BIN','S1'),node('BN05','BIN','S1')
];
const count=(changes:Partial<CountSession['lines'][number]>={}):CountSession['lines'][number]=>({
  lineId:'L1',leafLocationId:'BN04',itemCode:'MTR100',productVersion:'V1',
  itemControl:'NONE',quantity:'3',uom:'PCS',condition:'GOOD',bucket:'LOOSE',
  counterPersonId:'PERSON1',countedAt:'2026-10-29T00:00:00.000Z',evidenceId:'EVID1',...changes
});
const session=(lines:CountSession['lines']):CountSession=>({...s,sessionId:'SESSION1',stockEpoch:'EPOCH1',lines});
const deny=(fn:()=>unknown,code:string)=>assert.throws(fn,new RegExp(code));

test('resolves exact warehouse/rack/level/position/stack/bin path',()=>{
 const x=resolveLeafLocation(loc,s,'BN04');
 assert.equal(x.fullPath,'WH1/R01/L02/P03/S1/BN04');
 assert.equal(x.path.map(p=>p.kind).join('/'),'RACK/LEVEL/POSITION/STACK_SLOT/BIN');
 assert.equal(x.leafLocationId,'BN04');
});
test('rejects a parent rack used as a stocked leaf',()=>deny(()=>resolveLeafLocation(loc,s,'R01'),'LOCATION_NOT_LEAF'));
test('rejects inactive rack or bin',()=>{
 deny(()=>resolveLeafLocation(loc.map(n=>n.id==='R01'?{...n,active:false}:n),s,'BN04'),'LOCATION_INACTIVE_ANCESTOR');
 deny(()=>resolveLeafLocation(loc.map(n=>n.id==='BN04'?{...n,active:false}:n),s,'BN04'),'LOCATION_INACTIVE_ANCESTOR');
});
test('rejects cross-company and cross-site node contamination',()=>{
 deny(()=>resolveLeafLocation([...loc,{...loc[0],legalEntityId:'DDL'}],s,'BN04'),'LOCATION_CROSS_SCOPE');
 deny(()=>resolveLeafLocation([...loc,{...loc[0],siteId:'SITE2'}],s,'BN04'),'LOCATION_CROSS_SCOPE');
});
test('rejects wrong parent kind and missing parent',()=>{
 deny(()=>resolveLeafLocation(loc.map(n=>n.id==='BN04'?{...n,parentId:'R01'}:n),s,'BN04'),'LOCATION_HIERARCHY_INVALID');
 deny(()=>resolveLeafLocation(loc.map(n=>n.id==='L02'?{...n,parentId:'UNKNOWN'}:n),s,'BN04'),'LOCATION_PARENT_NOT_FOUND');
});
test('rejects duplicated location IDs, including ambiguous leaf',()=>{
 deny(()=>resolveLeafLocation([...loc,loc[4]],s,'BN04'),'LOCATION_DUPLICATE_ID');
});
test('rejects cycles and malformed top-level locations',()=>{
 const c=[node('AA','BIN','BB'),node('BB','CONTAINER','AA')];
 deny(()=>resolveLeafLocation(c,s,'AA'),'LOCATION_HIERARCHY_INVALID');
 deny(()=>resolveLeafLocation([node('AA','BIN',null)],s,'AA'),'LOCATION_ROOT_KIND_INVALID');
});
test('governed open floor area may be a leaf only with explicit evidence',()=>{
 const floor=node('FLR01','AREA',null,{openFloorApproved:true,openFloorEvidenceId:'AUTH01'});
 assert.equal(resolveLeafLocation([floor],s,'FLR01').fullPath,'WH1/FLR01');
 deny(()=>resolveLeafLocation([{...floor,openFloorEvidenceId:''}],s,'FLR01'),'LOCATION_BIN_OR_APPROVED_FLOOR_REQUIRED');
 deny(()=>resolveLeafLocation([{...floor,openFloorApproved:false}],s,'FLR01'),'LOCATION_BIN_OR_APPROVED_FLOOR_REQUIRED');
});
test('different bins produce different physical-count observations',()=>{
 const lines=[count(),count({lineId:'L2',leafLocationId:'BN05',quantity:'2'})];
 const x=preparePhysicalCounts(session(lines),loc,new Map());
 assert.equal(x.length,2);
 assert.equal(x[0].countedQuantity,'3');
 assert.equal(x[1].locationPath,'WH1/R01/L02/P03/S1/BN05');
 assert.ok(x.every(y=>y.postingAuthorized===false));
});
test('baseline variance uses six-decimal exact arithmetic and does not post stock',()=>{
 const l=count({quantity:'3.125'}),key=countObservationKey(s,'EPOCH1',l);
 const x=preparePhysicalCounts(session([l]),loc,new Map([[key,'5.25']]));
 assert.equal(x[0].variance,'-2.125');
 assert.equal(x[0].referenceQuantity,'5.25');
 assert.equal(x[0].postingAuthorized,false);
});
test('duplicate same item/version/location identity cannot inflate counts',()=>{
 deny(()=>preparePhysicalCounts(session([count(),count({lineId:'L2',quantity:'4'})]),loc,new Map()),'COUNT_DUPLICATE_IDENTITY_AND_LOCATION');
});
test('duplicate serial in two bins fails closed',()=>{
 const a=count({itemControl:'SERIAL',serialNo:'SN001',quantity:'1'});
 const b=count({itemControl:'SERIAL',serialNo:'SN001',quantity:'1',lineId:'L2',leafLocationId:'BN05'});
 deny(()=>preparePhysicalCounts(session([a,b]),loc,new Map()),'COUNT_SERIAL_MULTIPLE_LOCATIONS');
});
test('serialized counts require exactly one or zero (observed absence)',()=>{
 deny(()=>preparePhysicalCounts(session([count({itemControl:'SERIAL',serialNo:'SN001',quantity:'2'})]),loc,new Map()),'COUNT_SERIAL_QTY_INVALID');
 assert.equal(preparePhysicalCounts(session([count({itemControl:'SERIAL',serialNo:'SN001',quantity:'0'})]),loc,new Map())[0].countedQuantity,'0');
});
test('batch-controlled items require batch and forbid serial',()=>{
 deny(()=>preparePhysicalCounts(session([count({itemControl:'BATCH',batchNo:''})]),loc,new Map()),'COUNT_BATCH_REQUIRED');
 deny(()=>preparePhysicalCounts(session([count({itemControl:'BATCH',batchNo:'B01',serialNo:'SN01'})]),loc,new Map()),'COUNT_UNEXPECTED_SERIAL');
});
test('regular items reject undocumented serial/batch',()=>{
 deny(()=>preparePhysicalCounts(session([count({serialNo:'S001'})]),loc,new Map()),'COUNT_UNEXPECTED_SERIAL');
 deny(()=>preparePhysicalCounts(session([count({batchNo:'B01'})]),loc,new Map()),'COUNT_UNEXPECTED_BATCH');
});
test('invalid or missing version/counter/evidence/time fails closed',()=>{
 for(const change of [{productVersion:''},{counterPersonId:''},{evidenceId:''},{countedAt:'2026-99-99'}])
  deny(()=>preparePhysicalCounts(session([count(change)]),loc,new Map()),'COUNT_LINE_INVALID');
});
test('location transfer prepares two exact leaf addresses, never posts',()=>{
 const p=prepareLocationTransfer(s,loc,'BN04','BN05','1.25');
 assert.equal(p.source.fullPath,'WH1/R01/L02/P03/S1/BN04');
 assert.equal(p.destination.fullPath,'WH1/R01/L02/P03/S1/BN05');
 assert.equal(p.quantity,'1.25');
 assert.equal(p.posted,false);
});
test('reject zero, source equals destination and parent location for transfers',()=>{
 deny(()=>prepareLocationTransfer(s,loc,'BN04','BN04','1'),'TRANSFER_SAME_LOCATION');
 deny(()=>prepareLocationTransfer(s,loc,'BN04','BN05','0'),'TRANSFER_QUANTITY_INVALID');
 deny(()=>prepareLocationTransfer(s,loc,'R01','BN05','1'),'LOCATION_NOT_LEAF');
});
test('rejects duplicate observation line identifier',()=>{
 deny(()=>preparePhysicalCounts(session([count(),count({leafLocationId:'BN05'})]),loc,new Map()),'COUNT_LINE_ID_DUPLICATE');
});
