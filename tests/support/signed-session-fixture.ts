/** Synthetic Ed25519 identity issuer for isolated unit tests only. Never ship keys. */
import { generateKeyPairSync, sign } from 'node:crypto';
import { resolveVerifiedRequestOperator } from '../../lib/hft/security/verified-request.ts';
const pair = generateKeyPairSync('ed25519');
export const identityEnv = Object.freeze({
  NODE_ENV: 'test', HFT_ENVIRONMENT: 'test', HFT_AUTH_SOURCE: 'verified',
  HFT_OPERATIONS_SOURCE: 'database', HFT_LIVE_POSTING_ENABLED: 'false',
  HFT_PUBLIC_ORIGIN: 'http://127.0.0.1:38721',
  HFT_SESSION_ISSUER: 'hft-r1-fixture-issuer', HFT_SESSION_AUDIENCE: 'hft-r1-isolated-test',
  HFT_SESSION_ED25519_PUBLIC_KEY_PEM: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
});
export function signedToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT',kid:'hft-r1'})).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss:identityEnv.HFT_SESSION_ISSUER, aud:identityEnv.HFT_SESSION_AUDIENCE,
    sub:'STORE1',jti:'FIXTURE-JTI-01',legalEntityId:'HFT',siteId:'SITE1',warehouseIds:['WH1'],
    iat:now-10, exp:now+120, ...overrides,
  })).toString('base64url');
  const content=header+'.'+claims;
  return content+'.'+sign(null,Buffer.from(content,'ascii'),pair.privateKey).toString('base64url');
}
export function createSignedRequest(token=signedToken(), headers: Record<string,string> = {}): Request {
  return new Request(identityEnv.HFT_PUBLIC_ORIGIN+'/_isolated_test/stock',{
    method:'POST', headers:{origin:identityEnv.HFT_PUBLIC_ORIGIN,
      cookie:'__Host-hft_session='+token, ...headers},
  });
}
export function verifiedFixtureOperator() {
  return resolveVerifiedRequestOperator(createSignedRequest(),identityEnv);
}
