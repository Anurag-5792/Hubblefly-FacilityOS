/** Real external OpenID Connect identity handoff for LIVE R1 production Masters.
 * Requires independently enrolled OIDC client and Ed25519 issuer secrets.
 * Never creates a fake user, approves a Master, or grants stock authority.
 */
import {createCipheriv,createDecipheriv,createHash,createHmac,createPrivateKey,
 createPublicKey,randomBytes,randomUUID,sign,timingSafeEqual,verify}
 from 'node:crypto';
import {assertLiveProfile,type LiveEnv} from './live-profile.ts';
import {identityProofModeAdmitted} from './live-identity-mode.ts';
import {hostedOperatorAttempt,hostedOperatorMode} from '../roles/hosted-operator-profile.ts';
import {operatorRoster,operatorBinding,assertCanonicalOperator} from '../roles/hosted-operator-identity.ts';
import {assertRoleBackendProfile,openRoleBackendPool,assertRoleConnection} from '../roles/role-backend.ts';
import {PostgresRoleStore} from '../roles/role-postgres.ts';
import {assertRetainedStoresProfile} from '../stores/ops-a2-retained-profile.ts';
import {assertOnlinePgTransport} from '../persistence/online-pg-transport.ts';
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const b64=(bytes:Buffer|string)=>Buffer.from(bytes).toString('base64url');
function sha(x:string){return createHash('sha256').update(x,'utf8').digest();}
function eq(a:string,b:string){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function url(value:string|undefined){
 if(!value)throw Error('LIVE_R1_OIDC_URL_MISSING');
 const parsed=new URL(value);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||
  parsed.hash||parsed.hostname==='localhost'||parsed.hostname.endsWith('.local'))
  throw Error('LIVE_R1_OIDC_URL_INVALID');
 return parsed;
}
export type OidcConfig=Readonly<{issuer:string;authorize:string;token:string;
 jwks:string;clientId:string;clientSecret:string;stateKey:Buffer;
 privatePem:string;hosted?:true;proofBinding?:Readonly<{email:string;origin:string;sourceCommit:string}>;
 actors:Readonly<Record<string,{subject:string;
 providerSubject:string;legalEntityId:string;siteId:string;warehouseIds:string[]}>>}>;
