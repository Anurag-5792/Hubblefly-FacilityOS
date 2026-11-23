/** Restricted Stores RECEIVE — only the canonical OPS-A2 protected PostgreSQL
 * writer. No P3, QA gateway, direct stock DML, synthetic figures or auto-retry.
 * Fails closed until independently admitted runtime roles, source evidence,
 * managed keys and PG18.7 protected function ACLs are actually installed.
 */
import {resolveVerifiedRequestOperator,assertVerifiedRequestOperator}
 from '../../../../../lib/hft/security/verified-request.ts';
import {assertOperatorRuntimeProfile,isRoleQualificationAttempt}
 from '../../../../../lib/hft/roles/role-isolated-profile.ts';
import {validateP0Operation} from '../../../../../lib/hft/stores/p0-operations.ts';
import {openP0Pool} from '../../../../../lib/hft/stores/p0-persistence.ts';
import {operationalStoresSigner,clearStoresSigner}
 from '../../../../../lib/hft/stores/ops-a2-operator-signing.ts';
import {submitOpsA2QualifiedReceive}
 from '../../../../../lib/hft/persistence/ops-a2-stores-source.ts';
import {readOpsA2QualifiedSource}
 from '../../../../../lib/hft/persistence/ops-a2-stores-readback.ts';
import {requireApiBusinessRole}
 from '../../../../../lib/hft/roles/role-api-permission.ts';
import {RoleError} from '../../../../../lib/hft/roles/role-assignment.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({
 state:'UNAVAILABLE_OR_UNVERIFIED',code,automaticRetryAllowed:false
},{status,headers});
export async function POST(request:Request):Promise<Response>{
 try{assertOperatorRuntimeProfile(process.env);}
 catch{return fail(503,'OPS_A2_OPERATOR_RESOURCE_NOT_ADMITTED');}
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return fail(415,'OPS_A2_OPERATOR_JSON_REQUIRED');
 let actor:ReturnType<typeof resolveVerifiedRequestOperator>;
 try{actor=resolveVerifiedRequestOperator(request,process.env,
   isRoleQualificationAttempt(process.env)?'ISOLATED_ROLE_QUALIFICATION':'RETAINED_STORES_OPERATOR');}
 catch{return fail(401,'OPS_A2_OPERATOR_SIGNED_SESSION_REQUIRED');}
 let body:unknown;
 try{
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>16384)throw Error('BODY_OVERSIZE');
  body=JSON.parse(raw);
 }catch{return fail(422,'OPS_A2_OPERATOR_RECEIVE_BODY_INVALID');}
 let op:ReturnType<typeof validateP0Operation>;
 try{
  op=validateP0Operation(body);
  if(op.kind!=='IN'||op.qcState!=='ACCEPTED')
   throw Error('OPS_A2_RECEIVE_QC_ACCEPTED_REQUIRED');
  assertVerifiedRequestOperator(actor,op);
 }catch{return fail(422,'OPS_A2_RECEIVE_SCOPE_OR_ORIGINAL_QC_REQUIRED');}
 let pool:ReturnType<typeof openP0Pool>|undefined;
 let signer:ReturnType<typeof operationalStoresSigner>|undefined;
 let posted=false;
 try{
  // Preliminary role eligibility plus a binding rechecked under the STOCK
  // transaction fence. Protected GRN/QC/HOLD/person checks are unchanged.
  const roleBinding=await requireApiBusinessRole(process.env,actor,{
   legalEntityId:op.legalEntityId,siteId:op.siteId,
   warehouseId:op.warehouseId
  },'stores.receive');
  signer=operationalStoresSigner(process.env);
  pool=roleBinding.bind(openP0Pool(process.env));
  const result=await submitOpsA2QualifiedReceive(
   pool,process.env,op,actor,signer);
  if(result.requestId!==op.requestId||result.fact.movements.length!==2)
   throw Error('OPS_A2_OPERATOR_FACT_IDENTITY_NOT_VERIFIED_NO_RETRY');
  posted=true; // Only after authoritative original-nonce ledger reconciliation.
  const scope={contractVersion:'HFT-R1-P0-READ-V1' as const,
   legalEntityId:op.legalEntityId,siteId:op.siteId,
   warehouseId:op.warehouseId,itemCode:op.itemCode,
   productVersion:op.productVersion,employeeId:'',cursor:'',limit:100};
  const balances=await readOpsA2QualifiedSource(pool,process.env,{
   ...scope,intent:'BALANCES',leafLocationId:op.leafLocationId
  },actor,signer.p0Key,signer.p0KeyVersion);
  if(balances.nextCursor)
   throw Error('OPS_A2_BALANCE_READBACK_PAGINATED_NO_RETRY');
  const selected=balances.rows.filter(row=>
   row.accountKind==='AVAILABLE'&&row.condition==='GOOD'&&
   row.leafLocationId===op.leafLocationId&&
   row.serialNo===op.serialNo&&row.batchNo===op.batchNo&&
   row.employeeId==='');
  if(selected.length!==1)
   throw Error('OPS_A2_BIN_BALANCE_READBACK_REQUIRED_NO_RETRY');
  const history=await readOpsA2QualifiedSource(pool,process.env,{
   ...scope,intent:'MOVEMENTS',leafLocationId:''
  },actor,signer.p0Key,signer.p0KeyVersion);
  const legs=history.rows.filter(row=>row.commandUuid===op.requestId);
  if(history.nextCursor||legs.length!==2||
   !legs.some(row=>row.accountKind==='EXTERNAL')||
   !legs.some(row=>row.accountKind==='AVAILABLE'))
   throw Error('OPS_A2_RECEIVE_MOVEMENT_HISTORY_REQUIRED_NO_RETRY');
  return Response.json({
   state:'POSTED_VERIFIED',requestId:op.requestId,
   durable:true,stockChanged:true,kind:'IN',
   productVersion:op.productVersion,quantity:op.quantity,
   sourceEpoch:balances.sourceEpoch,binBalance:selected[0].quantity,
   leafLocationId:op.leafLocationId,stockState:'AVAILABLE',
   movementCount:legs.length,
   movementIds:legs.map(row=>row.movementId),
   movementAuditSha256:legs.map(row=>row.auditSha256),
   automaticRetryAllowed:false
  },{headers});
 }catch(error){
  const e=error instanceof Error?error.message:'';
  if(posted||e.includes('UNCERTAIN')||e.includes('NO_RETRY'))
   return fail(409,'OPS_A2_RECEIVE_OUTCOME_RECONCILE_NO_RETRY');
  if(error instanceof RoleError)
   return fail(403,'OPS_A2_CURRENT_BUSINESS_ROLE_DENIED');
  if(e.includes('SESSION')||e.includes('SIGNED_SCOPE')||
   e.includes('VERIFIED_REQUEST_IDENTITY'))
   return fail(401,'OPS_A2_OPERATOR_SESSION_OR_SCOPE_DENIED');
  // No SQL, grant, key or source-document internals cross the HTTP boundary.
  return fail(503,'OPS_A2_PROTECTED_RECEIVE_NOT_QUALIFIED');
 }finally{
  if(signer)clearStoresSigner(signer);
  if(pool)await pool.end();
 }
}
export async function GET(){return fail(405,'OPS_A2_RECEIVE_POST_ONLY');}
