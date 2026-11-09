import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCanonicalGrnLineSynthetic}
 from '../../lib/hft/persistence/ops-a2-grn-source-identity.ts';

const RAW_GRN='A123E456-E89B-42D3-A456-426614174001';
const op={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',kind:'IN',
 requestId:'123e4567-e89b-42d3-a456-426614174000',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE',
 quantity:'3',uom:'PCS',serialNo:'',batchNo:'',leafLocationId:'BIN1',
 grnId:RAW_GRN,receiptKey:'RECEIPT1',supplierId:'SUP1',
 invoiceNumber:'INV001',qcState:'ACCEPTED',qcEvidenceId:'QC1'};
const typed={grnId:RAW_GRN.toLowerCase(),legalEntityId:'HFT',
 siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',productVersion:'PV1',
 receiptKey:'RECEIPT1',lineNo:1,supplierId:'SUP1',invoiceKey:'INV001',
 invoiceVerified:true,leafLocationId:'BIN1',serialNo:'',batchNo:'',
 qcState:'ACCEPTED' as const,qcEvidenceId:'QC1',acceptedQuantity:'3',
 status:'AUTHORIZED' as const};
test('typed multi-line GRN selects independently persisted receiptKey:lineNo',()=>{
 const rows=[typed,{...typed,receiptKey:'RECEIPT2',lineNo:2}];
 const first=deriveCanonicalGrnLineSynthetic(op,rows);
 const second=deriveCanonicalGrnLineSynthetic({...op,receiptKey:'RECEIPT2'},rows);
 assert.equal(first.sourceActionKey,'RECEIPT1:1');
 assert.equal(second.sourceActionKey,'RECEIPT2:2');
 assert.equal(first.sourceDocumentId,RAW_GRN.toLowerCase());
 assert.equal(first.signedRawGrnId,RAW_GRN);
 assert.equal(first.signedRawReceiptKey,'RECEIPT1');
 assert.equal(first.independentlyVerified,false);
});
test('raw aliases, ambiguous receipt keys and document substitution are denied',()=>{
 const other={...typed,receiptKey:'RECEIPT1',lineNo:2};
 for(const [changed,rows] of [
  [{...op,grnId:'GRN1'},[typed]],
  [{...op,grnId:RAW_GRN.toLowerCase()},[typed]],
  [op,[typed,other]],
  [op,[{...typed,grnId:'b123e456-e89b-42d3-a456-426614174001'}]],
  [op,[{...typed,legalEntityId:'OTHER'}]],
  [op,[{...typed,siteId:'SITE2'}]],
  [op,[{...typed,warehouseId:'WH2'}]],
  [op,[{...typed,invoiceKey:'WRONG'}]],
  [op,[{...typed,invoiceVerified:false}]],
  [op,[{...typed,productVersion:'PV2'}]],
  [op,[{...typed,receiptKey:'RECEIPT2'}]],
  [op,[{...typed,qcState:'REJECTED' as const}]],
  [op,[{...typed,qcEvidenceId:'QC2'}]],
  [op,[{...typed,acceptedQuantity:'2'}]],
  [op,[{...typed,serialNo:'SER1'}]],
 ] as const)assert.throws(()=>deriveCanonicalGrnLineSynthetic(changed,rows));
});
test('source-only raw GRN cannot be marked as a posting or approval',()=>{
 const x=deriveCanonicalGrnLineSynthetic(op,[typed]);
 assert.equal(x.sourceOnly,true);
 assert.equal(Object.hasOwn(x,'stockChanged'),false);
 assert.equal(Object.hasOwn(x,'approvedBy'),false);
});