export function oidcConfig(env:LiveEnv,identityProofOnly=false):OidcConfig{
 const hosted=hostedOperatorAttempt(env);
 if(hosted){
  if(identityProofOnly)throw Error('HOSTED_OPERATOR_PROOF_MODE_DENIED');
  assertHostedLoginRuntime(env);
 }else if(identityProofOnly){
  if(!identityProofModeAdmitted(env))throw Error('LIVE_R1_IDENTITY_PROOF_NOT_ADMITTED');
 }else assertLiveProfile(env);
 const exactIssuer=url(env.HFT_LIVE_R1_OIDC_ISSUER);
 if(exactIssuer.search)throw Error('LIVE_R1_OIDC_ISSUER_QUERY_DENIED');
 const issuer=exactIssuer.toString().replace(/\/$/,'');
 const authorize=url(env.HFT_LIVE_R1_OIDC_AUTHORIZE_URL).toString();
 const token=url(env.HFT_LIVE_R1_OIDC_TOKEN_URL).toString();
 const jwks=url(env.HFT_LIVE_R1_OIDC_JWKS_URL).toString();
 const clientId=env.HFT_LIVE_R1_OIDC_CLIENT_ID||'';
 const clientSecret=env.HFT_LIVE_R1_OIDC_CLIENT_SECRET||'';
 const baseStateKey=Buffer.from(env.HFT_LIVE_R1_OIDC_STATE_KEY_BASE64||'','base64');
 if(hosted&&baseStateKey.length!==32)throw Error('HOSTED_OPERATOR_STATE_KEY_INVALID');
 const stateKey=hosted?createHmac('sha256',baseStateKey).update('HFT-HOSTED-OPERATOR-OIDC-V1\0'+env.HFT_PUBLIC_ORIGIN).digest():baseStateKey;
 const privatePem=env.HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM||'';
 let actors:Record<string,{subject:string;providerSubject:string;legalEntityId:string;
  siteId:string;warehouseIds:string[]}>={};
 let proofBinding:OidcConfig['proofBinding'];
 if(identityProofOnly){
  const origin=url(env.HFT_PUBLIC_ORIGIN).origin;
  const email=env.HFT_LIVE_R1_IDENTITY_EXPECTED_EMAIL||'';
  const sourceCommit=env.VERCEL_GIT_COMMIT_SHA||'';
  if(origin!==env.HFT_PUBLIC_ORIGIN||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||
   email!==email.toLowerCase()||! /^[a-f0-9]{40}$/.test(sourceCommit))
   throw Error('LIVE_R1_IDENTITY_PROOF_BINDING_REQUIRED');
  if(issuer!=='https://accounts.google.com'||
   authorize!=='https://accounts.google.com/o/oauth2/v2/auth'||
   token!=='https://oauth2.googleapis.com/token'||
   jwks!=='https://www.googleapis.com/oauth2/v3/certs')
   throw Error('LIVE_R1_IDENTITY_GOOGLE_PROVIDER_REQUIRED');
  proofBinding={email,origin,sourceCommit};
 }else if(hosted){
  if(issuer!=='https://accounts.google.com'||authorize!=='https://accounts.google.com/o/oauth2/v2/auth'||
   token!=='https://oauth2.googleapis.com/token'||jwks!=='https://www.googleapis.com/oauth2/v3/certs')
   throw Error('HOSTED_OPERATOR_GOOGLE_PROVIDER_REQUIRED');
  actors={...operatorRoster(env)};
 }else{
  try{
   actors=JSON.parse(env.HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON||'') as typeof actors;
  }catch{throw Error('LIVE_R1_OIDC_ACTOR_GRANTS_UNAVAILABLE');}
 }
 if(!clientId||clientSecret.length<12||stateKey.length!==32||
  !privatePem||!actors||typeof actors!=='object'||Array.isArray(actors)||
  (!identityProofOnly&&Object.keys(actors).length<1)||Object.keys(actors).length>40)
  throw Error('LIVE_R1_OIDC_CREDENTIALS_NOT_ADMITTED');
 for(const [email,a] of Object.entries(actors)){
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email!==email.toLowerCase()||
   !a||!identifier.test(a.subject)||!a.providerSubject||a.providerSubject.length>256||
   !identifier.test(a.legalEntityId)||
   !identifier.test(a.siteId)||!Array.isArray(a.warehouseIds)||
   a.warehouseIds.length<1||a.warehouseIds.length>32||
   a.warehouseIds.some(x=>!identifier.test(x))||
   new Set(a.warehouseIds).size!==a.warehouseIds.length)
   throw Error('LIVE_R1_OIDC_ACTOR_SCOPE_INVALID');
 }
 try{
  const pk=createPrivateKey(privatePem),pub=createPublicKey(pk);
  const expected=createPublicKey(env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM!);
  if(pk.asymmetricKeyType!=='ed25519'||!pub.export({format:'der',type:'spki'})
    .equals(expected.export({format:'der',type:'spki'})))
   throw Error('LIVE_R1_OIDC_SIGNER_KEY_MISMATCH');
 }catch{throw Error('LIVE_R1_OIDC_SIGNER_KEY_MISMATCH');}
 return {issuer,authorize,token,jwks,clientId,clientSecret,
  stateKey,privatePem,actors,proofBinding,...(hosted?{hosted:true as const}:{})};
}
export type Flow=Readonly<{state:string;nonce:string;verifier:string;issuedAt:number;
 identityProofOnly?:true;operatorReturn?:'roles'|'stores'}>;
