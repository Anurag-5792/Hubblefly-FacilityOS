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
export type FieldGuideRow=Readonly<{field:string;marker:'REQUIRED'|'OPTIONAL'|'TEMP';note:string}>;
/** TEMP means workflow metadata, not a field stored in an active Master.
 * 'reason' is a required submission explanation with temporary scope.
 */
export function fieldGuide(kind:MasterKind):readonly FieldGuideRow[]{
 return [...importHeaders(kind).map(field=>({
  field,marker:field==='reason'?'TEMP' as const:
   field==='parentLocationId'?'OPTIONAL' as const:'REQUIRED' as const,
  note:field==='reason'?'Required for P3 change request, not a master attribute':
   ['legalEntityId','siteId','warehouseId'].includes(field)?
   'Scope identity; must match signed session and database anchor':
   field==='parentLocationId'?'May be blank for root location':
   'Required source field; human approval controls activation'
 })),{field:'__state',marker:'TEMP' as const,
  note:'Read-only export status; omit from import'},
 {field:'__version',marker:'TEMP' as const,
  note:'Read-only export revision; omit from import'},
 {field:'__requestId',marker:'TEMP' as const,
  note:'Read-only original request ID; omit from import'}];
}

/** RFC4180 parser, bounded to 20 data rows; rejects mismatched header and scope. */
export function parseP3CsvCells(text:string):string[][]{
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
 const rows=parseP3CsvCells(csv),headers=importHeaders(kind);
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
export type TransferIssue=Readonly<{row:number;recordId:string;code:string}>;
export type TransferPreview=Readonly<{
 validRows:readonly (TransferChange&{sourceRow:number})[];
 issues:readonly TransferIssue[];totalRows:number;
}>;
/** Collect bounded row-level validation without touching the protected writer.
 * Structural ambiguity rejects the entire file rather than guessing a row.
 */
export function previewP3ImportCsv(text:string,kind:MasterKind,
 scope:TransferScope):TransferPreview{
 if(new TextEncoder().encode(text).length>MAX_CSV_IMPORT_BYTES)
  throw Error('CSV_FILE_TOO_LARGE');
 const rows=parseP3CsvCells(text),headers=importHeaders(kind);
 if(rows.length<1||rows[0].length!==headers.length||
   rows[0].some((v,i)=>v!==headers[i]))
  throw Error('CSV_EXACT_HEADERS_REQUIRED');
 if(rows.length===1)throw Error('CSV_HEADER_AND_ONE_REAL_ROW_REQUIRED');
 if(rows.length-1>MAX_CSV_IMPORT_ROWS)
  throw Error('CSV_MAX_20_ROWS_PER_IMPORT');
 const validRows:(TransferChange&{sourceRow:number})[]=[];
 const issues:TransferIssue[]=[],seen=new Map<string,number>();
 const quote=(v:string)=>/[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
 for(let index=1;index<rows.length;index++){
  const columns=rows[index],row=index+1;
  const recordCol=headers.indexOf(
   kind==='EMPLOYEE'?'employeeId':kind==='ITEM'?'itemCode':
   kind==='SUPPLIER'?'supplierId':kind==='WAREHOUSE'?'warehouseId':'locationId');
  const id=(columns[recordCol]||'').trim().slice(0,64);
  if(columns.length!==headers.length){
   issues.push({row,recordId:id,code:'CSV_COLUMN_COUNT_INVALID'});continue;
  }
  if(seen.has(id)){
   issues.push({row,recordId:id,code:'CSV_DUPLICATE_RECORD_ID_WITH_ROW_'+seen.get(id)});
   continue;
  }
  seen.set(id,row);
  try{
   const isolated=headers.map(quote).join(',')+'\r\n'+
    columns.map(quote).join(',')+'\r\n';
   const [change]=parseP3ImportCsv(isolated,kind,scope);
   validRows.push({...change,sourceRow:row});
  }catch(error){
   issues.push({row,recordId:id,
    code:error instanceof Error?error.message:'CSV_ROW_VALIDATION_FAILED'});
  }
 }
 return {validRows,issues,totalRows:rows.length-1};
}

function escapedCsvCell(value:unknown):string{
 let v=typeof value==='string'?value:value===null||value===undefined?'':String(value);
 if(/^[\s]*[=+@-]/.test(v))v="'"+v;
 return /[,"\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
}
/** One canonical export matrix shared by CSV and Excel.
 * REQUESTS uses proposed_values, LIST uses authoritative master values.
 */
export function exportP3Matrix(kind:MasterKind,scope:TransferScope,
 records:readonly Record<string,unknown>[]):string[][]{
 const headers=[...importHeaders(kind),'__state','__version','__requestId'];
 const output=[headers];
 for(const item of records){
  if(item.kind!==kind||item.legal_entity_id!==scope.legalEntityId||
    (item.site_id!==scope.siteId&&item.site_id!=='')||
    (item.warehouse_id!==scope.warehouseId&&item.warehouse_id!==''))
   throw Error('CSV_EXPORT_ROW_SCOPE_REJECTED');
  const vals=(item.master_values??item.values??item.proposed_values) as
    Record<string,unknown>|undefined;
  const values=vals&&typeof vals==='object'&&!Array.isArray(vals)?vals:{};
  const record:Record<string,unknown>={
   legalEntityId:scope.legalEntityId,siteId:scope.siteId,
   warehouseId:scope.warehouseId,
   [names[kind]]:item.record_id??'',reason:item.reason??'',
   __state:item.state??(item.active===true?'ACTIVE':
     item.active===false?'INACTIVE':'UNVERIFIED'),
   __version:item.version??item.expected_version??'',
   __requestId:item.request_id??''
  };
  for(const [name] of fields[kind])
   if(name!==names[kind]&&name!=='siteId')
    record[name]=values[name]??'';
  output.push(headers.map(key=>String(record[key]??'')));
 }
 return output;
}
export function exportP3Csv(kind:MasterKind,scope:TransferScope,
 records:readonly Record<string,unknown>[]):string{
 return '\ufeff'+exportP3Matrix(kind,scope,records)
  .map(row=>row.map(escapedCsvCell).join(',')).join('\r\n')+'\r\n';
}
