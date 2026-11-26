import {readFileSync,writeFileSync,mkdtempSync,renameSync,rmSync,existsSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const specs={"Opening":[1,53],"Serial Tracked Items":[3,35],"Batch Tracked Items":[3,27],"Batch 3 Sticker Register":[1,20],"B3 Movement Validation 25Nov":[5,18],"SFG Register":[5,16],"SFG Components":[5,14]};
function stage(retained,live,specs){
 const names=["item_identity_candidates","item_attributes","item_version_candidates","location_candidates","opening_stock_observation_candidates","batch_references","serial_candidates","retired_serials","serial_quantity_holds","inspection_observations","historical_qr_aliases","movement_holds","sfg_design_references","sfg_component_references"];
 const tables=Object.fromEntries(names.map(k=>[k,[]])),violations=[],rejected=[],delta=[];
 const blank=v=>v===undefined||v===null||v==="";
 const str=v=>blank(v)?"":String(v);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const error=(source,reason)=>violations.push({source,reason,disposition:"HOLD"});
 const reject=(source,reason)=>rejected.push({source,reason,disposition:"HOLD"});
 const scope=()=>({legal_entity_id:"",site_id:"",warehouse_id:""});
 function read(book,sheet,required){
  const [h,n]=specs[sheet],rows=book[sheet];
  if(!Array.isArray(rows)||!Array.isArray(rows[h-1]))throw Error("MISSING_HEADER:"+sheet);
  const pad=r=>Array.from({length:n},(_,i)=>r?.[i]??"");
  const header=pad(rows[h-1]),ix={};
  for(const k of required){const j=header.indexOf(k);if(j<0||header.lastIndexOf(k)!==j)throw Error("HEADER_MISMATCH:"+sheet+":"+k);ix[k]=j;}
  return{header,rows:rows.slice(h).map((r,i)=>({source:sheet+"!"+(i+h+1),row:i+h+1,raw:pad(r)})).filter(r=>r.raw.some(v=>!blank(v))),get:(r,k)=>r.raw[ix[k]]??""};
 }
 const oh=["S. No.","Item Name","Proposed Item Name","Use Proposed?","Selected Nomenclature","Dimesnions","Tracking Type","Item Group","Rack","Shelve","Qty","Bin/Box","Bin/Box No.","Count_date","Item Code (existing ref / draft proposal)","Batch No. (proposed)","Item Identity Status","Previous Corporate Master Reference"];
 const o=read(retained,"Opening",oh),l=read(live,"Opening",oh);
 if(!same(o.header,l.header))throw Error("OPENING_HEADER_DRIFT");
 const liveRows=new Map(l.rows.map(r=>[r.row,r])),opening=new Map();
 let qty=0,batches=0,serials=0,retainedNames=0,liveNames=0,missingDate=0;
 for(const r of o.rows){
  const g=k=>o.get(r,k),ref=r.source,other=liveRows.get(r.row),sourceNo=g("S. No."),code=str(g("Item Code (existing ref / draft proposal)")),tracking=str(g("Tracking Type")).toUpperCase(),q=g("Qty"),identity=g("Item Identity Status");
  if(blank(sourceNo)||blank(g("Item Name"))){error(ref,"INCOMPLETE_OPENING_ROW");continue;}
  if(!other)error(ref,"LIVE_ROW_MISSING");
  const changes=[];if(other)for(let j=0;j<o.header.length;j++)if(!same(r.raw[j],other.raw[j]))changes.push({column:j+1,header:o.header[j],before:r.raw[j],after:other.raw[j]});
  const approved=other&&changes.every(x=>x.column===4||x.column===5)&&typeof l.get(other,"Use Proposed?")==="boolean"&&l.get(other,"Selected Nomenclature")===(l.get(other,"Use Proposed?")?l.get(other,"Proposed Item Name"):l.get(other,"Item Name"));
  if(changes.length){delta.push({source:ref,fields:changes,disposition:approved?"DISPLAY_NAME_ONLY":"HOLD"});if(!approved)error(ref,"NON_NAMING_OR_INCONSISTENT_DELTA");}
  const selected=changes.length&&approved?l.get(other,"Selected Nomenclature"):g("Selected Nomenclature");
  retainedNames+=Number(g("Use Proposed?")===true);liveNames+=Number(!!other&&l.get(other,"Use Proposed?")===true);
  if(tracking==="BATCH")batches++;else if(tracking==="SERIAL")serials++;else error(ref,"INVALID_TRACKING");
  if(typeof q==="number"&&Number.isFinite(q))qty+=q;else reject(ref,"QUANTITY_INVALID_OR_MISSING");
  if(tracking==="SERIAL"&&(!Number.isInteger(q)||q<1))reject(ref,"SERIAL_QUANTITY_HOLD");
  if(blank(g("Count_date"))){missingDate++;reject(ref,"COUNT_DATE_MISSING");}
  reject(ref,"IDENTITY_UOM_SCOPE_NOT_ADMITTED");if(!code)reject(ref,"ITEM_CODE_MISSING");
  opening.set(r.row,{sourceNo,code,tracking,q});
  tables.item_identity_candidates.push({source:ref,source_no:sourceNo,item_code:code,control_type_candidate:tracking,uom:"",...scope(),identity_status:identity,disposition:"UNAPPROVED_CANDIDATE"});
  tables.item_attributes.push({source:ref,item_code:code,original_name:g("Item Name"),proposed_name:g("Proposed Item Name"),retained_display_name:g("Selected Nomenclature"),selected_display_name:selected,dimensions:g("Dimesnions"),item_group:g("Item Group"),disposition:"DISPLAY_NAME_ONLY_NOT_IDENTITY_APPROVAL"});
  tables.item_version_candidates.push({source:ref,item_code:code,previous_reference:g("Previous Corporate Master Reference"),version_code:"",disposition:"VERSION_UNVERIFIED"});
  tables.location_candidates.push({source:ref,rack:g("Rack"),shelf:g("Shelve"),position_1:r.raw[11],position_2:r.raw[12],bin_box:g("Bin/Box"),bin_box_no:g("Bin/Box No."),location_id:"",...scope(),disposition:"LOCATION_UNVERIFIED"});
  tables.opening_stock_observation_candidates.push({source:ref,item_code:code,control_type_candidate:tracking,observed_quantity:q,count_date_raw:g("Count_date"),proposed_batch:g("Batch No. (proposed)"),uom:"",version_code:"",location_id:"",observer_employee_id:"",evidence_reference:"",...scope(),disposition:"HOLD_OBSERVATION_NOT_STOCK"});
 }
 for(const r of l.rows)if(!opening.has(r.row))error(r.source,"LIVE_ADDITION_OR_ROW_SHIFT");
 const batch=read(retained,"Batch Tracked Items",["Opening Row","S. No.","Item Code (existing / draft)","Batch No. (proposed)","Mapping Status","Opening Qty","Tracking Type","Legacy Printed QR (NOT batch number)","Label Assignment Status"]);
 const batchRows=new Set(),aliases=new Map(),proposals=new Set(),unitsByOpening=new Map(),heldOpening=new Set();
 function alias(id,row,kind,serialNo,ref){if(!id)return;if(aliases.has(id))error(ref,"GLOBAL_DUPLICATE_LEGACY_QR");aliases.set(id,{row,kind,serialNo});}
 for(const r of batch.rows){const g=k=>batch.get(r,k),row=Number(g("Opening Row")),p=opening.get(row),code=str(g("Item Code (existing / draft)")),batchNo=str(g("Batch No. (proposed)")),legacy=str(g("Legacy Printed QR (NOT batch number)"));
  if(batchRows.has(row))error(r.source,"DUPLICATE_BATCH_SOURCE_ROW");batchRows.add(row);
  if(!p||p.tracking!=="BATCH"||!same(p.q,g("Opening Qty"))||str(p.sourceNo)!==str(g("S. No."))||p.code!==code)error(r.source,"BATCH_OPENING_MISMATCH");
  if(batchNo&&batchNo!==code+"-B003")error(r.source,"BATCH_FORMAT_MISMATCH");
  if(!batchNo)reject(r.source,"BATCH_IDENTITY_UNRESOLVED");alias(legacy,row,"BATCH","",r.source);
  tables.batch_references.push({source:r.source,opening_row:row,item_code:code,proposed_batch:batchNo,observed_quantity:g("Opening Qty"),legacy_qr:legacy,source_mapping:g("Mapping Status"),label_status:g("Label Assignment Status"),disposition:"HOLD_NOT_ISSUED"});
 }
 for(const [row,p] of opening)if(p.tracking==="BATCH"&&!batchRows.has(row))error("Opening!"+row,"MISSING_BATCH_ROW");
 const sr=read(retained,"Serial Tracked Items",["Item Code (existing / draft)","Batch No. (proposed)","Proposed Item Serial No. (NOT issued)","Legacy QR / Sticker ID","Unit Qty","Looks/Packaging","Working Condition","Manufacturer Serial No.","Inspection Remarks","Checked By","Checked On","Opening Row at Build","Opening S. No.","Unit Index","Location (source)","Record Status","Earlier Item Serial Pattern","Identity / Mapping Status","Unresolved Source Qty (HOLD only)","Count Date (source)"]);
 let unchecked=0,missingLocation=0;
 for(const r of sr.rows){const g=k=>sr.get(r,k),row=Number(g("Opening Row at Build")),p=opening.get(row),legacy=str(g("Legacy QR / Sticker ID")),serial=str(g("Proposed Item Serial No. (NOT issued)")),code=str(g("Item Code (existing / draft)")),status=str(g("Record Status")),data={source:r.source,opening_row:row,item_code:code,legacy_qr:legacy,proposed_serial:serial,prior_pattern:g("Earlier Item Serial Pattern"),source_status:status,source_identity_status:g("Identity / Mapping Status")};
  if(!p||p.code!==code||str(p.sourceNo)!==str(g("Opening S. No.")))error(r.source,"SERIAL_OPENING_MISMATCH");
  if(status.startsWith("RETIRED")){if(serial||g("Unit Qty")!==0||!legacy)error(r.source,"RETIRED_SERIAL_REUSE_OR_NONZERO");alias(legacy,row,"RETIRED","",r.source);tables.retired_serials.push({...data,disposition:"PERMANENT_NON_REUSE"});continue;}
  if(status.startsWith("HOLD")){if(legacy||serial)error(r.source,"QUANTITY_HOLD_HAS_IDENTITY");heldOpening.add(row);tables.serial_quantity_holds.push({...data,unresolved_quantity:g("Unresolved Source Qty (HOLD only)"),disposition:"HOLD"});continue;}
  if(!p||p.tracking!=="SERIAL"||g("Unit Qty")!==1||!legacy||!code||!serial.startsWith(code+"-S")||!/^[0-9]{4,}$/.test(serial.slice(code.length+2)))error(r.source,"INVALID_SERIAL_CANDIDATE");
  if(proposals.has(serial))error(r.source,"GLOBAL_DUPLICATE_PROPOSED_SERIAL");proposals.add(serial);alias(legacy,row,"SERIAL",serial,r.source);
  unitsByOpening.set(row,(unitsByOpening.get(row)||0)+1);
  if(blank(g("Checked By"))||blank(g("Checked On"))||g("Looks/Packaging")==="Not checked"||g("Working Condition")==="Not tested")unchecked++;
  if(blank(g("Location (source)")))missingLocation++;
  tables.serial_candidates.push({...data,proposed_batch:g("Batch No. (proposed)"),unit_qty:g("Unit Qty"),unit_index:g("Unit Index"),manufacturer_serial:g("Manufacturer Serial No."),location_source:g("Location (source)"),disposition:"UNISSUED_CANDIDATE"});
  tables.inspection_observations.push({source:r.source,opening_row:row,legacy_qr:legacy,proposed_serial:serial,looks_packaging:g("Looks/Packaging"),working_condition:g("Working Condition"),manufacturer_serial:g("Manufacturer Serial No."),remarks:g("Inspection Remarks"),checker:g("Checked By"),check_date:g("Checked On"),location_source:g("Location (source)"),count_date_raw:g("Count Date (source)"),disposition:"NOT_CERTIFIED"});
 }
 for(const [row,p] of opening)if(p.tracking==="SERIAL"){if(Number.isInteger(p.q)&&p.q>0){if((unitsByOpening.get(row)||0)!==p.q)error("Opening!"+row,"SERIAL_COUNT_RECONCILIATION");}else if(!heldOpening.has(row))error("Opening!"+row,"MISSING_SERIAL_QUANTITY_HOLD");}
 const qr=read(retained,"Batch 3 Sticker Register",["Sticker / QR ID","Opening Row","Opening S. No.","Validation State"]),qrSeen=new Set();
 for(const r of qr.rows){const g=k=>qr.get(r,k),id=str(g("Sticker / QR ID")),row=Number(g("Opening Row")),a=aliases.get(id),p=opening.get(row);
  if(!id||qrSeen.has(id))error(r.source,"STICKER_ID_BLANK_OR_DUPLICATE");qrSeen.add(id);
  if(!p||str(p.sourceNo)!==str(g("Opening S. No."))||!a||a.row!==row)error(r.source,"STICKER_REFERENCE_UNRESOLVED");
  tables.historical_qr_aliases.push({source:r.source,opening_row:row,legacy_qr:id,proposed_serial:a?.serialNo||"",lifecycle:a?.kind||"UNRESOLVED",validation_state:g("Validation State"),disposition:"HISTORICAL_NOT_NEW_ISSUANCE"});
 }
 for(const id of aliases.keys())if(!qrSeen.has(id))error("QR:"+id,"REGISTER_ALIAS_MISSING");
 const mv=read(retained,"B3 Movement Validation 25Nov",["Register","Source row","Raw qty","Disposition"]);let gap=0;
 for(const r of mv.rows){const g=k=>mv.get(r,k);if(typeof g("Raw qty")==="number")gap+=g("Raw qty");tables.movement_holds.push({source:r.source,register:g("Register"),register_row:g("Source row"),raw_quantity:g("Raw qty"),source_disposition:g("Disposition"),original_values:r.raw,disposition:"HOLD_NOT_POSTED"});}
 for(const [sheet,key] of [["SFG Register","sfg_design_references"],["SFG Components","sfg_component_references"]])tables[key]=read(retained,sheet,[]).rows.map(r=>({source:r.source,original_values:r.raw,disposition:"DESIGN_REFERENCE_NOT_BUILT_STOCK"}));
 return{state:"HOLD_NOT_IMPORT_AUTHORIZED",tables,delta,rejected,violations,summary:{opening_rows:opening.size,batch_tracked_rows:batches,serial_tracked_rows:serials,mixed_uom_quantity:qty,retained_display_names:retainedNames,live_display_names:liveNames,changed_opening_rows:delta.length,missing_count_dates:missingDate,serial_candidates:tables.serial_candidates.length,retired_serials:tables.retired_serials.length,serial_quantity_holds:tables.serial_quantity_holds.length,historical_aliases:tables.historical_qr_aliases.length,unchecked_serials:unchecked,serials_without_location:missingLocation,movement_holds:tables.movement_holds.length,mixed_uom_movement_gap:gap,admitted_items:0,admitted_stock:0}};
}
function test(stage,specs){
 const a=(x,m)=>{if(!x)throw Error("SELF_TEST:"+m)};
 const r={},l={},copy=x=>JSON.parse(JSON.stringify(x));
 const put=(name,header,rows)=>{r[name]=[...Array.from({length:specs[name][0]-1},()=>[]),header,...rows];};
 const header=Array(53).fill("");const pairs={0:"S. No.",1:"Item Name",2:"Proposed Item Name",3:"Use Proposed?",4:"Selected Nomenclature",5:"Dimesnions",7:"Tracking Type",8:"Item Group",9:"Rack",10:"Shelve",13:"Qty",14:"Bin/Box",15:"Bin/Box No.",20:"Count_date",42:"Item Code (existing ref / draft proposal)",43:"Batch No. (proposed)",46:"Item Identity Status",52:"Previous Corporate Master Reference"};
 for(const [i,k] of Object.entries(pairs))header[i]=k;
 function mk(n,name,code,track,q){const row=Array(53).fill("");Object.assign(row,{0:n,1:name,2:name+" revised",3:false,4:name,7:track,13:q,42:code,43:code+"-B003",46:"DRAFT"});return row;}
 put("Opening",header,[mk(1,"Part","PART-01","Batch",4),mk(2,"Unit","UNIT-01","Serial",1)]);
 l.Opening=copy(r.Opening);l.Opening[1][3]=true;l.Opening[1][4]="Part revised";
 put("Batch Tracked Items",["Opening Row","S. No.","Item Code (existing / draft)","Batch No. (proposed)","Mapping Status","Opening Qty","Tracking Type","Legacy Printed QR (NOT batch number)","Label Assignment Status"],[[2,1,"PART-01","PART-01-B003","DRAFT",4,"Batch","OLD-B","VERIFY"]]);
 put("Serial Tracked Items",["Item Code (existing / draft)","Batch No. (proposed)","Proposed Item Serial No. (NOT issued)","Legacy QR / Sticker ID","Unit Qty","Looks/Packaging","Working Condition","Manufacturer Serial No.","Inspection Remarks","Checked By","Checked On","Opening Row at Build","Opening S. No.","Unit Index","Location (source)","Record Status","Earlier Item Serial Pattern","Identity / Mapping Status","Unresolved Source Qty (HOLD only)","Count Date (source)"],[["UNIT-01","UNIT-01-B003","UNIT-01-S0001","OLD-S",1,"Not checked","Not tested","","","","",3,2,1,"","PENDING","","DRAFT"],["PART-01","PART-01-B003","","OLD-R",0,"Not checked","Not tested","","","","",2,1,1,"","RETIRED","","DRAFT"]]);
 put("Batch 3 Sticker Register",["Sticker / QR ID","Opening Row","Opening S. No.","Validation State"],[["OLD-B",2,1,"VERIFY"],["OLD-S",3,2,"VERIFY"],["OLD-R",2,1,"RETIRED"]]);
 put("B3 Movement Validation 25Nov",["Register","Source row","Raw qty","Disposition"],[["Out",12,2,"HOLD"]]);put("SFG Register",["Status","SFG Item Code"],[["DESIGN","SFG-CW"]]);put("SFG Components",["Record Class","SFG Code"],[["DESIGN","SFG-CW"]]);
 const x=stage(r,l,specs);a(x.violations.length===0,JSON.stringify(x.violations));a(x.summary.opening_rows===2,"opening");a(x.summary.serial_candidates===1&&x.summary.retired_serials===1,"serial states");a(x.delta.length===1&&x.delta[0].disposition==="DISPLAY_NAME_ONLY","delta");a(x.tables.item_attributes[0].selected_display_name==="Part revised","display only");a(x.summary.admitted_stock===0&&x.summary.admitted_items===0,"no admission");a(x.tables.retired_serials[0].disposition==="PERMANENT_NON_REUSE","retirement");a(x.tables.movement_holds[0].disposition==="HOLD_NOT_POSTED","movement");
 const dup=copy(r);dup["Serial Tracked Items"].push(copy(dup["Serial Tracked Items"][3]));a(stage(dup,l,specs).violations.some(v=>v.reason==="GLOBAL_DUPLICATE_PROPOSED_SERIAL"),"duplicate");
 const change=copy(l);change.Opening[1][13]=99;a(stage(r,change,specs).violations.some(v=>v.reason==="NON_NAMING_OR_INCONSISTENT_DELTA"),"quantity delta");
 const retired=copy(r);retired["Serial Tracked Items"][4][2]="PART-01-S0001";a(stage(retired,l,specs).violations.some(v=>v.reason==="RETIRED_SERIAL_REUSE_OR_NONZERO"),"retired reuse");
 return{state:"PASS",assertions:11};
}

const sha=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
const extractor=join(dirname(fileURLToPath(import.meta.url)),'hft_b3_extract_xlsx.py');
function extract(path){
 const r=spawnSync('python3',[extractor,resolve(path)],{encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});
 if(r.status!==0)throw Error('EXTRACTION_FAILED:'+String(r.stderr||r.error||r.status).slice(0,500));
 return JSON.parse(r.stdout);
}
function main(args){
 if(args.length===1&&args[0]==='--self-test'){console.log(json(test(stage,specs)));return;}
 if(args.length!==8)throw Error('Usage: --retained retained.xlsx --live live.xlsx --live-revision observed_revision --output new_private_directory');
 const opts={};for(let i=0;i<args.length;i+=2){if(!['--retained','--live','--live-revision','--output'].includes(args[i])||Object.hasOwn(opts,args[i]))throw Error('INVALID_ARGUMENT');opts[args[i]]=args[i+1];}
 if(!/^[0-9]+$/.test(opts['--live-revision']))throw Error('OBSERVED_REVISION_REQUIRED');
 const output=resolve(opts['--output']);if(existsSync(output))throw Error('OUTPUT_ALREADY_EXISTS');
 const r=extract(opts['--retained']),l=extract(opts['--live']);if(r.sha256===l.sha256)throw Error('SOURCES_MUST_BE_DISTINCT');
 const x=stage(r.sheets,l.sheets,specs),files={},tmp=mkdtempSync(join(dirname(output),'.'+basename(output)+'-'));
 try{
  const put=(name,value)=>{const b=Buffer.from(json(value));writeFileSync(join(tmp,name),b,{flag:'wx',mode:0o600});files[name]={sha256:sha(b),bytes:b.length};};
  put('retained_effective_values.PRIVATE.json',r.sheets);put('live_effective_values.PRIVATE.json',l.sheets);
  put('nomenclature_delta.json',{observed_revision:opts['--live-revision'],changes:x.delta});
  put('rejected_records.json',x.rejected);put('structural_violations.json',x.violations);put('formula_cache_exceptions.json',{retained:r.cache_exceptions,live:l.cache_exceptions});
  const counts={};for(const [name,rows] of Object.entries(x.tables)){counts[name]=rows.length;for(let i=0;i<Math.max(1,rows.length);i+=2000)put(name+'.part-'+String(i/2000+1).padStart(3,'0')+'.json',rows.slice(i,i+2000));}
  const report={...x.summary,state:x.state,structural_violations:x.violations.length,cache_exceptions:r.cache_exceptions.length+l.cache_exceptions.length,record_counts:counts,admitted_rows:0};
  put('validation-report.json',report);
  const manifest={schema:'HFT_B3_OFFLINE_STAGE_MANIFEST_V1',state:x.state,sources:{retained:{sha256:r.sha256,bytes:r.bytes},live:{sha256:l.sha256,bytes:l.bytes,observed_revision:opts['--live-revision']}},revision_basis:'operator-provided provider revision; not authenticated by XLSX',tool_sha256:sha(readFileSync(fileURLToPath(import.meta.url))),extractor_sha256:sha(readFileSync(extractor)),partition_limit:2000,files};
  writeFileSync(join(tmp,'manifest.json'),json(manifest),{flag:'wx',mode:0o600});
  for(const [name,expected] of Object.entries(files))if(sha(readFileSync(join(tmp,name)))!==expected.sha256)throw Error('OUTPUT_HASH_MISMATCH');
  if(existsSync(output))throw Error('OUTPUT_CONCURRENTLY_CREATED');
  renameSync(tmp,output);console.log(json({...report,manifest_sha256:sha(readFileSync(join(output,'manifest.json')))}));
  if(report.structural_violations||report.cache_exceptions)process.exitCode=2;
 }catch(e){rmSync(tmp,{recursive:true,force:true});throw e;}
}
try{main(process.argv.slice(2));}catch(e){console.error(String(e.message||e));process.exitCode=1;}
