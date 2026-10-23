import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertVerifiedRequestOperator, resolveVerifiedRequestOperator } from '../../lib/hft/security/verified-request.ts';
import { createSignedRequest, identityEnv, signedToken, verifiedFixtureOperator } from '../support/signed-session-fixture.ts';
const stockScope = { legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1' };
test('valid issuer-signed, same-origin session is bound to exact stock scope',()=>{
  const operator=verifiedFixtureOperator();
  assert.equal(assertVerifiedRequestOperator(operator,stockScope),'STORE1');
  assert.equal(Object.isFrozen(operator),true);
  assert.equal(Object.isFrozen(operator.scope),true);
});
test('forged structural operator rejected even when marked authenticated',()=>{
  const forged={...verifiedFixtureOperator()};
  assert.throws(()=>assertVerifiedRequestOperator(forged,stockScope),/VERIFIED_REQUEST_IDENTITY_REQUIRED/);
});
test('cross-entity, cross-site, cross-warehouse signed identity rejected',()=>{
  const operator=verifiedFixtureOperator();
  for (const scope of [{...stockScope, legalEntityId:'DDL'},{...stockScope,siteId:'OTHER'},{...stockScope,warehouseId:'WH2'}])
    assert.throws(()=>assertVerifiedRequestOperator(operator,scope),/SIGNED_SCOPE_DENIED/);
});
test('JWT tampering, unsupported algorithms and wrong issuer rejected',()=>{
  const valid=signedToken();
  const [header,payload,signature]=valid.split('.');
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(header+'.'+payload+'.'+signature.slice(0,-3)+'abc'),identityEnv),/SESSION_SIGNATURE_OR_KEY_INVALID/);
  const unsignedHeader=Buffer.from(JSON.stringify({alg:'none',typ:'JWT',kid:'hft-r1'})).toString('base64url');
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(unsignedHeader+'.'+payload+'.'+signature),identityEnv),/SESSION_ALGORITHM_OR_KEY_REJECTED/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(signedToken({iss:'impostor'})),identityEnv),/SESSION_ISSUER_AUDIENCE_INVALID/);
});
test('expired session, long-lived token and duplicate warehouse scope rejected',()=>{
  const now=Math.floor(Date.now()/1000);
  for (const claims of [{iat:now-200,exp:now-100},{iat:now-1,exp:now+3600}])
    assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(signedToken(claims)),identityEnv),/SESSION_EXPIRED_OR_INVALID/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(signedToken({warehouseIds:['WH1','WH1']})),identityEnv),/SESSION_WAREHOUSE_SCOPE_DUPLICATE/);
});
test('missing origin, cross-site attempt, spoofed identity headers and duplicate cookies fail closed',()=>{
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(undefined,{origin:'https://attacker.example'}),identityEnv),/REQUEST_ORIGIN_MISMATCH/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(undefined,{'sec-fetch-site':'cross-site'}),identityEnv),/CROSS_SITE_REQUEST_DENIED/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(undefined,{'x-user-id':'ADMIN'}),identityEnv),/UNTRUSTED_AUTHENTICATION_HEADER/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(undefined,{cookie:'__Host-hft_session='+signedToken()+'; __Host-hft_session='+signedToken()}),identityEnv),/SESSION_COOKIE_DUPLICATE_OR_MISSING/);
});
test('no implicit preview identity and no production environment',()=>{
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(),{...identityEnv,HFT_AUTH_SOURCE:'preview'}),/INSECURE_AUTH_SOURCE_REJECTED/);
  assert.throws(()=>resolveVerifiedRequestOperator(createSignedRequest(),{...identityEnv,NODE_ENV:'production'}),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
});
