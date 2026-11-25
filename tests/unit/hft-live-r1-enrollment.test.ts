import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {oidcConfig,startUrl,decodeFlow,cookieValue,completeLogin} from '../../lib/hft/live/live-oidc.ts';
import {LIVE_PROFILE} from '../../lib/hft/live/live-profile.ts';
const hex=(c:string)=>c.repeat(64);
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const env:Record<string,string>={NODE_ENV:'production',VERCEL_ENV:'preview',
 HFT_ENVIRONMENT:'production-qualification',HFT_LIVE_R1_PROFILE:LIVE_PROFILE,
 HFT_LIVE_POSTING_ENABLED:'false',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_R1_TARGET_ADMISSION_SHA256:hex('a'),HFT_LIVE_R1_INSTALLER_SHA256:hex('b'),
 HFT_LIVE_R1_MIGRATION_0001_SHA256:hex('c'),HFT_LIVE_R1_MIGRATION_0002_SHA256:hex('d'),
 HFT_LIVE_R1_OIDC_ADMISSION_SHA256:hex('e'),HFT_LIVE_R1_BACKUP_RESTORE_SHA256:hex('f'),
 HFT_LIVE_R1_RELEASE_SHA256:hex('1'),HFT_SESSION_ED25519_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}).toString(),
 HFT_SESSION_ISSUER:'fixture',HFT_SESSION_AUDIENCE:'fixture',HFT_PUBLIC_ORIGIN:'https://fixture.example.org',
 HFT_LIVE_R1_PROJECT:'qualified-project',HFT_LIVE_R1_BRANCH:'br-qualified-123',
 HFT_LIVE_R1_DATABASE:'hft_r1_live_fixture077',HFT_LIVE_R1_DATABASE_OID:'12345',
 HFT_LIVE_R1_PG_VERSION:'180007',HFT_LIVE_R1_HOST:'fixture.db.example.org',
 HFT_LIVE_R1_APPROVED_HOST:'fixture.db.example.org',HFT_LIVE_R1_PORT:'5432',
 HFT_LIVE_R1_LOGIN:'hft_r1_live_api_login',HFT_LIVE_R1_PASSWORD:'SYNTHETIC_PASSWORD_ONLY',
 HFT_LIVE_R1_CA_PEM:rootCertificates[0],
 HFT_LIVE_R1_OIDC_ISSUER:'https://accounts.google.com',
 HFT_LIVE_R1_OIDC_AUTHORIZE_URL:'https://accounts.google.com/o/oauth2/v2/auth',
 HFT_LIVE_R1_OIDC_TOKEN_URL:'https://oauth2.googleapis.com/token',
 HFT_LIVE_R1_OIDC_JWKS_URL:'https://www.googleapis.com/oauth2/v3/certs',
 HFT_LIVE_R1_OIDC_CLIENT_ID:'synthetic-id',HFT_LIVE_R1_OIDC_CLIENT_SECRET:'SYNTHETIC_SECRET_123',
 HFT_LIVE_R1_OIDC_STATE_KEY_BASE64:randomBytes(32).toString('base64'),
 HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM:privateKey.export({type:'pkcs8',format:'pem'}).toString(),
 HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON:'{}'};
test('proof-only Google OIDC path permits no pre-enrolled actor but never creates session',async()=>{
 assert.throws(()=>oidcConfig(env),/NOT_ADMITTED/);
 const c=oidcConfig(env,true),flow=startUrl(c,env.HFT_PUBLIC_ORIGIN,true);
 const u=new URL(flow.location);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('scope'),'openid email');
 const decoded=decodeFlow(cookieValue(flow.cookie,'__Host-hft_live_oauth'),c.stateKey);
 assert.equal(decoded.identityProofOnly,true);
 await assert.rejects(completeLogin(c,env,decoded,'synthetic-code'),/CANNOT_CREATE_SESSION/);
});
