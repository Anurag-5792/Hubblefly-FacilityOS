/** Scope-bound read-only Stores source. No direct SELECT or fabricated records. */
import {resolveVerifiedRequestOperator,assertVerifiedRequestOperator}
 from '../../../../../lib/hft/security/verified-request.ts';
import {validateStoresQuery,readP0Stores} from '../../../../../lib/hft/stores/p0-readback.ts';
import {openP0Pool,storesReadSignerFromEnvironment}
 from '../../../../../lib/hft/stores/p0-persistence.ts';
import {isRetainedStoresProfile,assertRetainedStoresProfile}
 from '../../../../../lib/hft/stores/ops-a2-retained-profile.ts';
import {operationalStoresSigner,clearStoresSigner}
 from '../../../../../lib/hft/stores/ops-a2-operator-signing.ts';
import {readOpsA2QualifiedSource}
 from '../../../../../lib/hft/persistence/ops-a2-stores-readback.ts';
import {requireApiBusinessRole}
 from '../../../../../lib/hft/roles/role-api-permission.ts';
import {RoleError} from '../../../../../lib/hft/roles/role-assignment.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, no-cache, must-revalidate',
 'X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code,durable:false},
 {status,headers});
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return fail(415,'P0_READ_JSON_REQUIRED');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>4096))
  return fail(413,'P0_READ_BODY_TOO_LARGE');
 try{
  const stores=isRetainedStoresProfile(process.env);
  const actor=resolveVerifiedRequestOperator(request,process.env,
   stores?'RETAINED_STORES_OPERATOR':'DEFAULT');
  const text=await request.text();
  if(Buffer.byteLength(text,'utf8')>4096) return fail(413,'P0_READ_BODY_TOO_LARGE');
  const q=validateStoresQuery(JSON.parse(text) as unknown);
  assertVerifiedRequestOperator(actor,q);
  if(stores){
   assertRetainedStoresProfile(process.env);
   // Fresh role is rechecked under the read-only stock transaction fence.
   const roleBinding=await requireApiBusinessRole(process.env,actor,{
    legalEntityId:q.legalEntityId,siteId:q.siteId,
    warehouseId:q.warehouseId
   },'stock.read');
   const signer=operationalStoresSigner(process.env);
   let db:ReturnType<typeof openP0Pool>|undefined;
   try{
    db=roleBinding.bind(openP0Pool(process.env));
    const verified=await readOpsA2QualifiedSource(db,process.env,
     q,actor,signer.p0Key,signer.p0KeyVersion);
    return Response.json(verified,{headers});
   }finally{
    clearStoresSigner(signer);
    if(db)await db.end();
   }
  }
  const key=storesReadSignerFromEnvironment(process.env);
  let db:ReturnType<typeof openP0Pool>|undefined;
  try{
   db=openP0Pool(process.env);
   return Response.json(await readP0Stores(db,process.env,q,actor,
    key.storesKey,key.storesKeyVersion),{headers});
  }finally{key.storesKey.fill(0);if(db)await db.end();}
 }catch(error){
  if(error instanceof RoleError)
   return fail(403,'P0_READ_CURRENT_BUSINESS_ROLE_DENIED');
  const message=error instanceof Error?error.message:'';
  if(message.includes('SESSION')||message.includes('REQUEST_ORIGIN')||
   message.includes('CROSS_SITE')||message.includes('SIGNED_SCOPE')||
   message.includes('AUTHENTICATION')||message.includes('VERIFIED_REQUEST'))
   return fail(401,'P0_READ_SESSION_DENIED');
  if(message.startsWith('P0_READ_')&&
   (message.includes('INVALID')||message.includes('REQUIRED')))
   return fail(422,'P0_READ_REQUEST_INVALID');
  return fail(503,'P0_READ_AUTHORITY_UNQUALIFIED');
 }
}
export async function GET(){return fail(405,'P0_READ_POST_REQUIRED');}
export async function PUT(){return fail(405,'P0_READ_POST_REQUIRED');}
