import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceKey, validateReceiptFragment, type ReceiptFragment} from '../../lib/hft/domain/grn.ts';
import {reconcileOpeningCount, type OpeningCountSession} from '../../lib/hft/domain/opening-stock.ts';
import type {VerifiedPrincipal} from '../../lib/hft/security/authorization.ts';
const actor: VerifiedPrincipal={subject:'OP1',authenticated:true,active:true,scope:{legalEntityId:'HFT',siteId:'S1',warehouseIds:['W1']},permissions:['stock:prepare']};
const supplier={legalEntityId:'HFT',supplierId:'SUP1',legalName:'Synthetic Supplier',active:true,version:1};
const warehouse={legalEntityId:'HFT',siteId:'S1',warehouseId:'W1',active:true,version:1};
const item={legalEntityId:'HFT',itemCode:'PART1',uom:'NOS',control:'BATCH' as const,active:true,version:1};
const input:ReceiptFragment={legalEntityId:'HFT',siteId:'S1',warehouseId:'W1',supplierId:'SUP1',invoiceNumber:' inv  15 ',invoiceDate:'2026-10-20',grnId:'GRN1',lineNo:1,receiptKey:'R1',itemCode:'PART1',orderedQuantity:'10',alreadyAcceptedQuantity:'4',receiptQuantity:'3',qcState:'ACCEPTED',evidenceId:'QC1',batchNo:'B1'};
test('invoice canonicalization and partial receipt conservation',()=>{
  assert.equal(invoiceKey(' inv   15 '),'INV 15');
  const r=validateReceiptFragment(input,actor,supplier,warehouse,item);
  assert.equal(r.remainingAfter,'3');
  assert.throws(()=>validateReceiptFragment({...input,receiptQuantity:'7'},actor,supplier,warehouse,item),/PARTIAL_RECEIPT_EXCEEDS_ORDERED/);
});
test('invalid calendar invoice dates fail validation',()=>{
  assert.throws(()=>validateReceiptFragment({...input,invoiceDate:'2026-02-30'},actor,supplier,warehouse,item),/INVOICE_DATE_INVALID/);
});
test('QC evidence, cross-entity scope and inactive supplier stop receiving',()=>{
  assert.throws(()=>validateReceiptFragment({...input,qcState:'PENDING'},actor,supplier,warehouse,item),/RECEIPT_QC_NOT_ACCEPTED/);
  assert.throws(()=>validateReceiptFragment({...input,legalEntityId:'OTHER'},actor,supplier,warehouse,item),/CROSS_ENTITY_DENIED/);
  assert.throws(()=>validateReceiptFragment(input,actor,{...supplier,active:false},warehouse,item),/SUPPLIER_INACTIVE/);
});
test('opening count separates WIP from loose without posting stock',()=>{
  const session:OpeningCountSession={sessionId:'SESSION1',legalEntityId:'HFT',siteId:'S1',warehouseId:'W1',stockEpoch:'EPOCH1',lines:[{lineId:'L1',itemCode:'PART1',locationId:'BIN1',inventoryState:'LOOSE',quantity:'3',batchNo:'B1'},{lineId:'L2',itemCode:'PART1',locationId:'BIN1',inventoryState:'INSTALLED_WIP',quantity:'2',batchNo:'B1'}]};
  const result=reconcileOpeningCount(session,actor,new Map([['PART1',item]]),new Map());
  assert.equal(result.length,2); assert.equal(result[0].variance,'3'); assert.equal(result[1].inventoryState,'INSTALLED_WIP');
  assert.throws(()=>reconcileOpeningCount({...session,lines:[session.lines[0],session.lines[0]]},actor,new Map([['PART1',item]]),new Map()),/OPENING_DUPLICATE_LINE_ID/);
  assert.throws(()=>reconcileOpeningCount({...session,lines:[session.lines[0],{...session.lines[0],lineId:'L3'}]},actor,new Map([['PART1',item]]),new Map()),/OPENING_DUPLICATE_COUNT_KEY/);
});
test('opening count serial duplicate across location and state is blocked',()=>{
  const si={...item,control:'SERIAL' as const};
  const session:OpeningCountSession={sessionId:'S1',legalEntityId:'HFT',siteId:'S1',warehouseId:'W1',stockEpoch:'E1',lines:[{lineId:'L1',itemCode:'PART1',locationId:'BIN1',inventoryState:'LOOSE',quantity:'1',serialNo:'SER1'},{lineId:'L2',itemCode:'PART1',locationId:'BIN2',inventoryState:'INSTALLED_WIP',quantity:'1',serialNo:'SER1'}]};
  assert.throws(()=>reconcileOpeningCount(session,actor,new Map([['PART1',si]]),new Map()),/OPENING_DUPLICATE_SERIAL/);
});
