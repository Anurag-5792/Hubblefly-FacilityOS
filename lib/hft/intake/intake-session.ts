/** A separate owner inventory-review grant; never inherited from synthetic Masters scope. */
import {createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual} from 'node:crypto';
import type {LiveEnv} from '../live/live-profile.ts';
export const INTAKE_PROFILE='HFT_INTAKE_OWNER_REVIEW_V1';
export const intakeCookieName='__Host-hft_intake_review';
const common='Path=/; Secure; HttpOnly; SameSite=Strict';
export const clearIntakeCookie=intakeCookieName+'=; '+common+'; Max-Age=0';
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const digest=(x:string)=>createHash('sha256').update(x,'utf8').digest('hex');
const encode=(x:unknown)=>Buffer.from(JSON.stringify(x),'utf8').toString('base64url');
function eq(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function providerBinding(issuer:string,clientId:string,email:string,providerSubject:string){
 return digest(JSON.stringify(['HFT-INTAKE-OWNER-PROVIDER-V1',issuer,clientId,email.toLowerCase(),providerSubject]));
}
export function intakeGrant(env:LiveEnv,now=Math.floor(Date.now()/1000)){
 const grant=env.HFT_INTAKE_GRANT_ID||'',binding=env.HFT_INTAKE_OWNER_BINDING_SHA256||'';
 const until=Date.parse(env.HFT_INTAKE_ACCESS_UNTIL||'');
 if(env.HFT_INTAKE_PROFILE!==INTAKE_PROFILE||env.HFT_ENVIRONMENT!=='production-qualification'||
 env.VERCEL_ENV!=='preview'||env.HFT_LIVE_POSTING_ENABLED!=='false'||!uuid.test(grant)||!hash.test(binding)||
 binding==='0'.repeat(64)||!Number.isFinite(until)||Math.floor(until/1000)<=now||
 !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||!env.HFT_PUBLIC_ORIGIN)
 throw Error('INTAKE_GRANT_NOT_ADMITTED');
 return {grant,binding,until:Math.floor(until/1000),contextId:digest(JSON.stringify(['HFT-INTAKE-REVIEW-CONTEXT-V2',grant,binding]))};
}
export function issueIntakeCookie(env:LiveEnv,config:{issuer:string;clientId:string;privatePem:string},
 identity:{email:string;providerSubject:string},sessionId:string,now=Math.floor(Date.now()/1000)):string{
 try{
  const g=intakeGrant(env,now);
  if(!uuid.test(sessionId)||!eq(providerBinding(config.issuer,config.clientId,identity.email,identity.providerSubject),g.binding))
   return clearIntakeCookie;
  const key=createPrivateKey(config.privatePem);
  if(key.asymmetricKeyType!=='ed25519')return clearIntakeCookie;
  const exp=Math.min(now+600,g.until);
  const head=encode({alg:'EdDSA',typ:'JWT',kid:'hft-intake-v2'});
  const body=encode({iss:env.HFT_SESSION_ISSUER,aud:INTAKE_PROFILE,sub:g.grant,sid:sessionId,ctx:g.contextId,iat:now,exp});
  const signed=head+'.'+body;
  const signature=sign(null,Buffer.from(signed,'ascii'),key).toString('base64url');
  return intakeCookieName+'='+signed+'.'+signature+'; '+common+'; Max-Age='+String(exp-now);
 }catch{return clearIntakeCookie;}
}
function part(x:string):Record<string,unknown>{
 if(!/^[A-Za-z0-9_-]{1,2048}$/.test(x))throw Error('INTAKE_TOKEN_INVALID');
 const b=Buffer.from(x,'base64url');if(b.toString('base64url')!==x)throw Error('INTAKE_TOKEN_INVALID');
 const v=JSON.parse(b.toString('utf8')) as unknown;
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INTAKE_TOKEN_INVALID');
 return v as Record<string,unknown>;
}
export function verifyIntakeCookie(raw:string|null,env:LiveEnv,sessionId:string,now=Math.floor(Date.now()/1000)){
 const g=intakeGrant(env,now);
 const cookies=(raw||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(intakeCookieName+'='));
 if(cookies.length!==1)throw Error('INTAKE_SESSION_REQUIRED');
 const token=cookies[0].slice(intakeCookieName.length+1);
 if(token.length>3500)throw Error('INTAKE_TOKEN_INVALID');
 const pieces=token.split('.');
 if(pieces.length!==3||!/^[A-Za-z0-9_-]{86}$/.test(pieces[2]))throw Error('INTAKE_TOKEN_INVALID');
 const key=createPublicKey(env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM!);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(pieces[0]+'.'+pieces[1],'ascii'),key,Buffer.from(pieces[2],'base64url')))
 throw Error('INTAKE_SIGNATURE_INVALID');
 const h=part(pieces[0]),b=part(pieces[1]);
 if(Object.keys(h).length!==3||h.alg!=='EdDSA'||h.typ!=='JWT'||h.kid!=='hft-intake-v2'||
 Object.keys(b).length!==7||typeof b.ctx!=='string'||!eq(b.ctx,g.contextId)||b.iss!==env.HFT_SESSION_ISSUER||b.aud!==INTAKE_PROFILE||b.sub!==g.grant||
 b.sid!==sessionId||!uuid.test(sessionId)||typeof b.iat!=='number'||typeof b.exp!=='number'||
 !Number.isSafeInteger(b.iat)||!Number.isSafeInteger(b.exp)||b.iat>now+30||b.exp<=now||
 b.exp<=b.iat||b.exp-b.iat>600||b.exp>g.until)
 throw Error('INTAKE_SESSION_INVALID');
 return {...g,expiresAt:b.exp};
}
