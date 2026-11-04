/** C050: read-only normalization of existing authenticated HFT P3 Employee LIST.
 * Donor HRMS fields, roles and private records are NEVER imported.
 */
export type EmployeeScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type EmployeeMasterRow=Readonly<{
 recordId:string;version:string;active:boolean;
 legalEntityId:string;siteId:string;fullName:string;department:string;designation:string;
}>;
export type EmployeeFilter=Readonly<{
 search:string;department:string;designation:string;status:'ALL'|'ACTIVE'|'INACTIVE';
}>;
const scopeId=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw Error('C050_EMPLOYEE_INVALID_RECORD');
 return input as Record<string,unknown>;
}
function requiredText(input:unknown,name:string,max=160):string{
 if(typeof input!=='string'||input!==input.trim()||!input.trim()||input.length>max)
  throw Error('C050_EMPLOYEE_'+name+'_INVALID');
 return input;
}
function revision(input:unknown):string{
 const str=typeof input==='number'&&Number.isSafeInteger(input)?String(input):input;
 if(typeof str!=='string'||!/^[1-9][0-9]*$/.test(str)||
    BigInt(str)>9223372036854775807n)
  throw Error('C050_EMPLOYEE_REVISION_INVALID');
 return str;
}
export function readEmployeeDirectory(raw:readonly unknown[],scope:EmployeeScope):readonly EmployeeMasterRow[]{
 if(![scope.legalEntityId,scope.siteId,scope.warehouseId].every(x=>scopeId.test(x)))
  throw Error('C050_EMPLOYEE_SCOPE_INVALID');
 // P3 read permits at most 50 records. A larger response is not a verified P3 LIST.
 if(!Array.isArray(raw)||raw.length>50)throw Error('C050_EMPLOYEE_P3_RESULT_LIMIT');
 const ids=new Set<string>();
 return Object.freeze(raw.map(candidate=>{
  const row=object(candidate),values=object(row.master_values);
  const recordId=requiredText(row.record_id,'ID');
  if(!scopeId.test(recordId)||ids.has(recordId))throw Error('C050_EMPLOYEE_DUPLICATE_OR_INVALID_ID');
  ids.add(recordId);
  if(row.legal_entity_id!==scope.legalEntityId||
     row.site_id!==scope.siteId||
     (row.warehouse_id!==''&&row.warehouse_id!==scope.warehouseId))
   throw Error('C050_EMPLOYEE_CROSS_SCOPE_DENIED');
  if(row.kind!==undefined&&row.kind!=='EMPLOYEE')throw Error('C050_EMPLOYEE_KIND_INVALID');
  if(row.active!==true&&row.active!==false)throw Error('C050_EMPLOYEE_ACTIVE_INVALID');
  if(values.siteId!==scope.siteId)throw Error('C050_EMPLOYEE_SITE_MISMATCH');
  const permitted=new Set(['fullName','department','designation','siteId']);
  if(Object.keys(values).some(k=>!permitted.has(k)))throw Error('C050_EMPLOYEE_PRIVATE_FIELDS_NOT_ALLOWED');
  return Object.freeze({recordId,version:revision(row.version),active:row.active,
   legalEntityId:scope.legalEntityId,siteId:scope.siteId,
   fullName:requiredText(values.fullName,'NAME'),
   department:requiredText(values.department,'DEPARTMENT'),
   designation:requiredText(values.designation,'DESIGNATION')});
 }));
}
export function filterEmployeeDirectory(rows:readonly EmployeeMasterRow[],filter:EmployeeFilter):readonly EmployeeMasterRow[]{
 const needle=filter.search.trim().toLocaleLowerCase('en');
 return rows.filter(row=>
  (filter.status==='ALL'||(filter.status==='ACTIVE')===row.active)&&
  (!filter.department||row.department===filter.department)&&
  (!filter.designation||row.designation===filter.designation)&&
  (!needle||[row.recordId,row.fullName,row.department,row.designation]
    .some(value=>value.toLocaleLowerCase('en').includes(needle))));
}
export type EmployeeEditDraft=Readonly<{
 draftState:'PROPOSED_NOT_APPLIED';contractVersion:'HFT-R1-P3-MASTER-V1';
 requestId:string;kind:'EMPLOYEE';operation:'EDIT';legalEntityId:string;
 siteId:string;warehouseId:string;recordId:string;expectedVersion:string;reason:string;
 values:Readonly<{fullName:string;department:string;designation:string;siteId:string}>;
}>;
/** Only a draft for existing /api/hft/masters; never a direct employee UPDATE. */
export function proposeEmployeeEdit(row:EmployeeMasterRow,scope:EmployeeScope,
 requestId:string,reason:string):EmployeeEditDraft{
 if(!uuid.test(requestId))throw Error('C050_EMPLOYEE_REQUEST_ID_INVALID');
 if(row.legalEntityId!==scope.legalEntityId||row.siteId!==scope.siteId||
    !scopeId.test(scope.warehouseId))throw Error('C050_EMPLOYEE_CROSS_SCOPE_EDIT');
 if(reason!==reason.trim()||reason.length<8||reason.length>300)
  throw Error('C050_EMPLOYEE_REASON_INVALID');
 return Object.freeze({draftState:'PROPOSED_NOT_APPLIED',
  contractVersion:'HFT-R1-P3-MASTER-V1',requestId,kind:'EMPLOYEE',
  operation:'EDIT',legalEntityId:scope.legalEntityId,
  siteId:scope.siteId,warehouseId:scope.warehouseId,recordId:row.recordId,
  expectedVersion:row.version,reason,values:Object.freeze({
   fullName:row.fullName,department:row.department,
   designation:row.designation,siteId:row.siteId})});
}
/** Strip UI-only state before invoking the existing strict P3 API. */
export function toP3EmployeeRequest(draft:EmployeeEditDraft){
 const {draftState:_state,...change}=draft;
 return {intent:'SUBMIT' as const,change};
}