const authCookie='__Host-hft_live_oauth';
export const identityProofCookie='__Host-hft_live_identity_proof';
const sessionCookie='__Host-hft_session';
const common='Path=/; Secure; HttpOnly; SameSite=Lax';
export function encodeFlow(flow:Flow,secret:Buffer):string{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
 const body=Buffer.concat([cipher.update(JSON.stringify(flow)),cipher.final()]);
 return b64(Buffer.concat([iv,cipher.getAuthTag(),body]));
}
export function decodeFlow(value:string|undefined,key:Buffer):Flow{
 if(!value||value.length>2048)throw Error('LIVE_R1_OIDC_STATE_COOKIE_MISSING');
 let x:Buffer;
 try{x=Buffer.from(value,'base64url');}
 catch{throw Error('LIVE_R1_OIDC_STATE_INVALID');}
 if(x.length<40||x.length>1800)throw Error('LIVE_R1_OIDC_STATE_INVALID');
 try{
  const iv=x.subarray(0,12),tag=x.subarray(12,28),body=x.subarray(28);
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  const p=JSON.parse(Buffer.concat([decipher.update(body),decipher.final()])
   .toString('utf8')) as Flow;
  if(!p||!p.state||!p.nonce||!p.verifier||
   (p.identityProofOnly!==undefined&&p.identityProofOnly!==true)||
   (p.operatorReturn!==undefined&&p.operatorReturn!=='roles'&&p.operatorReturn!=='stores')||
   !Number.isSafeInteger(p.issuedAt)||Date.now()-p.issuedAt>300000||
   Date.now()<p.issuedAt-30000)
   throw Error('LIVE_R1_OIDC_STATE_EXPIRED');
  return p;
 }catch{throw Error('LIVE_R1_OIDC_STATE_INVALID_OR_EXPIRED');}
}
export function flowCookie(flow:Flow,key:Buffer):string{
 return (flow.identityProofOnly?identityProofCookie:authCookie)+'='+encodeFlow(flow,key)+'; '+common+'; Max-Age=300';
}
export const clearAuthCookies=[
 sessionCookie+'=; '+common+'; Max-Age=0',
 authCookie+'=; '+common+'; Max-Age=0'
];
export const clearIdentityProofCookie=identityProofCookie+'=; '+common+'; Max-Age=0';
export function cookieValue(raw:string|null,name:string):string|undefined{
 const matches=(raw||'').split(';').map(x=>x.trim())
  .filter(x=>x.startsWith(name+'='));
 if(matches.length!==1)return undefined;
 return matches[0].slice(name.length+1);
}
export function startUrl(config:OidcConfig,origin:string,identityProofOnly=false,operatorReturn?:'roles'|'stores'):{
 location:string;cookie:string}{
 if(Boolean(config.proofBinding)!==identityProofOnly||
  (config.proofBinding&&config.proofBinding.origin!==origin))
  throw Error('LIVE_R1_IDENTITY_FLOW_MODE_MISMATCH');
 if(Boolean(config.hosted)!==Boolean(operatorReturn)||config.hosted&&identityProofOnly)throw Error('HOSTED_OPERATOR_FLOW_MODE_DENIED');
 const flow={state:b64(randomBytes(32)),nonce:b64(randomBytes(32)),
  verifier:b64(randomBytes(32)),issuedAt:Date.now(),
  ...(identityProofOnly?{identityProofOnly:true as const}:{}),...(operatorReturn?{operatorReturn}:{})};
 const u=new URL(config.authorize);
 u.searchParams.set('response_type','code');
 u.searchParams.set('client_id',config.clientId);
 u.searchParams.set('redirect_uri',origin+'/api/hft/live-masters/auth/callback');
 u.searchParams.set('scope','openid email');
 u.searchParams.set('state',flow.state);
 u.searchParams.set('nonce',flow.nonce);
 u.searchParams.set('code_challenge',b64(sha(flow.verifier)));
 u.searchParams.set('code_challenge_method','S256');
 u.searchParams.set('prompt','select_account');
 return {location:u.toString(),cookie:flowCookie(flow,config.stateKey)};
}
function jwt(x:string):{header:Record<string,unknown>;claims:Record<string,unknown>;
 parts:string[]}{
 const segments=x.split('.');
 if(segments.length!==3||segments.some(v=>v.length>10000||
  !/^[a-zA-Z0-9_-]+$/.test(v)))throw Error('LIVE_R1_OIDC_JWT_FORMAT');
 let header:Record<string,unknown>,claims:Record<string,unknown>;
 try{
  header=JSON.parse(Buffer.from(segments[0],'base64url').toString());
  claims=JSON.parse(Buffer.from(segments[1],'base64url').toString());
 }catch{throw Error('LIVE_R1_OIDC_JWT_INVALID');}
 return {header,claims,parts:segments};
}
async function jsonHttp(url:string,options:RequestInit){
 const response=await fetch(url,{...options,redirect:'error',
  cache:'no-store',signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('LIVE_R1_OIDC_PROVIDER_REQUEST_FAILED');
 const body=await response.text();
 if(body.length>40000)throw Error('LIVE_R1_OIDC_PROVIDER_RESPONSE_TOO_LARGE');
 return JSON.parse(body) as Record<string,unknown>;
}
function oneActor(config:OidcConfig,claims:Record<string,unknown>){
 const email=claims.email;
 if(typeof email!=='string'||claims.email_verified!==true)
  throw Error('LIVE_R1_OIDC_VERIFIED_EMAIL_REQUIRED');
 const actor=config.actors[email.toLowerCase()];
 if(!actor||claims.sub!==actor.providerSubject)throw Error('LIVE_R1_OIDC_ACTOR_NOT_ENROLLED');
 return actor;
}
export async function verifyGoogleIdentity(config:OidcConfig,env:LiveEnv,
 flow:Flow,code:string):Promise<{email:string;providerSubject:string}>{
 if(Boolean(config.proofBinding)!==Boolean(flow.identityProofOnly)||
  (config.proofBinding&&(!identityProofModeAdmitted(env)||config.proofBinding.origin!==env.HFT_PUBLIC_ORIGIN)))
  throw Error('LIVE_R1_IDENTITY_FLOW_MODE_MISMATCH');
 // Google OAuth authorization codes can contain a slash (including the 4/ prefix).
 // Preserve the length limit and reject all characters outside the approved alphabet.
 if(code.length<6||code.length>4096||/[^A-Za-z0-9._~\/-]/.test(code))
  throw Error('LIVE_R1_OIDC_CODE_INVALID');
 const origin=env.HFT_PUBLIC_ORIGIN!;
 const token=await jsonHttp(config.token,{
  method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   grant_type:'authorization_code',code,
   redirect_uri:origin+'/api/hft/live-masters/auth/callback',
   client_id:config.clientId,client_secret:config.clientSecret,
   code_verifier:flow.verifier
  })
 });
 if(typeof token.id_token!=='string')throw Error('LIVE_R1_OIDC_ID_TOKEN_REQUIRED');
 const {header,claims,parts}=jwt(token.id_token);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||
  claims.iss!==config.issuer||claims.aud!==config.clientId||
  typeof claims.sub!=='string'||! /^[\x21-\x7e]{1,256}$/.test(claims.sub)||
  typeof claims.iat!=='number'||typeof claims.exp!=='number'||
  !Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
  (claims.azp!==undefined&&claims.azp!==config.clientId)||
  (config.proofBinding&&claims.iat<Math.floor(flow.issuedAt/1000)-30)||
  claims.exp<=Date.now()/1000||claims.iat>Date.now()/1000+30||
  (claims.nbf!==undefined&&
   (typeof claims.nbf!=='number'||claims.nbf>Date.now()/1000+30))||
  typeof claims.nonce!=='string'||!eq(claims.nonce,flow.nonce))
  throw Error('LIVE_R1_OIDC_ISSUER_AUDIENCE_NONCE_INVALID');
 const jwks=await jsonHttp(config.jwks,{method:'GET'});
 const keys=jwks.keys;
 if(!Array.isArray(keys)||keys.length<1||keys.length>30)
  throw Error('LIVE_R1_OIDC_JWKS_UNQUALIFIED');
 const matches=keys.filter(k=>k&&typeof k==='object'&&
  k.kid===header.kid&&k.kty==='RSA'&&
  (k.alg===undefined||k.alg==='RS256')&&(k.use===undefined||k.use==='sig'));
 if(matches.length!==1)throw Error('LIVE_R1_OIDC_SIGNING_KEY_UNQUALIFIED');
 let verified=false;
 try{
  const publicKey=createPublicKey({key:matches[0],format:'jwk'});
  verified=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1],'ascii'),
   publicKey,Buffer.from(parts[2],'base64url'));
 }catch{throw Error('LIVE_R1_OIDC_ID_SIGNATURE_INVALID');}
 if(!verified)throw Error('LIVE_R1_OIDC_ID_SIGNATURE_INVALID');
 const email=claims.email;
 if(typeof email!=='string'||claims.email_verified!==true||
  !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw Error('LIVE_R1_OIDC_VERIFIED_EMAIL_REQUIRED');
 if(config.proofBinding&&email.toLowerCase()!==config.proofBinding.email)
  throw Error('LIVE_R1_IDENTITY_EXPECTED_EMAIL_MISMATCH');
 return {email:email.toLowerCase(),providerSubject:claims.sub};
}
export async function completeIdentityProof(config:OidcConfig,env:LiveEnv,
 flow:Flow,code:string){
 if(!config.proofBinding||!flow.identityProofOnly||!identityProofModeAdmitted(env))
  throw Error('LIVE_R1_IDENTITY_PROOF_NOT_ADMITTED');
 const identity=await verifyGoogleIdentity(config,env,flow,code);
 const key=createPrivateKey(config.privatePem);
 // Detached evidence uses a separate signing domain, never the session JWT format.
 // Application-signer attestation only; not corporate approval or actor enrollment.
 const payload=JSON.stringify({schema:'HFT_LIVE_R1_GOOGLE_IDENTITY_PROOF_V1',
  authorization:'NONE',issuer:config.issuer,clientId:config.clientId,email:identity.email,
  providerSubject:identity.providerSubject,emailVerified:true,
  origin:config.proofBinding.origin,sourceCommit:config.proofBinding.sourceCommit,
  verifiedAt:new Date().toISOString(),receiptId:randomUUID(),
  signerSpkiSha256:createHash('sha256').update(createPublicKey(key)
   .export({type:'spki',format:'der'})).digest('hex')});
 const signature=sign(null,Buffer.from('HFT-LIVE-R1-IDENTITY-PROOF-V1\0'+payload,'utf8'),key)
  .toString('base64url');
 return {state:'GOOGLE_IDENTITY_VERIFIED_NO_SESSION',payload,signature,
  enrolled:false,applicationSession:false,databaseAccess:false};
}
function assertHostedLoginRuntime(env:LiveEnv){
 const mode=hostedOperatorMode(env);
 assertRoleBackendProfile(env);
 if(mode==='ROLES_RECEIVE'){assertRetainedStoresProfile(env);assertOnlinePgTransport(env,'P2_STORES');}
}
export async function completeLogin(config:OidcConfig,env:LiveEnv,
 flow:Flow,code:string):Promise<string>{
 if(flow.identityProofOnly||config.proofBinding)throw Error('LIVE_R1_IDENTITY_PROOF_CANNOT_CREATE_SESSION');
 const hosted=hostedOperatorAttempt(env);
 if(Boolean(config.hosted)!==hosted||Boolean(flow.operatorReturn)!==hosted)
  throw Error('HOSTED_OPERATOR_FLOW_MODE_DENIED');
 if(hosted)assertHostedLoginRuntime(env);else assertLiveProfile(env);
 const identity=await verifyGoogleIdentity(config,env,flow,code);
 const actor=oneActor(config,{email:identity.email,email_verified:true,sub:identity.providerSubject});
 const now=Math.floor(Date.now()/1000);
 const sessionId=randomUUID();
 let binding:string|undefined;
 if(hosted){
  const a=operatorRoster(env)[identity.email];
  if(!a||a.providerSubject!==identity.providerSubject||a.subject!==actor.subject||
   a.legalEntityId!==actor.legalEntityId||a.siteId!==actor.siteId||
   JSON.stringify(a.warehouseIds)!==JSON.stringify(actor.warehouseIds))
   throw Error('HOSTED_OPERATOR_PROVIDER_BINDING_DENIED');
  // Canonical active employee/person/scope verification. Never enroll or assign roles here.
  const pool=openRoleBackendPool(env);
  try{
   const store=new PostgresRoleStore(pool,c=>assertRoleConnection(c,env));
   await store.read(async tx=>{
    const principal=await tx.principal({subject:a.subject,sessionId,expiresAt:now+600,
     scope:{legalEntityId:a.legalEntityId,siteId:a.siteId,warehouseIds:a.warehouseIds},
     canonicalEmployeeId:a.employeeId,canonicalPersonId:a.personId});
    assertCanonicalOperator(a,principal,await tx.scopes(principal));
   });
  }finally{await pool.end();}
  binding=operatorBinding(identity.email,a);
 }
 const session={
  iss:env.HFT_SESSION_ISSUER,aud:env.HFT_SESSION_AUDIENCE,
  sub:actor.subject,jti:sessionId,
  legalEntityId:actor.legalEntityId,siteId:actor.siteId,
  warehouseIds:actor.warehouseIds,iat:now,exp:now+600,...(binding?{operatorBinding:binding}:{})
 };
 const top=b64(JSON.stringify({alg:'EdDSA',typ:'JWT',kid:'hft-r1'}));
 const body=b64(JSON.stringify(session));
 const encoded=top+'.'+body;
 const signature=sign(null,Buffer.from(encoded,'ascii'),
  createPrivateKey(config.privatePem)).toString('base64url');
 return sessionCookie+'='+encoded+'.'+signature+'; '+common+'; Max-Age=600';
}
