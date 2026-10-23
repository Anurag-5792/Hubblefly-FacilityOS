import {test} from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, formatQuantity, requireSerializedUnit } from '../../lib/hft/domain/quantity.ts';
import { authorize, assertSecureStartup, assertPostingMode, type VerifiedPrincipal } from '../../lib/hft/security/authorization.ts';
const operator: VerifiedPrincipal = {subject:'SYNTHETIC',authenticated:true,active:true,scope:{legalEntityId:'HFT',siteId:'SITE1',warehouseIds:['WH1']},permissions:['stock:post']};
test('exact quantity and serialized controls',()=>{
  assert.equal(formatQuantity(parseQuantity('1.123456')),'1.123456');
  for(const x of ['-1','1e4','01','1.1234567','NaN']) assert.throws(()=>parseQuantity(x),/QUANTITY_INVALID/);
  assert.throws(()=>requireSerializedUnit(parseQuantity('2')),/SERIAL_QUANTITY/);
});
test('fail closed production and preview',()=>{
  assert.throws(()=>assertSecureStartup({NODE_ENV:'production'}),/PRODUCTION_STARTUP/);
  assert.throws(()=>assertSecureStartup({HFT_AUTH_SOURCE:'preview'}),/INSECURE_AUTH/);
  assert.throws(()=>assertPostingMode({HFT_LIVE_POSTING_ENABLED:'true'}),/LIVE_POSTING/);
});
test('scoped authorization rejects unauthenticated and cross-entity calls',()=>{
  const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
  authorize(operator,'stock:post',scope);
  assert.throws(()=>authorize(null,'stock:post',scope),/AUTHENTICATION_REQUIRED/);
  assert.throws(()=>authorize(operator,'stock:post',{...scope,legalEntityId:'OTHER'}),/CROSS_ENTITY_DENIED/);
  assert.throws(()=>authorize(operator,'stock:post',{...scope,warehouseId:'WH2'}),/WAREHOUSE_SCOPE_DENIED/);
});
