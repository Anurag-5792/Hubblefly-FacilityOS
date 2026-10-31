/**
 * Read-only legacy HRMS reference normalization for HFT R1.
 *
 * An external HRMS record is NOT a FacilityOS employee master, a trusted
 * identity, an approval or an authorization to access stock. This module
 * only constructs an inactive CREATE request for the existing P3 governed
 * master-change workflow. Nothing here opens a connection or mutates data.
 */
import {createHash} from 'node:crypto';
import type {MasterChange} from '../masters/p3-contract.ts';

export type LegacyHrmsSource = 'DDL_SBAI_HRMS' | 'DDL_AIMIS_HRMS';
export type HftEmployeeScope = Readonly<{
  legalEntityId: string;
  siteId: string;
  warehouseId: string;
}>;
export type HrmsReferenceBinding = Readonly<{
  source: LegacyHrmsSource;
  sourceRevision: string;
  expectedCompanyName: string;
  scope: HftEmployeeScope;
  requestId: string;
}>;
export type HrmsEmployeeCandidate = Readonly<{
  state: 'UNVERIFIED_HRMS_REFERENCE';
  source: LegacyHrmsSource;
  sourceRevision: string;
  sourceEmployeeId: string;
  sourceWasActive: boolean;
  sourceFingerprintSha256: string;
  // The proposed change is always CREATE and remains inactive until approval.
  change: MasterChange;
  autoActivationAllowed: false;
  sourceAuthenticityEstablished: false;
}>;

const identifier=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const v4uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha=/^[0-9a-f]{40}$/;
const maxBatch=200;

function row(x:unknown):Record<string,unknown>{
  if(!x || typeof x!=='object' || Array.isArray(x))throw new Error('HRMS_RECORD_OBJECT_REQUIRED');
  return x as Record<string,unknown>;
}
function strictString(v:unknown,label:string,max=160):string{
  if(typeof v!=='string' || !v.length || v!==v.trim() || v.length>max || /[\x00-\x1f]/.test(v))
    throw new Error(`HRMS_${label}_INVALID`);
  return v;
}
function scopeId(value:string,label:string):string{
  if(typeof value!=='string'||!identifier.test(value))throw new Error(`HRMS_${label}_INVALID`);
  return value;
}
function validateBinding(binding:HrmsReferenceBinding):void{
  if(binding.source!=='DDL_SBAI_HRMS'&&binding.source!=='DDL_AIMIS_HRMS')
    throw new Error('HRMS_SOURCE_NOT_APPROVED_FOR_MAPPING');
  if(typeof binding.sourceRevision!=='string'||!sha.test(binding.sourceRevision))
    throw new Error('HRMS_SOURCE_REVISION_REQUIRED');
  strictString(binding.expectedCompanyName,'EXPECTED_COMPANY');
  for(const [k,v] of Object.entries(binding.scope))scopeId(v,k.toUpperCase());
  if(!v4uuid.test(binding.requestId))throw new Error('HRMS_P3_REQUEST_UUID_REQUIRED');
}
function sourceStatus(source:LegacyHrmsSource,employee:Record<string,unknown>):boolean{
  if(source==='DDL_SBAI_HRMS'){
    if(typeof employee.isActive!=='boolean')throw new Error('HRMS_EXPLICIT_ACTIVE_STATE_REQUIRED');
    return employee.isActive;
  }
  const status=employee.status;
  if(status!=='Active'&&status!=='Inactive'&&status!=='ACTIVE'&&status!=='INACTIVE')
    throw new Error('HRMS_EXPLICIT_ACTIVE_STATE_REQUIRED');
  return status==='Active'||status==='ACTIVE';
}
function digest(fields:readonly string[]):string{
  // Unambiguous length-prefix framing; a checksum is an identifier, not
  // cryptographic proof that the export was made by the HRMS owner.
  const h=createHash('sha256');
  for(const field of fields){
    const bytes=Buffer.from(field,'utf8');
    const length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);
    h.update(length);h.update(bytes);
  }
  return h.digest('hex');
}
export function proposeHftEmployeeFromHrms(
  sourceRecord:unknown,binding:HrmsReferenceBinding,
):HrmsEmployeeCandidate{
  validateBinding(binding);
  const source=row(sourceRecord);
  // Explicit source company is essential: client/project names and a shared
  // MongoDB connection never establish a legal employer or HFT site.
  const employer=strictString(source.company,'COMPANY');
  if(employer!==binding.expectedCompanyName)throw new Error('HRMS_LEGAL_COMPANY_MISMATCH');
  const employeeId=scopeId((binding.source==='DDL_SBAI_HRMS'?
    source.employeeId:source.empId) as string,'EMPLOYEE_ID');
  const fullName=strictString(source.name,'FULL_NAME');
  const department=strictString(source.department,'DEPARTMENT');
  const designation=strictString(binding.source==='DDL_SBAI_HRMS'?
    (source.designation??source.position):source.designation,'DESIGNATION');
  const wasActive=sourceStatus(binding.source,source);
  const fingerprint=digest([binding.source,binding.sourceRevision,
    employer,employeeId,fullName,department,designation,wasActive?'ACTIVE':'INACTIVE']);
  // No bank, Aadhaar/PAN, salary, attendance, phone, DOB or HR credentials
  // are retained or included in the P3 change request.
  const change:MasterChange=Object.freeze({
    contractVersion:'HFT-R1-P3-MASTER-V1',requestId:binding.requestId,
    kind:'EMPLOYEE',operation:'CREATE',
    legalEntityId:binding.scope.legalEntityId,siteId:binding.scope.siteId,
    warehouseId:binding.scope.warehouseId,recordId:employeeId,
    expectedVersion:'0',
    reason:`Unverified HRMS reference ${binding.source}; sha256=${fingerprint}; requires independent HFT approval`,
    values:Object.freeze({fullName,department,designation,siteId:binding.scope.siteId}),
  });
  return Object.freeze({state:'UNVERIFIED_HRMS_REFERENCE',source:binding.source,
    sourceRevision:binding.sourceRevision,sourceEmployeeId:employeeId,
    sourceWasActive:wasActive,sourceFingerprintSha256:fingerprint,change,
    autoActivationAllowed:false,sourceAuthenticityEstablished:false});
}

/**
 * Fail a complete proposed batch on duplicate employee identity, source
 * collision, oversized input, invalid tenant or invalid source record.
 * The caller must independently authenticate every source export and obtain
 * a distinct P3 requestId for each candidate before using this plan.
 */
export function proposeHftEmployeeBatchFromHrms(
  records:readonly unknown[],bindings:readonly HrmsReferenceBinding[],
):readonly HrmsEmployeeCandidate[]{
  if(records.length!==bindings.length||records.length>maxBatch)
    throw new Error('HRMS_BATCH_SIZE_OR_BINDINGS_INVALID');
  const employees=new Set<string>();
  const requests=new Set<string>();
  const result:HrmsEmployeeCandidate[]=[];
  for(let i=0;i<records.length;i++){
    const candidate=proposeHftEmployeeFromHrms(records[i],bindings[i]);
    const identity=`${candidate.change.legalEntityId}\u0000${candidate.change.recordId}`;
    if(employees.has(identity)||requests.has(candidate.change.requestId))
      throw new Error('HRMS_DUPLICATE_EMPLOYEE_OR_REQUEST');
    employees.add(identity);requests.add(candidate.change.requestId);
    result.push(candidate);
  }
  return Object.freeze(result);
}
