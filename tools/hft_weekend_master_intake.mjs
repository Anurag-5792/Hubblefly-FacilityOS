/**
 * HFT R77 weekend master intake. Offline staging ONLY.
 * No API, PostgreSQL, signer, proof, master apply or inventory writes.
 */
import {readFileSync,writeFileSync,mkdirSync,rmSync,renameSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join,dirname,relative,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CONTRACT='HFT-R77-WEEKEND-STAGED-MASTERS-V1';
export const CSV_HEADERS=Object.freeze({
 legal_entities:['legalEntityId','legalName'],
 sites:['legalEntityId','siteId','siteName'],
 warehouses:['legalEntityId','siteId','warehouseId','name','reason'],
 locations:['legalEntityId','siteId','warehouseId','locationId','parentLocationId','locationKind','physicallyVerified','verificationReference','reason'],
 employees:['legalEntityId','siteId','warehouseId','employeeId','fullName','department','designation','reason'],
 items:['legalEntityId','siteId','warehouseId','itemCode','uom','controlType','reason'],
 item_versions:['legalEntityId','itemCode','versionCode','requestedState','primaryPhotoPath','primaryPhotoSha256','rightsEvidenceReference'],
 suppliers:['legalEntityId','siteId','warehouseId','supplierId','legalName','reason'],
 opening_stock_observations:['legalEntityId','siteId','warehouseId','locationId','itemCode','versionCode','serialNo','batchNo','observedQuantity','uom','observedAt','observerEmployeeId','evidenceReference'],
 invoice_grn_preparation:['legalEntityId','siteId','warehouseId','supplierId','invoiceNumber','invoiceDate','grnReference','physicalReceiptReference','receiptLineNo','itemCode','versionCode','locationId','serialNo','batchNo','observedQuantity','uom','qcObservation','qcEvidenceReference','sourceDocumentReference']
});
const ID=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const VERSION=/^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const HEX=/^[0-9a-f]{64}$/;
const QUANTITY=/^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,6})?$/;
const kinds=['RACK','AREA','LEVEL','POSITION','STACK_SLOT','BIN','CONTAINER'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=(...f)=>JSON.stringify(f);
const issue=(r,file,row,code,field='',warning=false)=>{
 r[warning?'warnings':'errors'].push({file:file+'.csv',row,field,code});
};
export function parseCsv(content){
 const input=content.replace(/^\ufeff/,'');
 if(input.length>4000000||input.includes('\0'))throw Error('CSV_UNSAFE_SIZE_OR_NULL');
 let quote=false,closed=false,start=true,field='',row=[],rows=[];
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quote){
   if(c==='"'&&input[i+1]==='"'){field+='"';i++;}
   else if(c==='"'){quote=false;closed=true;}
   else field+=c;
  }else if(closed){
   if(c===','){row.push(field);field='';closed=false;start=true;}
   else if(c==='\r'||c==='\n'){
    if(c==='\r'&&input[i+1]==='\n')i++;
    rows.push([...row,field]);row=[];field='';closed=false;start=true;
   }else throw Error('CSV_TRAILING_QUOTED_FIELD_GARBAGE');
  }else if(c==='"'){
   if(!start)throw Error('CSV_QUOTE_IN_PLAIN_FIELD');
   quote=true;start=false;
  }else if(c===','){row.push(field);field='';start=true;}
  else if(c==='\r'||c==='\n'){
   if(c==='\r'&&input[i+1]==='\n')i++;
   rows.push([...row,field]);row=[];field='';start=true;
  }else{field+=c;start=false;}
 }
 if(quote)throw Error('CSV_UNTERMINATED_QUOTE');
 if(field!==''||row.length||closed)rows.push([...row,field]);
 return rows;
}
export function csv(rows){
 return rows.map(r=>r.map(s=>{
  const v=String(s);
  return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
 }).join(',')).join('\r\n')+'\r\n';
}
function businessKey(file,r){
 switch(file){
  case 'legal_entities':return key(r.legalEntityId);
  case 'sites':return key(r.legalEntityId,r.siteId);
  case 'warehouses':return key(r.legalEntityId,r.warehouseId);
  case 'employees':return key(r.legalEntityId,r.employeeId);
  case 'items':return key(r.legalEntityId,r.itemCode);
  case 'suppliers':return key(r.legalEntityId,r.supplierId);
  case 'locations':return key(r.legalEntityId,r.warehouseId,r.locationId);
  case 'item_versions':return key(r.legalEntityId,r.itemCode,r.versionCode);
  case 'opening_stock_observations':return key(r.legalEntityId,r.warehouseId,r.locationId,r.itemCode,r.versionCode,r.serialNo,r.batchNo,r.observedAt);
  default:return key(r.legalEntityId,r.supplierId,r.invoiceNumber,r.physicalReceiptReference,r.receiptLineNo);
 }
}
function checkRow(result,file,line,r){
 const fail=(code,field='')=>issue(result,file,line,code,field);
 const warn=(code,field='')=>issue(result,file,line,code,field,true);
 const ident=(name,opt=false,one=false)=>{
  if(opt&&r[name]==='')return;
  if(!(one?VERSION:ID).test(r[name]))fail('IDENTIFIER_CONTRACT_INVALID',name);
 };
 const value=(name,min=1,max=160)=>{
  if(r[name].length<min||r[name].length>max)fail('TEXT_LENGTH_INVALID',name);
 };
 const date=name=>{
  const v=r[name];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||
     new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)
   fail('CALENDAR_DATE_INVALID',name);
 };
 const qty=()=>{
  if(!QUANTITY.test(r.observedQuantity)||
    QUANTITY.test(r.observedQuantity)&&BigInt(r.observedQuantity.split('.')[0])>9223372036854n)
   fail('QUANTITY_DECIMAL_6_OR_RANGE_INVALID','observedQuantity');
 };
 for(const [k,v] of Object.entries(r)){
  if(v!==v.trim())fail('UNTRIMMED_FIELD',k);
  if(v.length>320||/[\u0000-\u001f\u007f]/.test(v))fail('UNSAFE_FIELD',k);
  if(/^[=+@-]/.test(v))fail('CSV_FORMULA_INJECTION',k);
 }
 ident('legalEntityId');
 if(!['legal_entities','item_versions'].includes(file))ident('siteId');
 if(!['legal_entities','sites','item_versions'].includes(file))ident('warehouseId');
 if('reason' in r)value('reason',8,300);
 switch(file){
 case 'legal_entities':value('legalName');break;
 case 'sites':value('siteName');break;
 case 'warehouses':value('name');break;
 case 'employees':
  ident('employeeId');['fullName','department','designation'].forEach(n=>value(n));break;
 case 'items':
  ident('itemCode');ident('uom');
  if(!['NONE','BATCH','SERIAL'].includes(r.controlType))fail('TRACEABILITY_INVALID','controlType');break;
 case 'suppliers':ident('supplierId');value('legalName');break;
 case 'locations':
  ident('locationId');ident('parentLocationId',true);
  if(r.parentLocationId===r.locationId)fail('SELF_PARENT_LOCATION');
  if(!kinds.includes(r.locationKind))fail('LOCATION_KIND_INVALID');
  if(!['YES','NO'].includes(r.physicallyVerified))fail('VERIFICATION_FLAG_INVALID');
  if(r.physicallyVerified==='YES')value('verificationReference',8);
  if(r.locationKind==='AREA')warn('FLOOR_CERTIFICATION_REQUIRED');
  if(['BIN','CONTAINER'].includes(r.locationKind)&&r.physicallyVerified!=='YES')
   warn('UNVERIFIED_PHYSICAL_BIN_NOT_STOCK_READY');
  break;
 case 'item_versions':
  ident('itemCode');ident('versionCode',false,true);
  if(!['DRAFT','ACTIVE','RETIRED'].includes(r.requestedState))fail('VERSION_STATE_INVALID');
  if(!r.primaryPhotoPath)warn('MISSING_PRIMARY_PHOTO_VERSION_NOT_QUALIFIED');
  if(r.primaryPhotoPath&&(!/^photos\/[A-Za-z0-9._-]{1,200}\.(jpg|jpeg|png|webp)$/i.test(r.primaryPhotoPath)||
      r.primaryPhotoPath.includes('..')))fail('PHOTO_PATH_UNSAFE');
  if(r.primaryPhotoPath&&!HEX.test(r.primaryPhotoSha256))fail('PHOTO_SHA256_REQUIRED');
  if(!r.primaryPhotoPath&&r.primaryPhotoSha256)fail('PHOTO_PATH_MISSING');
  if(r.primaryPhotoPath&&!r.rightsEvidenceReference)warn('PHOTO_RIGHTS_NOT_VERIFIED');
  break;
 case 'opening_stock_observations':
  ['locationId','itemCode','uom','observerEmployeeId'].forEach(n=>ident(n));
  ident('versionCode',false,true);ident('serialNo',true);ident('batchNo',true);
  date('observedAt');qty();value('evidenceReference',8);break;
 case 'invoice_grn_preparation':
  ['supplierId','itemCode','locationId','uom'].forEach(n=>ident(n));
  ident('versionCode',false,true);ident('serialNo',true);ident('batchNo',true);
  value('invoiceNumber');date('invoiceDate');qty();
  ['grnReference','physicalReceiptReference','sourceDocumentReference'].forEach(n=>value(n,2));
  if(!/^[1-9]\d{0,6}$/.test(r.receiptLineNo))fail('RECEIPT_LINE_INVALID');
  if(!['PENDING','ACCEPTED','REJECTED'].includes(r.qcObservation))fail('QC_OBSERVATION_INVALID');
  if(r.qcObservation!=='PENDING')value('qcEvidenceReference',8);
  break;
 }
}
function crossCheck(rows,result){
 const index=name=>new Map(rows[name].map(x=>[businessKey(name,x.data),x.data]));
 const e=index('legal_entities'),s=index('sites'),w=index('warehouses'),
  i=index('items'),v=index('item_versions'),sup=index('suppliers'),l=index('locations');
 const employees=index('employees');
 for(const [name,entries] of Object.entries(rows))for(const {line,data:r} of entries){
  const fail=(code,field='')=>issue(result,name,line,code,field);
  const warn=(code,field='')=>issue(result,name,line,code,field,true);
  if(name!=='legal_entities'&&!e.has(key(r.legalEntityId)))warn('ENTITY_DB_EXISTENCE_UNVERIFIED');
  if(!['legal_entities','item_versions'].includes(name)&&!s.has(key(r.legalEntityId,r.siteId)))
   warn('SITE_DB_EXISTENCE_UNVERIFIED');
  if('warehouseId' in r&&name!=='warehouses'){
   const warehouse=w.get(key(r.legalEntityId,r.warehouseId));
   if(!warehouse)warn('WAREHOUSE_DB_EXISTENCE_UNVERIFIED');
   else if(warehouse.siteId!==r.siteId)fail('WAREHOUSE_CROSS_SITE_SCOPE','warehouseId');
  }
  if(name==='item_versions'&&!i.has(key(r.legalEntityId,r.itemCode)))
   warn('ITEM_DB_EXISTENCE_UNVERIFIED');
  if(name==='locations'){
   if(!r.parentLocationId&&r.locationKind!=='RACK'&&r.locationKind!=='AREA')
    fail('LOCATION_ROOT_KIND_INVALID');
   if(r.parentLocationId){
    const parent=l.get(key(r.legalEntityId,r.warehouseId,r.parentLocationId));
    if(!parent)warn('PARENT_LOCATION_DB_EXISTENCE_UNVERIFIED');
    else if(!({RACK:['LEVEL'],LEVEL:['POSITION'],POSITION:['STACK_SLOT','BIN'],
      STACK_SLOT:['BIN','CONTAINER']}[parent.locationKind]||[]).includes(r.locationKind))
     fail('LOCATION_KIND_PATH_INVALID');
   }
  }
  if(name==='opening_stock_observations'||name==='invoice_grn_preparation'){
   const item=i.get(key(r.legalEntityId,r.itemCode));
   const loc=l.get(key(r.legalEntityId,r.warehouseId,r.locationId));
   if(!loc)warn('PHYSICAL_BIN_DB_EXISTENCE_UNVERIFIED');
   else if(loc.physicallyVerified!=='YES')warn('PHYSICAL_BIN_NOT_VERIFIED');
   else if(!['BIN','CONTAINER','AREA'].includes(loc.locationKind))fail('NOT_A_VALID_STOCK_LEAF');
   if(!item)warn('ITEM_DB_EXISTENCE_UNVERIFIED');
   else {
    if(item.uom!==r.uom)fail('ITEM_UOM_MISMATCH');
    if(item.controlType==='SERIAL'&&
     (r.serialNo===''||r.batchNo!==''||!/^1(?:\.0{1,6})?$/.test(r.observedQuantity)))
     fail('SERIAL_EXACT_ONE_UNIT_REQUIRED');
    if(item.controlType==='BATCH'&&(r.batchNo===''||r.serialNo!==''))fail('BATCH_IDENTITY_INVALID');
    if(item.controlType==='NONE'&&(r.batchNo!==''||r.serialNo!==''))fail('NONE_TRACEABILITY_MUST_BE_EMPTY');
   }
   if(!v.has(key(r.legalEntityId,r.itemCode,r.versionCode)))warn('VERSION_DB_EXISTENCE_UNVERIFIED');
  }
  if(name==='opening_stock_observations'&&!employees.has(key(r.legalEntityId,r.observerEmployeeId)))
   warn('OBSERVING_EMPLOYEE_DB_EXISTENCE_UNVERIFIED');
  if(name==='invoice_grn_preparation'&&!sup.has(key(r.legalEntityId,r.supplierId)))
   warn('SUPPLIER_DB_EXISTENCE_UNVERIFIED');
 }
 const loc=new Map(rows.locations.map(x=>[businessKey('locations',x.data),x]));
 const visited=new Set(),stack=new Set();
 function walk(id){
  if(stack.has(id))return true;
  if(visited.has(id))return false;
  stack.add(id);const x=loc.get(id);
  const parent=x?.data.parentLocationId;
  if(parent&&walk(key(x.data.legalEntityId,x.data.warehouseId,parent)))
   issue(result,'locations',x.line,'PARENT_LOCATION_CYCLE');
  stack.delete(id);visited.add(id);return false;
 }
 for(const id of loc.keys())walk(id);
}
function inspectPhotos(dir,rows,result){
 const photos=[],used=new Set();
 for(const {line,data:r} of rows.item_versions){
  if(!r.primaryPhotoPath||!/^photos\/[A-Za-z0-9._-]{1,200}\.(jpg|jpeg|png|webp)$/i.test(r.primaryPhotoPath)||
    r.primaryPhotoPath.includes('..'))continue;
  if(used.has(r.primaryPhotoPath))issue(result,'item_versions',line,'PHOTO_REUSED_FOR_DIFFERENT_VERSION');
  used.add(r.primaryPhotoPath);
  const path=resolve(dir,r.primaryPhotoPath),rel=relative(dir,path);
  if(rel.startsWith('..'+sep)||rel==='..'||isAbsolute(rel))continue;
  try{
   const folder=lstatSync(join(dir,'photos')),file=lstatSync(path);
   if(!folder.isDirectory()||folder.isSymbolicLink()||!file.isFile()||file.isSymbolicLink()||
     file.size<1||file.size>15000000)throw Error('NOT_A_QUALIFIED_LOCAL_FILE');
   const bytes=readFileSync(path),digest=hash(bytes);
   if(digest!==r.primaryPhotoSha256)issue(result,'item_versions',line,'PHOTO_BYTES_HASH_MISMATCH');
   const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
   if(!((/\.jpe?g$/i.test(path)&&jpg)||(/\.png$/i.test(path)&&png)||(/\.webp$/i.test(path)&&webp)))
    issue(result,'item_versions',line,'PHOTO_FILE_TYPE_MISMATCH');
   photos.push({legalEntityId:r.legalEntityId,itemCode:r.itemCode,versionCode:r.versionCode,
    relativeFile:r.primaryPhotoPath,sha256:digest,byteSize:file.size,
    status:'BYTES_MATCH_ONLY_NOT_VERIFIED_NOT_APPROVED'});
  }catch{issue(result,'item_versions',line,'PHOTO_FILE_MISSING_OR_UNSAFE');}
 }
 return photos;
}
export function validateDirectory(input){
 const dir=resolve(input),stat=lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('UNTRUSTED_INPUT_DIRECTORY');
 const result={contract:CONTRACT,errors:[],warnings:[],files:{},rows:0};
 const rows={};
 for(const [file,headers] of Object.entries(CSV_HEADERS)){
  const path=join(dir,file+'.csv');
  let bytes,table;
  try{
   const st=lstatSync(path);
   if(!st.isFile()||st.isSymbolicLink()||st.size>4000000)throw Error('UNSAFE_FILE');
   bytes=readFileSync(path);
   table=parseCsv(bytes.toString('utf8'));
  }catch{issue(result,file,1,'FILE_MISSING_OR_CSV_PARSE_FAILED');rows[file]=[];continue;}
  if(table.length===0||JSON.stringify(table[0])!==JSON.stringify(headers)){
   issue(result,file,1,'EXACT_HEADERS_REQUIRED');rows[file]=[];continue;
  }
  if(table.length>2001)issue(result,file,1,'FILE_ROW_LIMIT_EXCEEDED');
  const entries=[],seen=new Set();
  for(let n=1;n<table.length;n++){
   const values=table[n],line=n+1;
   if(values.length===1&&values[0]==='')continue;
   if(values.length!==headers.length){issue(result,file,line,'COLUMN_COUNT_INVALID');continue;}
   const data=Object.fromEntries(headers.map((h,k)=>[h,values[k]]));
   checkRow(result,file,line,data);
   const identity=businessKey(file,data);
   if(seen.has(identity))issue(result,file,line,'DUPLICATE_SCOPED_IDENTITY');
   seen.add(identity);entries.push({line,data});
  }
  rows[file]=entries;result.rows+=entries.length;
  result.files[file+'.csv']={sha256:hash(bytes),rowCount:entries.length};
 }
 crossCheck(rows,result);
 const photos=inspectPhotos(dir,rows,result);
 result.errors.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 result.warnings.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const sourceSha256=hash(Object.entries(result.files).sort(([a],[b])=>a.localeCompare(b))
   .map(([f,v])=>f+':'+v.sha256).join('\n'));
 const masters=[['warehouses','WAREHOUSE','warehouseId',['name','siteId']],
  ['employees','EMPLOYEE','employeeId',['fullName','department','designation','siteId']],
  ['items','ITEM','itemCode',['uom','controlType']],
  ['suppliers','SUPPLIER','supplierId',['legalName']],
  ['locations','LOCATION','locationId',['parentLocationId']]];
 const p3=[];
 for(const [file,kind,id,keys] of masters)for(const {line,data:r} of rows[file]){
  const values=Object.fromEntries(keys.map(k=>[k,r[k]]));
  p3.push({csvFile:file+'.csv',csvRow:line,status:'UNSUBMITTED_OFFLINE_CANDIDATE',
   stageSha256:hash(JSON.stringify([file,businessKey(file,r),r])),
   limitations:kind==='EMPLOYEE'?'INDEPENDENT_EMPLOYEE_APPROVAL_AND_DB_REQUIRED':
    'NO_QUALIFIED_NONEMPLOYEE_APPLY_WRITER',
   change:{contractVersion:'HFT-R1-P3-MASTER-V1',requestId:null,
    kind,operation:'CREATE',legalEntityId:r.legalEntityId,siteId:r.siteId,
    warehouseId:r.warehouseId,recordId:r[id],expectedVersion:'0',
    reason:r.reason,values}});
 }
 const privateNonposting={
  itemVersions:rows.item_versions.map(x=>x.data),photographs:photos,
  physicalLocationCertificationCandidates:rows.locations.map(x=>({
   locationId:x.data.locationId,warehouseId:x.data.warehouseId,
   kind:x.data.locationKind,physicalInspectionReference:x.data.verificationReference,
   state:'UNVERIFIED_NO_P0_CERTIFICATION'})),
  openingStockObservations:rows.opening_stock_observations.map(x=>x.data),
  invoiceGrnPreparation:rows.invoice_grn_preparation.map(x=>x.data),
  legalEntities:rows.legal_entities.map(x=>x.data),sites:rows.sites.map(x=>x.data),
  legalEffect:'NONE_NO_POSTGRESQL_WRITE_NO_STOCK_NO_APPROVAL'
 };
 return {result,rows,p3,privateNonposting,sourceSha256,valid:result.errors.length===0};
}
function stage(input,output,data){
 const dir=resolve(output),parent=dirname(dir),source=resolve(input);
 if(existsSync(dir)||dir===source||dir.startsWith(source+sep)||
  !existsSync(parent)||!lstatSync(parent).isDirectory()||
  lstatSync(parent).isSymbolicLink())throw Error('STAGE_OUTPUT_UNSAFE_OR_EXISTS');
 const tmp=dir+'.pending-'+process.pid;
 if(existsSync(tmp))throw Error('STAGE_TEMP_ALREADY_EXISTS');
 mkdirSync(tmp,{mode:0o700});
 const json=(name,value)=>writeFileSync(join(tmp,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 try{
  json('validation-report.json',{...data.result,state:data.valid?
    'STAGED_OFFLINE_ONLY':'REJECTED_NO_IMPORT_PROPOSALS'});
  if(data.valid){
   mkdirSync(join(tmp,'normalized'),{mode:0o700});
   for(const [name,headers] of Object.entries(CSV_HEADERS))
    writeFileSync(join(tmp,'normalized',name+'.csv'),csv([headers,...data.rows[name]
     .map(x=>headers.map(h=>x.data[h]))]),{flag:'wx',mode:0o600});
   json('p3-create-candidates.UNSUBMITTED.json',{contract:CONTRACT,
    authentication:'NONE_NO_HMAC_NO_APPROVAL',entries:data.p3});
   json('separate-nonposting-data.json',data.privateNonposting);
   json('manifest.json',{contract:CONTRACT,sourceSha256:data.sourceSha256,
    files:data.result.files,rows:data.result.rows,
    state:'OFFLINE_ONLY_NOT_PERSISTED',p3Employee:'REQUIRES_GOVERNED_APPLY',
    p3OtherMasters:'NO_ACCEPTED_APPLY',stock:'NO_AUTHORITATIVE_BALANCE',
    receipts:'NO_GRN_QC_OR_POSTING',middleware:'HFT_R1_API_NOT_QUALIFIED'});
  }
  renameSync(tmp,dir);
 }catch(error){rmSync(tmp,{recursive:true,force:true});throw error;}
 return {output:dir,state:data.valid?'STAGED_OFFLINE_ONLY':'REJECTED_NO_IMPORT_PROPOSALS',
  rows:data.result.rows,errors:data.result.errors.length,warnings:data.result.warnings.length};
}
function cli(args){
 try{
  if(args.length===2&&args[0]==='--init'){
   const dir=resolve(args[1]);
   if(existsSync(dir)||!existsSync(dirname(dir)))throw Error('INIT_DESTINATION_NOT_EMPTY_OR_PARENT_MISSING');
   mkdirSync(dir,{mode:0o700});
   for(const [name,header] of Object.entries(CSV_HEADERS))
    writeFileSync(join(dir,name+'.csv'),csv([header]),{flag:'wx',mode:0o600});
   mkdirSync(join(dir,'photos'),{mode:0o700});
   process.stdout.write('HFT_R77_BLANK_CSV_TEMPLATES_ONLY\n');return;
  }
  if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')
   throw Error('USE_--input_FOLDER_--output_NEW_FOLDER');
  const data=validateDirectory(args[1]);
  const result=stage(args[1],args[3],data);
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!data.valid)process.exitCode=2;
 }catch(error){
  process.stderr.write('HFT_R77_OFFLINE_INTAKE_STOP:'+
   (error instanceof Error?error.message:'UNKNOWN')+'\n');
  process.exitCode=2;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 cli(process.argv.slice(2));
