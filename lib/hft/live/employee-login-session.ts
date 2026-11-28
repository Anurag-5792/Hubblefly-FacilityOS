import {createHash,createPrivateKey,createPublicKey,randomUUID,sign,verify} from 'node:crypto';
import {employeeLoginProfileAdmitted,EMPLOYEE_LOGIN_ISSUER,EMPLOYEE_LOGIN_AUDIENCE} from './employee-login-profile.ts';
import {claimEmployee,currentEmployee,type EmployeeIdentity} from './employee-login-backend.ts';
import {verifyGoogleIdentity,cookieValue,type OidcConfig,type Flow} from './live-oidc.ts';
import {employeeAccess,type EmployeeLoginContext} from './employee-login-core.ts';
import type {SessionIdentity} from '../roles/role-service.ts';
type Env=Readonly<Record<string,string|undefined>>;
const name='__Host-hft_employee_session',common='Path=/; Secure; HttpOnly; SameSite=Lax';
export const clearEmployeeCookie=name+'=; '+common+'; Max-Age=0';
const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(v);
type Session=EmployeeIdentity&{jti:string;iat:number;exp:number;origin:string;iss:string;aud:string};
function identity(c:EmployeeLoginContext):EmployeeIdentity{
 return {legalEntityId:c.legalEntityId,employeeId:c.employeeId,subject:c.subject,personId:c.personId,siteId:c.siteId,employeeVersion:c.employeeVersion,loginVersion:c.loginVersion};
}
function valid(a:EmployeeIdentity){return [a.legalEntityId,a.employeeId,a.subject,a.personId,a.siteId].every(id)&&Number.isSafeInteger(a.loginVersion)&&a.loginVersion>0&&Number.isSafeInteger(a.employeeVersion)&&a.employeeVersion>0;}
export function issueEmployeeCookie(e:Env,c:EmployeeLoginContext):string{
 if(!employeeLoginProfileAdmitted(e)||!valid(c)||new URL(e.HFT_PUBLIC_ORIGIN??'').protocol!=='https:'||new URL(e.HFT_PUBLIC_ORIGIN??'').origin!==e.HFT_PUBLIC_ORIGIN)throw Error('HF101_SESSION_DENIED');
 const key=createPrivateKey(e.HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM??'');
 if(key.asymmetricKeyType!=='ed25519'||!createPublicKey(key).export({format:'der',type:'spki'}).equals(createPublicKey(e.HFT_SESSION_ED25519_PUBLIC_KEY_PEM??'').export({format:'der',type:'spki'})))throw Error('HF101_SIGNER_DENIED');
 const now=Math.floor(Date.now()/1000);
 const p:Session={...identity(c),jti:randomUUID(),iat:now,exp:now+600,origin:e.HFT_PUBLIC_ORIGIN!,iss:EMPLOYEE_LOGIN_ISSUER,aud:EMPLOYEE_LOGIN_AUDIENCE};
 const body=encode({alg:'EdDSA',typ:'JWT',kid:'hft-employee-101'})+'.'+encode(p);
 return name+'='+body+'.'+sign(null,Buffer.from(body,'ascii'),key).toString('base64url')+'; '+common+'; Max-Age=600';
}
export function readEmployeeSession(req:Request,e:Env):Session{
 if(!employeeLoginProfileAdmitted(e)||req.method!=='POST'||!e.HFT_PUBLIC_ORIGIN||new URL(req.url).protocol!=='https:'||new URL(req.url).origin!==e.HFT_PUBLIC_ORIGIN||req.headers.get('origin')!==e.HFT_PUBLIC_ORIGIN||
  (req.headers.has('sec-fetch-site')&&req.headers.get('sec-fetch-site')!=='same-origin')||req.headers.has('authorization')||req.headers.has('x-user-id'))throw Error('HF101_SESSION_DENIED');
 const raw=cookieValue(req.headers.get('cookie'),name);
 if(!raw||raw.length>4096)throw Error('HF101_SESSION_DENIED');
 const parts=raw.split('.');
 if(parts.length!==3||parts.some(x=>! /^[A-Za-z0-9_-]+$/.test(x)||Buffer.from(x,'base64url').toString('base64url')!==x))throw Error('HF101_SESSION_DENIED');
 const key=createPublicKey(e.HFT_SESSION_ED25519_PUBLIC_KEY_PEM??'');
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(parts[0]+'.'+parts[1],'ascii'),key,Buffer.from(parts[2],'base64url')))throw Error('HF101_SESSION_DENIED');
 const h=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')) as Session;
 const now=Math.floor(Date.now()/1000);
 if(!h||h.alg!=='EdDSA'||h.typ!=='JWT'||h.kid!=='hft-employee-101'||!p||!valid(p)||!id(p.jti)||
  p.iss!==EMPLOYEE_LOGIN_ISSUER||p.aud!==EMPLOYEE_LOGIN_AUDIENCE||p.origin!==e.HFT_PUBLIC_ORIGIN||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now+30||p.exp<=now||p.exp<=p.iat||p.exp-p.iat>600)throw Error('HF101_SESSION_DENIED');
 return p;
}
export async function completeEmployeeLogin(config:OidcConfig,e:Env,flow:Flow,code:string):Promise<string>{
 if(!config.employee||config.hosted||config.proofBinding||flow.identityProofOnly||flow.operatorReturn||flow.intakeReturn||!employeeLoginProfileAdmitted(e))throw Error('HF101_FLOW_DENIED');
 const verified=await verifyGoogleIdentity(config,e,flow,code);
 const c=await claimEmployee(e,verified.email,verified.providerSubject);
 return issueEmployeeCookie(e,c);
}
export async function employeeRoleSession(req:Request,e:Env):Promise<SessionIdentity>{
 const a=readEmployeeSession(req,e),c=await currentEmployee(e,a),access=employeeAccess(c,new Date().toISOString());
 const warehouseIds=access.scopes.filter(s=>s.permissions.includes('roles.read')).map(s=>s.warehouseId);
 if(!warehouseIds.length||warehouseIds.length>32||a.exp<=Date.now()/1000)throw Error('HF101_ROLE_SESSION_DENIED');
 return {subject:a.subject,sessionId:a.jti,expiresAt:a.exp,canonicalEmployeeId:a.employeeId,canonicalPersonId:a.personId,
 employeeLoginVersion:a.loginVersion,employeeRecordVersion:a.employeeVersion,
 hostedOperatorContext:createHash('sha256').update(JSON.stringify(['HF101',identity(c)])).digest('hex'),hostedStoresEnabled:false,
 scope:{legalEntityId:a.legalEntityId,siteId:a.siteId,warehouseIds}};
}
