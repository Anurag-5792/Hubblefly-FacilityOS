/** HFT Item product-version gallery and approved image bytes.
 * Reuses existing signed-session identity AND protected P3 database read.
 * POST only: no unauthenticated public image URLs or DD references.
 */
import {resolveVerifiedRequestOperator} from '../../../../../lib/hft/security/verified-request.ts';
import {openP3Pool,assertP3Environment} from '../../../../../lib/hft/masters/p3-database.ts';
import {readP3ItemGallery} from '../../../../../lib/hft/masters/p3-service.ts';
import {validateItemGalleryRequest,parseScopedItemGallery,publicItemGallery,
 readApprovedHftPhoto} from '../../../../../lib/hft/masters/p3-item-gallery.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const common={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function error(status:number,code:string):Response{
 return Response.json({state:'UNAVAILABLE',code},{status,headers:common});
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return error(415,'P3_ITEM_GALLERY_JSON_REQUIRED');
 const length=Number(request.headers.get('content-length')||0);
 if(!Number.isSafeInteger(length)||length>4096)return error(413,'P3_ITEM_GALLERY_BODY_TOO_LARGE');
 try{
  assertP3Environment(process.env);
  const actor=resolveVerifiedRequestOperator(request,process.env);
  const raw=await request.text();
  if(raw.length>4096)return error(413,'P3_ITEM_GALLERY_BODY_TOO_LARGE');
  let body:unknown;try{body=JSON.parse(raw);}catch{return error(400,'P3_ITEM_GALLERY_JSON_INVALID');}
  const input=validateItemGalleryRequest(body);
  const pool=openP3Pool(process.env);
  try{
   const {legalEntityId,siteId,warehouseId,itemCode}=input;
   const reply=await readP3ItemGallery(pool,process.env,actor,{
    intent:'ITEM_GALLERY',kind:'ITEM',legalEntityId,siteId,warehouseId,
    recordId:itemCode,search:''
   });
   const gallery=parseScopedItemGallery(reply,{legalEntityId,siteId,warehouseId},itemCode);
   if(input.action==='LIST'){
    return Response.json({state:'AVAILABLE',gallery:publicItemGallery(gallery)},
     {headers:common});
   }
   const asset=await readApprovedHftPhoto(gallery,input.versionCode!,input.mediaId!,
     process.env.HFT_ITEM_MEDIA_ROOT);
   return new Response(new Uint8Array(asset.bytes),{status:200,headers:{
    ...common,'Content-Type':asset.mimeType,'Content-Length':String(asset.bytes.length),
    'Content-Security-Policy':"default-src 'none'; sandbox",
    'X-Content-SHA256':asset.sha256
   }});
  }finally{
   const closable=pool as typeof pool&{end?:()=>Promise<void>};
   if(closable.end)await closable.end();
  }
 }catch(err){
  const code=err instanceof Error?err.message:'P3_ITEM_GALLERY_FAILURE';
  if(code.includes('SESSION_')||code.includes('REQUEST_ORIGIN')||
   code.includes('CROSS_SITE')||code.includes('UNTRUSTED_AUTHENTICATION'))
   return error(401,'P3_SIGNED_SESSION_REQUIRED');
  if(code.includes('SIGNED_SCOPE')||code.includes('PROTECTED_READ_CROSS')||
   code.includes('P3_READ_PERSISTED_SCOPE_DENIED'))
   return error(403,'P3_ITEM_GALLERY_SCOPE_DENIED');
  if(code.startsWith('P3_GALLERY_REQUEST')||code.startsWith('P3_GALLERY_ACTION')||
   code.startsWith('P3_GALLERY_ITEM_INVALID')||code.startsWith('P3_GALLERY_VERSION_INVALID')||
   code.startsWith('P3_GALLERY_MEDIA_INVALID'))
   return error(400,'P3_ITEM_GALLERY_INVALID_REQUEST');
  // No SQL details, HFT storage key or actual file path in responses.
  return error(503,'P3_ITEM_GALLERY_NOT_QUALIFIED');
 }
}
export async function GET():Promise<Response>{
 return error(405,'P3_ITEM_GALLERY_POST_ONLY');
}
