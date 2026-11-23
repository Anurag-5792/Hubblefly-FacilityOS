/** R77 bounded XLSX round-trip acceptance for existing UI transfer functions.
 * Synthetic values only; no database or real employee records.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankP3Xlsx,sampleP3Xlsx,exportP3Xlsx,previewP3ImportXlsx,
 fictionalP3SampleRow,XLSX_MIME} from '../../lib/hft/masters/p3-xlsx-transfer.ts';
import {blankImportCsv,exportP3Csv,fieldGuide,importHeaders,previewP3ImportCsv}
 from '../../lib/hft/masters/p3-csv-transfer.ts';
import type {MasterKind} from '../../lib/hft/masters/p3-contract.ts';

const scope={legalEntityId:'ENTITY01',siteId:'SITE01',warehouseId:'WH01'};
const kinds:MasterKind[]=['EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION'];
const rows:Record<MasterKind,readonly string[]>={
 EMPLOYEE:['ENTITY01','SITE01','WH01','EMP001','Synthetic Test Operator',
   'Stores','Operator','Authorized synthetic unit test only'],
 ITEM:['ENTITY01','SITE01','WH01','ITEM001','PCS','NONE',
   'Authorized synthetic unit test only'],
 SUPPLIER:['ENTITY01','SITE01','WH01','SUP001','Synthetic Test Supplier',
   'Authorized synthetic unit test only'],
 WAREHOUSE:['ENTITY01','SITE01','WH01','Synthetic Test Warehouse',
   'Authorized synthetic unit test only'],
 LOCATION:['ENTITY01','SITE01','WH01','BIN001','',
   'Authorized synthetic unit test only']
};
test('all five blank XLSX and CSV templates use exact machine-readable headers',async()=>{
 assert.equal(XLSX_MIME,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 for(const kind of kinds){
  const empty=blankP3Xlsx(kind);
  assert.equal(empty[0],80);
  assert.equal(empty[1],75);
  assert.ok(empty.length>100);
  const csv=blankImportCsv(kind);
  assert.ok(csv.startsWith('\ufeff'+importHeaders(kind).join(',')));
  const guide=fieldGuide(kind);
  assert.deepEqual(guide.filter(x=>x.marker==='TEMP').map(x=>x.field),
   ['reason','__state','__version','__requestId']);
  assert.equal(guide.some(x=>x.marker==='REQUIRED'),true);
  await assert.rejects(previewP3ImportXlsx(empty,kind,scope),
   /XLSX_HEADER_AND_ONE_REAL_ROW_REQUIRED/);
 }
});
test('five real-shaped synthetic XLSX imports produce same P3 proposals as CSV',async()=>{
 for(const kind of kinds){
  const xlsx=blankP3Xlsx(kind,[rows[kind]]);
  const parsed=await previewP3ImportXlsx(xlsx,kind,scope);
  assert.equal(parsed.totalRows,1);
  assert.equal(parsed.issues.length,0);
  assert.equal(parsed.validRows.length,1);
  const csv=importHeaders(kind).join(',')+'\r\n'+rows[kind].join(',')+'\r\n';
  const expected=previewP3ImportCsv(csv,kind,scope);
  assert.deepEqual(parsed,expected);
 }
});
test('fictional sample XLSX is blocked from real data entry',async()=>{
 for(const kind of kinds){
  const bytes=sampleP3Xlsx(kind);
  const parsed=await previewP3ImportXlsx(bytes,kind,scope);
  assert.equal(parsed.validRows.length,0);
  assert.ok(parsed.issues.length>=1);
  assert.match(parsed.issues[0].code,/SCOPE_MISMATCH|RECORD_ID_INVALID/);
  assert.ok(fictionalP3SampleRow(kind).some(x=>x.startsWith('EXAMPLE_')));
 }
});
test('row-level errors and duplicate IDs are preserved through XLSX',async()=>{
 const bad=[...rows.EMPLOYEE];
 bad[3]='EMP001';
 bad[4]='';
 const xlsx=blankP3Xlsx('EMPLOYEE',[rows.EMPLOYEE,bad]);
 const preview=await previewP3ImportXlsx(xlsx,'EMPLOYEE',scope);
 assert.equal(preview.totalRows,2);
 assert.equal(preview.validRows.length,1);
 assert.equal(preview.issues.length,1);
 assert.equal(preview.issues[0].row,3);
 assert.match(preview.issues[0].code,/CSV_DUPLICATE_RECORD_ID/);
});
test('export XLSX is generated from protected result rows, not staged inputs',()=>{
 const saved={kind:'EMPLOYEE',legal_entity_id:'ENTITY01',
  site_id:'SITE01',warehouse_id:'WH01',record_id:'EMP001',
  version:1,active:false,
  master_values:{fullName:'Synthetic Test Operator',
    department:'Stores',designation:'Operator',siteId:'SITE01'}};
 const pending={kind:'EMPLOYEE',legal_entity_id:'ENTITY01',
  site_id:'SITE01',warehouse_id:'WH01',record_id:'EMP001',
  state:'PENDING_APPROVAL',request_id:'11111111-1111-4111-8111-111111111111',
  expected_version:'0',
  proposed_values:{fullName:'Synthetic Test Operator',
   department:'Stores',designation:'Operator',siteId:'SITE01'}};
 const a=exportP3Xlsx('EMPLOYEE',scope,[saved]);
 const b=exportP3Xlsx('EMPLOYEE',scope,[pending]);
 assert.ok(a.length>100&&b.length>100);
 assert.notDeepEqual(a,b);
 assert.match(exportP3Csv('EMPLOYEE',scope,[pending]),/PENDING_APPROVAL/);
 assert.match(exportP3Csv('EMPLOYEE',scope,[saved]),/INACTIVE/);
 assert.throws(()=>exportP3Xlsx('EMPLOYEE',scope,
  [{...saved,legal_entity_id:'OTHER'}]),/CSV_EXPORT_ROW_SCOPE_REJECTED/);
});
