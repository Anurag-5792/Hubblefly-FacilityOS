import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSecureStartup, assertPostingMode } from '../../lib/hft/security/authorization.ts';

const safe = {NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false'};
test('explicit isolated test environment permits nonposting startup',()=>{
  assert.doesNotThrow(()=>assertSecureStartup(safe));
});
test('missing or unapproved identity backend fails closed',()=>{
  for(const v of [undefined,'frappe','']){
    assert.throws(()=>assertSecureStartup({...safe,HFT_AUTH_SOURCE:v}),/VERIFIED_AUTH_SOURCE_REQUIRED/);
  }
});
test('preview or sample authentication remains prohibited',()=>{
  for(const v of ['preview','sample']){
    assert.throws(()=>assertSecureStartup({...safe,HFT_AUTH_SOURCE:v}),/INSECURE_AUTH_SOURCE_REJECTED/);
  }
});
test('missing environment is not silently treated as isolated',()=>{
  assert.throws(()=>assertSecureStartup({...safe,HFT_ENVIRONMENT:undefined}),/ISOLATED_NONPRODUCTION_ENVIRONMENT_REQUIRED/);
});
test('production and unapproved posting are prohibited',()=>{
  assert.throws(()=>assertSecureStartup({...safe,NODE_ENV:'production'}),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
  assert.throws(()=>assertSecureStartup({...safe,HFT_ENVIRONMENT:'production'}),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
  for(const setting of ['true','TRUE','1','yes']){
    assert.throws(()=>assertPostingMode({...safe,HFT_LIVE_POSTING_ENABLED:setting}),/LIVE_POSTING_PROHIBITED/);
  }
});
test('sample operational source is rejected',()=>{
  assert.throws(()=>assertSecureStartup({...safe,HFT_OPERATIONS_SOURCE:'sample'}),/SAMPLE_OPERATIONS_SOURCE_REJECTED/);
});
