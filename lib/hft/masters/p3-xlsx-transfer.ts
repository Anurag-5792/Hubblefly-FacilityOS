/** HFT P3 Masters bounded Excel (.xlsx) import/export.
 * Local spreadsheet conversion only; no SQL, authentication or approvals.
 * Supports standard OOXML shared-strings, inline strings and deflate ZIP.
 * Rejects macros, external links, formulas, encrypted and oversized workbooks.
 */
import type {MasterKind} from './p3-contract.ts';
import {exportP3Matrix,fieldGuide,importHeaders,previewP3ImportCsv,
 MAX_CSV_IMPORT_ROWS,type TransferPreview,type TransferScope}
 from './p3-csv-transfer.ts';

const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_XLSX_INPUT=2*1024*1024,MAX_XLSX_UNCOMPRESSED=3*1024*1024;
const MAX_SHEETS=8,MAX_ENTRIES=80,MAX_COLUMNS=40;
const xlsxMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_MIME=xlsxMime;
function check(ok:unknown,code:string):asserts ok{
 if(!ok)throw Error('XLSX_'+code);
}
function binary(parts:readonly Uint8Array[]):Uint8Array{
 const size=parts.reduce((v,p)=>v+p.byteLength,0);
 const out=new Uint8Array(size);let pos=0;
 for(const p of parts){out.set(p,pos);pos+=p.byteLength;}return out;
}
function xml(value:string):string{
 return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function unxml(value:string):string{
 return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,(_,part:string)=>{
  const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(Object.hasOwn(named,part))return named[part];
  const cp=part.startsWith('#x')?Number.parseInt(part.slice(2),16):
   Number.parseInt(part.slice(1),10);
  check(Number.isInteger(cp)&&cp>0&&cp<=0x10ffff&&
   !(cp>=0xd800&&cp<=0xdfff),'XML_ENTITY_INVALID');
  return String.fromCodePoint(cp);
 }).replace(/&(?!(?:amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);)/g,()=>{
  throw Error('XLSX_XML_ENTITY_UNKNOWN');
 });
}
function attrs(tag:string):Record<string,string>{
 const out:Record<string,string>={};
 for(const match of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)){
  check(!Object.hasOwn(out,match[1]),'XML_ATTRIBUTE_DUPLICATE');
  out[match[1]]=unxml(match[2]);
 }
 return out;
}
function colName(n:number):string{
 let output='';for(let i=n;i>0;i=Math.floor((i-1)/26))
  output=String.fromCharCode(65+(i-1)%26)+output;
 return output;
}
function colNumber(s:string):number{
 let n=0;for(const c of s)n=n*26+(c.charCodeAt(0)-64);
 return n;
}
function cellText(value:string,row:number,column:number,header:boolean):string{
 const name=colName(column)+row;
 return '<c r="'+name+'" t="inlineStr"'+(header?' s="1"':'')+
  '><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
}
function sheetXml(rows:readonly (readonly string[])[]):string{
 check(rows.length<=MAX_CSV_IMPORT_ROWS+4,'EXPORT_TOO_MANY_ROWS');
 const width=Math.max(1,...rows.map(x=>x.length));
 check(width<=MAX_COLUMNS,'EXPORT_TOO_MANY_COLUMNS');
 const lines=rows.map((row,r)=>'<row r="'+(r+1)+'">'+
  row.map((v,i)=>cellText(v,r+1,i+1,r===0)).join('')+'</row>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<sheetViews><sheetView workbookViewId="0">'+
  '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'+
  '</sheetView></sheetViews>'+
  '<cols><col min="1" max="'+width+'" width="23" customWidth="1"/></cols>'+
  '<sheetData>'+lines+'</sheetData></worksheet>';
}
function bytes(s:string):Uint8Array{return utf8.encode(s);}
const CRC_TABLE=Array.from({length:256},(_,n)=>{
 let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 return c>>>0;
});
function crc32(data:Uint8Array):number{
 let c=0xffffffff;
 for(const n of data)c=CRC_TABLE[(c^n)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function wr16(view:DataView,n:number,v:number){view.setUint16(n,v,true);}
function wr32(view:DataView,n:number,v:number){view.setUint32(n,v>>>0,true);}
function zipStore(files:readonly [string,string][]):Uint8Array{
 const local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const [name,text] of files){
  const filename=bytes(name),data=bytes(text),crc=crc32(data);
  check(filename.length<=255,'FILE_NAME_INVALID');
  const localHeader=new Uint8Array(30+filename.length);
  const l=new DataView(localHeader.buffer);wr32(l,0,0x04034b50);
  wr16(l,4,20);wr16(l,6,0);wr16(l,8,0);wr32(l,14,crc);
  wr32(l,18,data.length);wr32(l,22,data.length);wr16(l,26,filename.length);
  localHeader.set(filename,30);
  local.push(localHeader,data);
  const cd=new Uint8Array(46+filename.length),d=new DataView(cd.buffer);
  wr32(d,0,0x02014b50);wr16(d,4,20);wr16(d,6,20);
  wr32(d,16,crc);wr32(d,20,data.length);wr32(d,24,data.length);
  wr16(d,28,filename.length);wr32(d,42,offset);
  cd.set(filename,46);central.push(cd);
  offset+=localHeader.length+data.length;
 }
 const cdSize=central.reduce((v,p)=>v+p.byteLength,0);
 const eocd=new Uint8Array(22),end=new DataView(eocd.buffer);
 wr32(end,0,0x06054b50);wr16(end,8,files.length);wr16(end,10,files.length);
 wr32(end,12,cdSize);wr32(end,16,offset);
 return binary([...local,...central,eocd]);
}
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font>'+
 '<font><b/><sz val="11"/><name val="Aptos"/></font></fonts>'+
 '<fills count="2"><fill><patternFill patternType="none"/></fill>'+
 '<fill><patternFill patternType="gray125"/></fill></fills>'+
 '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
 '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
 '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
 '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>'+
 '</styleSheet>';
function workbook(sheets:readonly Readonly<{name:string;rows:readonly (readonly string[])[]}>[]):Uint8Array{
 check(sheets.length>=1&&sheets.length<=MAX_SHEETS,'SHEET_COUNT_INVALID');
 const names=new Set<string>(), files:[string,string][]=[];
 const refs:string[]=[],rels:string[]=[],types:string[]=[];
 sheets.forEach((sheet,i)=>{
  check(/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(sheet.name)&&
    !names.has(sheet.name),'SHEET_NAME_INVALID');
  names.add(sheet.name);
  refs.push('<sheet name="'+sheet.name+'" sheetId="'+(i+1)+
   '" r:id="rId'+(i+1)+'"/>');
  rels.push('<Relationship Id="rId'+(i+1)+
   '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'+
   ' Target="worksheets/sheet'+(i+1)+'.xml"/>');
  types.push('<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml"'+
   ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  files.push(['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(sheet.rows)]);
 });
 const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 files.push(['[Content_Types].xml',header+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
  '<Default Extension="xml" ContentType="application/xml"/>'+
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
  types.join('')+'</Types>']);
 files.push(['_rels/.rels',header+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'+
  ' Target="xl/workbook.xml"/></Relationships>']);
 files.push(['xl/workbook.xml',header+
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'+
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<sheets>'+refs.join('')+'</sheets></workbook>']);
 files.push(['xl/_rels/workbook.xml.rels',header+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  rels.join('')+
  '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"'+
  ' Target="styles.xml"/></Relationships>']);
 files.push(['xl/styles.xml',styles]);
 return zipStore(files);
}
function guide(kind:MasterKind):string[][]{
 return [['field','classification','validation / purpose'],
  ...fieldGuide(kind).map(f=>[f.field,f.marker,f.note])];
}
function exampleRow(kind:MasterKind):string[]{
 const sample:Record<string,string>={
  legalEntityId:'EXAMPLE_ENTITY',siteId:'EXAMPLE_SITE',warehouseId:'EXAMPLE_WH',
  employeeId:'EXAMPLE_EMPLOYEE',fullName:'Fictional Sample Person',
  department:'DEMO_STORES',designation:'DEMO_OPERATOR',
  itemCode:'EXAMPLE_ITEM',uom:'PCS',controlType:'NONE',
  supplierId:'EXAMPLE_SUPPLIER',legalName:'Fictional Sample Supplier',
  name:'Fictional Sample Warehouse',locationId:'EXAMPLE_BIN',
  parentLocationId:'',reason:'FICTIONAL SAMPLE - NEVER SUBMIT'
 };
 return importHeaders(kind).map(x=>sample[x]??'');
}
export function blankP3Xlsx(kind:MasterKind):Uint8Array{
 return workbook([{name:'IMPORT',rows:[importHeaders(kind)]},
  {name:'FIELD_GUIDE',rows:guide(kind)}]);
}
export function sampleP3Xlsx(kind:MasterKind):Uint8Array{
 return workbook([{name:'IMPORT',rows:[importHeaders(kind),exampleRow(kind)]},
  {name:'FIELD_GUIDE',rows:guide(kind)},
  {name:'DEMONSTRATION_ONLY',rows:[
   ['NOT FOR LIVE IMPORT','FICTIONAL SAMPLE RECORDS'],
   ['All sample IDs begin EXAMPLE_','The validator rejects them by design']]}]);
}
export function exportP3Xlsx(kind:MasterKind,scope:TransferScope,
 records:readonly Record<string,unknown>[]):Uint8Array{
 return workbook([{name:'MASTER_EXPORT',rows:exportP3Matrix(kind,scope,records)},
  {name:'FIELD_GUIDE',rows:guide(kind)}]);
}
const sig=(v:DataView,n:number)=>v.getUint32(n,true);
type ZipEntry=Readonly<{name:string;offset:number;size:number;
 compressed:number;method:number;crc:number}>;
async function unzip(input:Uint8Array):Promise<Map<string,string>>{
 check(input.length>40&&input.length<=MAX_XLSX_INPUT,'INPUT_SIZE_INVALID');
 const data=new DataView(input.buffer,input.byteOffset,input.byteLength);
 let end=-1;
 for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--){
  if(sig(data,i)===0x06054b50){end=i;break;}
 }
 check(end>=0&&data.getUint16(end+4,true)===0&&
  data.getUint16(end+6,true)===0,'ZIP_CENTRAL_DIRECTORY_MISSING');
 const n=data.getUint16(end+10,true),bytesCentral=sig(data,end+12);
 let cursor=sig(data,end+16);
 check(n>=4&&n<=MAX_ENTRIES&&
  data.getUint16(end+8,true)===n&&cursor+bytesCentral<=end,
  'ZIP_ENTRY_COUNT_OR_DIRECTORY_INVALID');
 const entries:ZipEntry[]=[],names=new Set<string>();let total=0;
 for(let i=0;i<n;i++){
  check(cursor+46<=end&&sig(data,cursor)===0x02014b50,'ZIP_CENTRAL_ENTRY_INVALID');
  const flags=data.getUint16(cursor+8,true),method=data.getUint16(cursor+10,true);
  const crc=sig(data,cursor+16),compressed=sig(data,cursor+20);
  const size=sig(data,cursor+24),nameLen=data.getUint16(cursor+28,true);
  const extraLen=data.getUint16(cursor+30,true),commentLen=data.getUint16(cursor+32,true);
  const offset=sig(data,cursor+42);
  check((flags&1)===0&&(flags&0x40)===0&&[0,8].includes(method)&&
   cursor+46+nameLen+extraLen+commentLen<=end,'ZIP_ENCRYPTED_OR_UNSUPPORTED');
  const name=decoder.decode(input.subarray(cursor+46,cursor+46+nameLen));
  check(!names.has(name)&&!name.includes('..')&&!name.includes('\\')&&
   !name.startsWith('/')&&name.length<=180,'ZIP_ENTRY_PATH_INVALID');
  check(!/vbaProject|externalLink|activeX|embeddings|oleObject/i.test(name),
   'MACRO_OR_EXTERNAL_CONTENT_DENIED');
  check(size<=MAX_XLSX_UNCOMPRESSED&&
   (compressed>0||size===0)&&
   (size<=compressed*450+4096),'ZIP_COMPRESSION_RATIO_EXCEEDED');
  total+=size;check(total<=MAX_XLSX_UNCOMPRESSED,'ZIP_DECOMPRESSED_LIMIT');
  names.add(name);entries.push({name,offset,size,compressed,method,crc});
  cursor+=46+nameLen+extraLen+commentLen;
 }
 check(cursor<=end,'ZIP_TRAILING_DIRECTORY_INVALID');
 const result=new Map<string,string>();
 for(const e of entries){
  const o=e.offset;
  check(o+30<=input.length&&sig(data,o)===0x04034b50,
   'ZIP_LOCAL_HEADER_MISSING');
  const localName=data.getUint16(o+26,true),extra=data.getUint16(o+28,true);
  const start=o+30+localName+extra;
  check(start+e.compressed<=input.length,'ZIP_ENTRY_TRUNCATED');
  const compressed=input.subarray(start,start+e.compressed);
  let decoded:Uint8Array;
  if(e.method===0)decoded=compressed;
  else {
   try{
    const copied=new Uint8Array(compressed.length);
    copied.set(compressed);
    const raw=await new Response(new Blob([copied.buffer]).stream()
     .pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    decoded=new Uint8Array(raw);
   }catch{throw Error('XLSX_DEFLATE_UNAVAILABLE_OR_INVALID');}
  }
  check(decoded.length===e.size&&crc32(decoded)===e.crc,'ZIP_CRC_OR_LENGTH_MISMATCH');
  if(e.name.endsWith('.xml')||e.name.endsWith('.rels')){
   check(decoded.length<=MAX_XLSX_UNCOMPRESSED,'XML_OVERSIZE');
   result.set(e.name,decoder.decode(decoded));
  }
 }
 return result;
}
function readStrings(xmlText:string|undefined):string[]{
 if(!xmlText)return [];
 const out:string[]=[];
 for(const si of xmlText.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)){
  out.push([...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
   .map(t=>unxml(t[1])).join(''));
  check(out.length<=5000,'SHARED_STRINGS_TOO_LARGE');
 }
 return out;
}
function parseSheet(xmlText:string,strings:readonly string[]):string[][]{
 check(xmlText.length<=MAX_XLSX_UNCOMPRESSED,'XML_OVERSIZE');
 check(!/<(?:f|extLst)\b/i.test(xmlText),'FORMULA_OR_EXTENSION_DENIED');
 const sheet=xmlText.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
 check(sheet!==null,'WORKSHEET_SHEETDATA_REQUIRED');
 const output:string[][]=[];let lastRow=0;
 for(const row of sheet[1].matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)){
  const rowIndex=Number(attrs(row[1]).r??lastRow+1);
  check(Number.isSafeInteger(rowIndex)&&rowIndex>lastRow&&
   rowIndex<=MAX_CSV_IMPORT_ROWS+8,'WORKSHEET_ROW_RANGE_OR_ORDER');
  lastRow=rowIndex;
  const cells:string[]=[],seen=new Set<number>();
  for(const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const att=attrs(cell[1]),ref=/^([A-Z]{1,3})([1-9]\d*)$/.exec(att.r||'');
   check(ref&&Number(ref[2])===rowIndex,'WORKSHEET_CELL_ADDRESS_INVALID');
   const col=colNumber(ref[1]);
   check(col>0&&col<=MAX_COLUMNS&&!seen.has(col),'WORKSHEET_CELL_COLUMN_INVALID');
   seen.add(col);
   const body=cell[2]||'',type=att.t||'n';
   check(!/<f\b/.test(body)&&!['e','b','str'].includes(type),
    'FORMULA_ERROR_OR_BOOLEAN_DENIED');
   let value='';
   if(type==='inlineStr')
    value=[...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
     .map(t=>unxml(t[1])).join('');
   else {
    const v=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
    if(v)value=unxml(v[1]);
    if(type==='s'){
     const index=Number(value);
     check(Number.isInteger(index)&&index>=0&&index<strings.length,
      'SHARED_STRING_INDEX_INVALID');
     value=strings[index];
    }else check(['n','d'].includes(type),'WORKSHEET_CELL_TYPE_INVALID');
   }
   check(value.length<=1000,'WORKSHEET_CELL_VALUE_TOO_LONG');
   cells[col-1]=value;
  }
  output[rowIndex-1]=Array.from({length:cells.length},(_,i)=>cells[i]??'');
 }
 return output;
}
function firstImportSheet(files:Map<string,string>):string{
 const wb=files.get('xl/workbook.xml'),rels=files.get('xl/_rels/workbook.xml.rels');
 check(wb&&rels,'WORKBOOK_XML_REQUIRED');
 const sheetTags=[...wb.matchAll(/<sheet\b([^>]*?)\/>/g)].map(x=>attrs(x[1]));
 check(sheetTags.length>0&&sheetTags.length<=MAX_SHEETS,'WORKBOOK_SHEET_COUNT_INVALID');
 const selected=sheetTags.find(x=>x.name==='IMPORT')??sheetTags[0];
 check(selected['r:id'],'WORKBOOK_IMPORT_RELATION_MISSING');
 let target='';
 for(const rel of rels.matchAll(/<Relationship\b([^>]*?)\/>/g)){
  const a=attrs(rel[1]);
  if(a.Id===selected['r:id']){target=a.Target??'';break;}
 }
 check(target.length>0&&!target.includes('..')&&!target.includes('\\')&&
  !/^https?:/i.test(target),'WORKBOOK_IMPORT_TARGET_INVALID');
 const name=target.startsWith('/xl/')?target.slice(1):
  'xl/'+target.replace(/^\/+/,'');
 check(name.startsWith('xl/worksheets/')&&files.has(name),
  'WORKBOOK_IMPORT_SHEET_MISSING');
 return files.get(name)!;
}
function csvEncode(rows:readonly (readonly string[])[]):string{
 const quote=(v:string)=>/[",\r\n]/.test(v)?
  '"'+v.replaceAll('"','""')+'"':v;
 return rows.map(x=>x.map(quote).join(',')).join('\r\n')+'\r\n';
}
/** Reads a real Excel-uploaded XLSX locally. No database access or UI SAVE.
 * Returns the same per-row PREVIEW contract as the CSV import.
 */
export async function previewP3ImportXlsx(data:Uint8Array,
 kind:MasterKind,scope:TransferScope):Promise<TransferPreview>{
 const entries=await unzip(data);
 const source=firstImportSheet(entries);
 const matrix=parseSheet(source,readStrings(entries.get('xl/sharedStrings.xml')));
 check(matrix.length>=2,'HEADER_AND_ONE_REAL_ROW_REQUIRED');
 return previewP3ImportCsv(csvEncode(matrix),kind,scope);
}
