/** Real external OpenID Connect identity handoff for LIVE R1 production Masters.
 * Requires independently enrolled OIDC client and Ed25519 issuer secrets.
 * Never creates a fake user, approves a Master, or grants stock authority.
 */
import {createCipheriv,createDecipheriv,createHash,createPrivateKey,
 createPublicKey,randomBytes,randomUUID,sign,timingSafeEqual,verify}
 from 'node:crypto';
import {assertLiveProfile,type LiveEnv} from './live-profile.ts';
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
 privatePem:string;actors:Readonly<Record<string,{subject:string;
 providerSubject:string;legalEntityId:string;siteId:string;warehouseIds:string[]}>>}>;
export function oidcConfig(env:LiveEnv,identityProofOnly=false):OidcConfig{
 assertLiveProfile(env);
 const exactIssuer=url(env.HFT_LIVE_R1_OIDC_ISSUER);
 if(exactIssuer.search)throw Error('LIVE_R1_OIDC_ISSUER_QUERY_DENIED');
 const issuer=exactIssuer.toString().replace(/\/$/,'');
 const authorize=url(env.HFT_LIVE_R1_OIDC_AUTHORIZE_URL).toString();
 const token=url(env.HFT_LIVE_R1_OIDC_TOKEN_URL).toString();
 const jwks=url(env.HFT_LIVE_R1_OIDC_JWKS_URL).toString();
 const clientId=env.HFT_LIVE_R1_OIDC_CLIENT_ID||'';
 const clientSecret=env.HFT_LIVE_R1_OIDC_CLIENT_SECRET||'';
 const stateKey=Buffer.from(env.HFT_LIVE_R1_OIDC_STATE_KEY_BASE64||'','base64');
 const privatePem=env.HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM||'';
 let actors:Record<string,{subject:string;providerSubject:string;legalEntityId:string;
  siteId:string;warehouseIds:string[]}>;
 try{
  actors=JSON.parse(env.HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON||'') as typeof actors;
 }catch{throw Error('LIVE_R1_OIDC_ACTOR_GRANTS_UNAVAILABLE');}
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
  stateKey,privatePem,actors};
}
export type Flow=Readonly<{state:string;nonce:string;verifier:string;issuedAt:number;
 identityProofOnly?:true}>;
const authCookie='__Host-hft_live_oauth';
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
   !Number.isSafeInteger(p.issuedAt)||Date.now()-p.issuedAt>300000||
   Date.now()<p.issuedAt-30000)
   throw Error('LIVE_R1_OIDC_STATE_EXPIRED');
  return p;
 }catch{throw Error('LIVE_R1_OIDC_STATE_INVALID_OR_EXPIRED');}
}
export function flowCookie(flow:Flow,key:Buffer):string{
 return authCookie+'='+encodeFlow(flow,key)+'; '+common+'; Max-Age=300';
}
export const clearAuthCookies=[
 sessionCookie+'=; '+common+'; Max-Age=0',
 authCookie+'=; '+common+'; Max-Age=0'
];
export function cookieValue(raw:string|null,name:string):string|undefined{
 const matches=(raw||'').split(';').map(x=>x.trim())
  .filter(x=>x.startsWith(name+'='));
 if(matches.length!==1)return undefined;
 return matches[0].slice(name.length+1);
}
export function startUrl(config:OidcConfig,origin:string,identityProofOnly=false):{
 location:string;cookie:string}{
 const flow={state:b64(randomBytes(32)),nonce:b64(randomBytes(32)),
  verifier:b64(randomBytes(32)),issuedAt:Date.now(),
  ...(identityProofOnly?{identityProofOnly:true as const}:{})};
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
 if(!/^[A-Za-z0-9._~-]{6,4096}$/.test(code))
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
  typeof claims.sub!=='string'||!claims.sub||
  typeof claims.iat!=='number'||typeof claims.exp!=='number'||
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
 return {email:email.toLowerCase(),providerSubject:claims.sub};
}
export async function completeLogin(config:OidcConfig,env:LiveEnv,
 flow:Flow,code:string):Promise<string>{
 if(flow.identityProofOnly)throw Error('LIVE_R1_IDENTITY_PROOF_CANNOT_CREATE_SESSION');
 const identity=await verifyGoogleIdentity(config,env,flow,code);
 const actor=oneActor(config,{email:identity.email,email_verified:true,sub:identity.providerSubject});
 const now=Math.floor(Date.now()/1000);
 const session={
  iss:env.HFT_SESSION_ISSUER,aud:env.HFT_SESSION_AUDIENCE,
  sub:actor.subject,jti:randomUUID(),
  legalEntityId:actor.legalEntityId,siteId:actor.siteId,
  warehouseIds:actor.warehouseIds,iat:now,exp:now+600
 };
 const top=b64(JSON.stringify({alg:'EdDSA',typ:'JWT',kid:'hft-r1'}));
 const body=b64(JSON.stringify(session));
 const encoded=top+'.'+body;
 const signature=sign(null,Buffer.from(encoded,'ascii'),
  createPrivateKey(config.privatePem)).toString('base64url');
 return sessionCookie+'='+encoded+'.'+signature+'; '+common+'; Max-Age=600';
}
