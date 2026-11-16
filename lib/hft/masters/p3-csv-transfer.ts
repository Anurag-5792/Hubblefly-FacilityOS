/** HFT R77 source-only CSV transfer: no direct SQL, approval or stock authority. */
import type {MasterKind} from './p3-contract.ts';
export type TransferScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type TransferChange=Readonly<{recordId:string;reason:string;values:Readonly<Record<string,string>>}>;
export type FieldMarker='REQUIRED'|'OPTIONAL';
const scopeFields=['legalEntityId','siteId','warehouseId'] as const;
const fields:Readonly<Record<MasterKind,ReadonlyArray<readonly [string,FieldMarker]>>>=Object.freeze({
 EMPLOYEE:[['employeeId','REQUIRED'],['fullName','REQUIRED'],['department','REQUIRED'],['designation','REQUIRED']],
 ITEM:[['itemCode','REQUIRED'],['uom','REQUIRED'],['controlType','REQUIRED']],
 SUPPLIER:[['supplierId','REQUIRED'],['legalName','REQUIRED']],
 WAREHOUSE:[['name','REQUIRED']],
 LOCATION:[['locationId','REQUIRED'],['parentLocationId','OPTIONAL']]
});
const names:Readonly<Record<MasterKind,string>>={EMPLOYEE:'employeeId',ITEM:'itemCode',SUPPLIER:'supplierId',WAREHOUSE:'warehouseId',LOCATION:'locationId'};
const reference=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
export const MAX_CSV_IMPORT_ROWS=20;
export const MAX_CSV_IMPORT_BYTES=81920;
export function importHeaders(kind:MasterKind):readonly string[]{
 if(kind==='WAREHOUSE')return [...scopeFields,'name','reason'];
 return [...scopeFields,...fields[kind].map(f=>f[0]),'reason'];
}
export function headerRequirements(kind:MasterKind):readonly FieldMarker[]{
 return importHeaders(kind).map(h=>h==='parentLocationId'?'OPTIONAL':'REQUIRED');
}
export function blankImportCsv(kind:MasterKind):string{
 return '\ufeff'+importHeaders(kind).join(',')+'\r\n';
}
/** RFC4180 parser, bounded to 20 data rows; rejects mismatched header and scope. */
function parseCells(text:string):string[][]{
 const out:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
 const source=text.replace(/^\ufeff/,'');
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='"'){
   if(quoted&&source[i+1]==='"'){cell+='"';i++;}
   else if(quoted){quoted=false;}
   else if(cell.length===0){quoted=true;}
   else throw Error('CSV_UNEXPECTED_QUOTE');
  }else if(!quoted&&ch===','){row.push(cell);cell='';}
  else if(!quoted&&(ch==='\r'||ch==='\n')){
   if(ch==='\r'&&source[i+1]==='\n')i++;
   row.push(cell);if(row.some(x=>x.trim()!==''))out.push(row);
   row=[];cell='';
  }else{cell+=ch;}
 }
 if(quoted)throw Error('CSV_UNTERMINATED_QUOTE');
 row.push(cell);if(row.some(x=>x.trim()!==''))out.push(row);
 return out;
}
function validId(value:string):boolean{return reference.test(value)&&!value.startsWith('EXAMPLE_');}
export function parseP3ImportCsv(csv:string,kind:MasterKind,scope:TransferScope):readonly TransferChange[]{
 if(new TextEncoder().encode(csv).length>MAX_CSV_IMPORT_BYTES)throw Error('CSV_FILE_TOO_LARGE');
 const rows=parseCells(csv),headers=importHeaders(kind);
 if(rows.length<2)throw Error('CSV_HEADER_AND_ONE_REAL_ROW_REQUIRED');
 if(rows[0].length!==headers.length||rows[0].some((h,i)=>h!==headers[i]))
  throw Error('CSV_EXACT_HEADERS_REQUIRED');
 if(rows.length-1>MAX_CSV_IMPORT_ROWS)throw Error('CSV_MAX_20_ROWS_PER_IMPORT');
 if(!Object.values(scope).every(validId))throw Error('CSV_AUTHORIZED_SCOPE_REQUIRED');
 const seen=new Set<string>();const changes:TransferChange[]=[];
 for(let index=1;index<rows.length;index++){
  const line=rows[index];
  if(line.length!==headers.length)throw Error('CSV_COLUMN_COUNT_ROW_'+(index+1));
  const data=Object.fromEntries(headers.map((key,i)=>[key,line[i].trim()]));
  if(scopeFields.some(key=>data[key]!==scope[key]))throw Error('CSV_SCOPE_MISMATCH_ROW_'+(index+1));
  const recordId=data[names[kind]];
  if(!validId(recordId)||seen.has(recordId))throw Error('CSV_RECORD_ID_INVALID_OR_DUPLICATE_ROW_'+(index+1));
  seen.add(recordId);
  const reason=data.reason;
  if(reason.length<8||reason.length>300)throw Error('CSV_REASON_REQUIRED_ROW_'+(index+1));
  const values:Record<string,string>={};
  for(const [key,status] of fields[kind]){
   if(key===names[kind])continue;
   const val=data[key]||'';
   if(status==='REQUIRED'&&(!val||val.length>160||val.startsWith('EXAMPLE_')))
    throw Error('CSV_REQUIRED_VALUE_ROW_'+(index+1)+':'+key);
   values[key]=val;
  }
  if(kind==='EMPLOYEE')values.siteId=scope.siteId;
  if(kind==='WAREHOUSE'){
   if(recordId!==scope.warehouseId)throw Error('CSV_WAREHOUSE_ANCHOR_NOT_SUPPORTED');
   values.siteId=scope.siteId;
  }
  if(kind==='LOCATION'&&values.parentLocationId&&(!validId(values.parentLocationId)||values.parentLocationId===recordId))
   throw Error('CSV_INVALID_LOCATION_PARENT_ROW_'+(index+1));
  if(kind==='ITEM'&&(!validId(values.uom)||!['NONE','BATCH','SERIAL'].includes(values.controlType)))
   throw Error('CSV_ITEM_REFERENCE_OR_CONTROL_TYPE_INVALID_ROW_'+(index+1));
  changes.push({recordId,reason,values});
 }
 return changes;
}
function escapedCsvCell(value:unknown):string{
 let v=typeof value==='string'?value:value===null||value===undefined?'':String(value);
 if(/^[\s]*[=+@-]/.test(v))v="'"+v;
 return /[,"\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
}
export function exportP3Csv(kind:MasterKind,scope:TransferScope,
 records:readonly Record<string,unknown>[]):string{
 const h=[...importHeaders(kind),'__state','__version','__requestId'];
 const output=[h.join(',')];
 for(const item of records){
  if(item.kind!==kind||item.legal_entity_id!==scope.legalEntityId||
    (item.site_id!==scope.siteId&&item.site_id!=='')||
    (item.warehouse_id!==scope.warehouseId&&item.warehouse_id!==''))
   throw Error('CSV_EXPORT_ROW_SCOPE_REJECTED');
  const vals=(item.master_values??item.values) as Record<string,unknown>|undefined;
  const row:Record<string,unknown>={
   legalEntityId:scope.legalEntityId,siteId:scope.siteId,warehouseId:scope.warehouseId,
   [names[kind]]:item.record_id??'',reason:item.reason??'',
   __state:item.state??'',__version:item.version??item.expected_version??'',
   __requestId:item.request_id??''};
  for(const [name] of fields[kind]){
   if(name!==names[kind]&&name!=='siteId')row[name]=vals?.[name]??'';
  }
  output.push(h.map(key=>escapedCsvCell(row[key])).join(','));
 }
 return '\ufeff'+output.join('\r\n')+'\r\n';
}
