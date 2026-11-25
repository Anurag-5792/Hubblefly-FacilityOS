/** Proof-only enrollment source tests: generated keys, no real credentials or grants. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,verify} from 'node:crypto';
import {oidcConfig,startUrl,decodeFlow,cookieValue,completeLogin,completeIdentityProof,
 identityProofCookie} from '../../lib/hft/live/live-oidc.ts';
import {identityProofModeAdmitted,identityProofPathAdmitted} from '../../lib/hft/live/live-identity-mode.ts';
import {assertLiveProfile,LIVE_PROFILE} from '../../lib/hft/live/live-profile.ts';
import {GET as startRoute} from '../../app/api/hft/live-masters/auth/start/route.ts';
import {GET as callbackRoute} from '../../app/api/hft/live-masters/auth/callback/route.ts';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const google=generateKeyPairSync('rsa',{modulusLength:2048});
const env:Record<string,string>={NODE_ENV:'production',VERCEL_ENV:'preview',
 HFT_ENVIRONMENT:'production-qualification',HFT_LIVE_POSTING_ENABLED:'false',HFT_AUTH_SOURCE:'verified',
 HFT_LIVE_R1_IDENTITY_PROOF_MODE:'qualification-only',HFT_LIVE_R1_IDENTITY_EXPECTED_EMAIL:'owner@example.org',
 VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),HFT_PUBLIC_ORIGIN:'https://fixture.example.org',
 HFT_SESSION_ED25519_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}).toString(),
 HFT_LIVE_R1_OIDC_ISSUER:'https://accounts.google.com',
 HFT_LIVE_R1_OIDC_AUTHORIZE_URL:'https://accounts.google.com/o/oauth2/v2/auth',
 HFT_LIVE_R1_OIDC_TOKEN_URL:'https://oauth2.googleapis.com/token',
 HFT_LIVE_R1_OIDC_JWKS_URL:'https://www.googleapis.com/oauth2/v3/certs',
 HFT_LIVE_R1_OIDC_CLIENT_ID:'synthetic-id',HFT_LIVE_R1_OIDC_CLIENT_SECRET:'SYNTHETIC_SECRET_123',
 HFT_LIVE_R1_OIDC_STATE_KEY_BASE64:randomBytes(32).toString('base64'),
 HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM:privateKey.export({type:'pkcs8',format:'pem'}).toString()};
const c=oidcConfig(env,true);
const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(nonce:string,overrides:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000);
 const body=encode({alg:'RS256',kid:'fixture'})+'.'+encode({iss:c.issuer,aud:c.clientId,
  sub:'fixture-google-subject',email:env.HFT_LIVE_R1_IDENTITY_EXPECTED_EMAIL,email_verified:true,
  nonce,iat:now,exp:now+120,...overrides});
 return body+'.'+sign('RSA-SHA256',Buffer.from(body,'ascii'),google.privateKey).toString('base64url');
}
test('identity proof needs no database, installation, actor or live profile and permits only proof routes',()=>{
 assert.equal(identityProofModeAdmitted(env),true);
 assert.equal(identityProofPathAdmitted('/api/hft/live-masters/auth/start',env),true);
 assert.equal(identityProofPathAdmitted('/api/hft/live-masters/auth/callback',env),true);
 for(const path of ['/masters/live','/settings','/api/hft/settings/roles','/api/hft/live-masters',
  '/api/hft/live-masters/health','/api/hft/stores/receive'])
  assert.equal(identityProofPathAdmitted(path,env),false);
 assert.throws(()=>assertLiveProfile(env));
 assert.throws(()=>oidcConfig(env));
 for(const patch of [{VERCEL_ENV:'production'},{HFT_ENVIRONMENT:'production'},
  {HFT_LIVE_R1_PROFILE:LIVE_PROFILE},{HFT_LIVE_R1_PASSWORD:'synthetic'},
  {HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON:'{}'},{HFT_LIVE_POSTING_ENABLED:'true'},
  {HFT_LIVE_R1_IDENTITY_EXPECTED_EMAIL:undefined},{HFT_LIVE_R1_OIDC_JWKS_URL:'https://wrong.example.org/certs'}])
  assert.throws(()=>oidcConfig({...env,...patch},true));
});
test('signed Google claims yield identity-only receipt and never a session',async t=>{
 const start=startUrl(c,env.HFT_PUBLIC_ORIGIN,true);
 const u=new URL(start.location);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('scope'),'openid email');
 const flow=decodeFlow(cookieValue(start.cookie,identityProofCookie),c.stateKey);
 assert.equal(flow.identityProofOnly,true);
 let overrides:Record<string,unknown>={};
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
  if(String(input)===c.token)return Response.json({id_token:token(flow.nonce,overrides)});
  if(String(input)===c.jwks)return Response.json({keys:[{...google.publicKey.export({format:'jwk'}),kid:'fixture'}]});
  throw Error('unexpected URL');
 });
 const proof=await completeIdentityProof(c,env,flow,'synthetic-code');
 const payload=JSON.parse(proof.payload);
 assert.equal(proof.state,'GOOGLE_IDENTITY_VERIFIED_NO_SESSION');
 assert.equal(payload.authorization,'NONE');
 assert.equal(payload.providerSubject,'fixture-google-subject');
 assert.equal(payload.sourceCommit,env.VERCEL_GIT_COMMIT_SHA);
 assert.equal(proof.applicationSession,false);
 assert.equal(proof.databaseAccess,false);
 assert.equal(Object.hasOwn(payload,'warehouseIds'),false);
 assert.equal(verify(null,Buffer.from('HFT-LIVE-R1-IDENTITY-PROOF-V1\0'+proof.payload,'utf8'),
  publicKey,Buffer.from(proof.signature,'base64url')),true);
 for(const patch of [{email:'wrong@example.org'},{email_verified:false},{nonce:'wrong'},
  {aud:'wrong'},{iss:'https://wrong.example.org'},{sub:''}]){
  overrides=patch;
  await assert.rejects(completeIdentityProof(c,env,flow,'synthetic-code'));
 }
 await assert.rejects(completeLogin(c,env,flow,'synthetic-code'),/CANNOT_CREATE_SESSION/);
 await assert.rejects(completeIdentityProof(c,env,{...flow,identityProofOnly:undefined},'synthetic-code'));
});
test('proof callback returns signed evidence and only clears the application session cookie',async t=>{
 const old=process.env;
 process.env={...old,...env} as NodeJS.ProcessEnv;
 try{
  delete process.env.HFT_LIVE_R1_PROFILE;delete process.env.HFT_LIVE_R1_PASSWORD;
  delete process.env.HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON;
  const origin=env.HFT_PUBLIC_ORIGIN;
  const response=await startRoute(new Request(origin+'/api/hft/live-masters/auth/start?identity_proof=1'));
  assert.equal(response.status,302);
  const cookies=response.headers.get('set-cookie')||'';
  const value=cookies.match(/__Host-hft_live_identity_proof=([A-Za-z0-9_-]+);/)?.[1];
  assert.ok(value);
  const flow=decodeFlow(value,c.stateKey);
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
   if(String(input)===c.token)return Response.json({id_token:token(flow.nonce)});
   if(String(input)===c.jwks)return Response.json({keys:[{...google.publicKey.export({format:'jwk'}),kid:'fixture'}]});
   throw Error('unexpected URL');
  });
  const endpoint=origin+'/api/hft/live-masters/auth/callback?code=synthetic-code&state=';
  const opts={headers:{cookie:identityProofCookie+'='+value}};
  const result=await callbackRoute(new Request(endpoint+flow.state,opts));
  assert.equal(result.status,200);
  assert.equal((await result.json()).applicationSession,false);
  assert.equal(result.headers.get('cache-control'),'no-store');
  const out=result.headers.get('set-cookie')||'';
  assert.match(out,/__Host-hft_session=;[^,]*Max-Age=0/);
  assert.doesNotMatch(out,/__Host-hft_session=[A-Za-z0-9_-]+/);
  const denied=await callbackRoute(new Request(endpoint+'wrong',opts));
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).authorization,'NONE');
 }finally{process.env=old;}
});
