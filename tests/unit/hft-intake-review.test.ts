import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {INTAKE_PROFILE,providerBinding,issueIntakeCookie,clearIntakeCookie,verifyIntakeCookie} from '../../lib/hft/intake/intake-session.ts';
import {parseIntakeRequest} from '../../lib/hft/intake/intake-contract.ts';
const pair=generateKeyPairSync('ed25519');
const now=1_800_000_000, sid='00000000-0000-4000-8000-000000000088',grant='00000000-0000-4000-8000-000000000089';
const identity={email:'owner@example.test',providerSubject:'synthetic-owner'};
const cfg={issuer:'https://accounts.google.com',clientId:'synthetic-client',privatePem:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()};
const env={HFT_INTAKE_PROFILE:INTAKE_PROFILE,HFT_ENVIRONMENT:'production-qualification',VERCEL_ENV:'preview',HFT_LIVE_POSTING_ENABLED:'false',HFT_INTAKE_GRANT_ID:grant,HFT_INTAKE_OWNER_BINDING_SHA256:providerBinding(cfg.issuer,cfg.clientId,identity.email,identity.providerSubject),HFT_INTAKE_ACCESS_UNTIL:new Date((now+1000)*1000).toISOString(),HFT_SESSION_ISSUER:'synthetic-issuer',HFT_SESSION_ED25519_PUBLIC_KEY_PEM:pair.publicKey.export({type:'spki',format:'pem'}).toString(),HFT_PUBLIC_ORIGIN:'https://example.test'};
test('inventory owner cookie is separately admitted, session-bound and expires',()=>{
 const cookie=issueIntakeCookie(env,cfg,identity,sid,now);
 assert.notEqual(cookie,clearIntakeCookie);
 assert.equal(verifyIntakeCookie(cookie,env,sid,now+1).grant,grant);
 assert.throws(()=>verifyIntakeCookie(cookie,env,grant,now+1),/SESSION_INVALID/);
 assert.throws(()=>verifyIntakeCookie(cookie,env,sid,now+601),/SESSION_INVALID/);
 assert.throws(()=>verifyIntakeCookie(cookie,{...env,VERCEL_ENV:'production'},sid,now+1),/NOT_ADMITTED/);
 assert.equal(issueIntakeCookie(env,cfg,{...identity,providerSubject:'another'},sid,now),clearIntakeCookie);
 assert.equal(issueIntakeCookie({...env,HFT_INTAKE_PROFILE:''},cfg,identity,sid,now),clearIntakeCookie);
});
test('inventory contract has no stock, approval or actor override action',()=>{
 assert.equal(parseIntakeRequest({intent:'READ',view:'items',search:'',offset:0,limit:50}).intent,'READ');
 assert.throws(()=>parseIntakeRequest({intent:'POST_STOCK'}));
 assert.throws(()=>parseIntakeRequest({intent:'READ',view:'items',search:'',offset:0,limit:101}));
 assert.throws(()=>parseIntakeRequest({intent:'READ',view:'items',search:'',offset:0,limit:50,grantId:grant}));
 assert.equal(parseIntakeRequest({intent:'RENAME',requestId:sid,itemId:'OP-12',revision:1,name:'Renamed',reason:'Correct item description'}).intent,'RENAME');
});
