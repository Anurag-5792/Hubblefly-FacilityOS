import assert from 'node:assert/strict';
import {test} from 'node:test';
import {importHeaders,parseP3ImportCsv,exportP3Csv,blankImportCsv} from '../../lib/hft/masters/p3-csv-transfer.ts';
const scope={legalEntityId:'ENTITY01',siteId:'SITE01',warehouseId:'WH01'};
const ok='legalEntityId,siteId,warehouseId,employeeId,fullName,department,designation,reason\r\nENTITY01,SITE01,WH01,EMP01,"Example, Person",Stores,Operator,Original source record\r\n';
test('header-only templates use exact contract fields',()=>{
 assert.equal(importHeaders('EMPLOYEE')[3],'employeeId');
 assert.match(blankImportCsv('ITEM'),/controlType,reason/);
});
test('import validates quoted cells, scope, IDs and matching contract values',()=>{
 const rows=parseP3ImportCsv(ok,'EMPLOYEE',scope);
 assert.equal(rows.length,1);
 assert.equal(rows[0].recordId,'EMP01');
 assert.equal(rows[0].values.fullName,'Example, Person');
 assert.equal(rows[0].values.siteId,'SITE01');
 assert.throws(()=>parseP3ImportCsv(ok.replace('WH01','WH99'),'EMPLOYEE',scope),/CSV_SCOPE_MISMATCH/);
 assert.throws(()=>parseP3ImportCsv(ok.replace('EMP01','EXAMPLE_EMP01'),'EMPLOYEE',scope),/CSV_RECORD_ID/);
});
test('marked human-reference rows cannot be silently imported',()=>{
 const marked=ok.replace('ENTITY01,SITE01,WH01,EMP01','REQUIRED,REQUIRED,REQUIRED,REQUIRED');
 assert.throws(()=>parseP3ImportCsv(marked,'EMPLOYEE',scope));
});
test('export denies cross-scope rows and escapes formula injection',()=>{
 const row={kind:'EMPLOYEE',legal_entity_id:'ENTITY01',site_id:'SITE01',warehouse_id:'WH01',
  record_id:'EMP01',state:'INACTIVE',version:'1',master_values:{fullName:'=HYPERLINK("bad")',department:'Stores',designation:'Operator',siteId:'SITE01'}};
 assert.match(exportP3Csv('EMPLOYEE',scope,[row]),/"'=HYPERLINK/);
 assert.throws(()=>exportP3Csv('EMPLOYEE',scope,[{...row,legal_entity_id:'OTHER'}]),/CSV_EXPORT_ROW_SCOPE_REJECTED/);
});
