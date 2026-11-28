/** Management exports from a freshly reverified requirements snapshot.
 * Never invent supply or a purchase quantity, and never export browser input.
 */
import {sameScope} from '../roles/role-assignment.ts';
import {parseQuantity} from '../domain/quantity.ts';
import type {RequirementsResult,RequirementsRow} from './requirements.ts';

const sections=['direct','grossLeaf','assemblies'] as const;
const sha=/^[0-9a-f]{64}$/;
const allowed=(v:unknown):v is RequirementsResult=>{
 if(!v||typeof v!=='object')return false;
 const r=v as RequirementsResult;
 return r.state==='REQUIREMENTS_VERIFIED'&&r.stockAdmitted===false&&r.readiness==='NOT_ASSESSABLE'&&
 r.capacity===null&&r.coverage===null&&!!r.scope&&!!r.scopeName&&!!r.model&&
 typeof r.sourceEpoch==='string'&&sha.test(r.sourceEpoch)&&r.sourceEpoch!=='0'.repeat(64)&&
 typeof r.model.evidenceSha256==='string'&&sha.test(r.model.evidenceSha256)&&r.model.evidenceSha256!=='0'.repeat(64)&&
 Number.isSafeInteger(r.units)&&r.units>=1&&r.units<=100000&&typeof r.asOf==='string'&&Number.isFinite(Date.parse(r.asOf))&&
 sections.every(k=>Array.isArray(r[k])&&r[k].length<=10000&&r[k].every(row=>row&&row.available===null&&row.shortage===null&&
  typeof row.itemCode==='string'&&typeof row.productVersion==='string'&&typeof row.uom==='string'&&typeof row.required==='string'));
};
/** Reject an epoch, model, revision, scope, quantity or row change. Only the
 * read timestamp may advance. A user must refresh before exporting drift. */
export function assertFreshRequirements(displayed:RequirementsResult,fresh:unknown):RequirementsResult{
 if(!allowed(displayed)||!allowed(fresh)||!sameScope(displayed.scope,fresh.scope)||
  displayed.units!==fresh.units||displayed.sourceEpoch!==fresh.sourceEpoch||
  JSON.stringify(displayed.scopeName)!==JSON.stringify(fresh.scopeName)||
  JSON.stringify(displayed.model)!==JSON.stringify(fresh.model)||
  Date.parse(fresh.asOf)<Date.parse(displayed.asOf)||
  sections.some(k=>JSON.stringify(displayed[k])!==JSON.stringify(fresh[k])))
  throw Error('MIS_REPORT_SOURCE_CHANGED');
 return fresh;
}
/** Quote every cell and neutralize spreadsheet formula prefixes (including
 * whitespace/control/fullwidth variants). Do not strip meaningful text. */
export function csvCell(v:string|number|null):string{
 let s=v===null?'NOT_ASSESSED':String(v);
 s=s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ');
 const normalized=s.normalize('NFKC');
 if(/^[\s\uFEFF]*[=+\-@]/u.test(normalized)||/^[\t\r\n]/.test(normalized))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function requirementsReportCsv(displayed:RequirementsResult,verified:unknown):string{
 const r=assertFreshRequirements(displayed,verified);
 const fields=['report_section','basis','company','site','warehouse','company_id','site_id','warehouse_id',
  'model','variant','model_id','revision','revision_id','approval_evidence_sha256','source_epoch','as_of_utc',
  'planned_units','item_code','item_version','uom','required_quantity','child_revision_id',
  'available_quantity','shortage_quantity','net_purchase_quantity','readiness'];
 const csv:string[]=[fields.map(csvCell).join(',')];
 const titles={direct:['DIRECT_BOM','Direct approved lines; do not add to gross explosion'],
  grossLeaf:['GROSS_LEAF','All assemblies assumed built; procurement review only, not net purchase demand'],
  assemblies:['ASSEMBLIES','Assembly demand; do not add to gross leaf quantities']} as const;
 for(const k of sections)for(const row of r[k]){
  if(parseQuantity(row.required)<=0n)throw Error('MIS_REPORT_QUANTITY_INVALID');
  const [section,basis]=titles[k];
  csv.push([section,basis,r.scopeName.companyName,r.scopeName.siteName,r.scopeName.warehouseName,
   r.scope.legalEntityId,r.scope.siteId,r.scope.warehouseId,r.model.name,r.model.variant,r.model.id,r.model.revision,
   r.model.revisionId,r.model.evidenceSha256,r.sourceEpoch,r.asOf,r.units,row.itemCode,row.productVersion,row.uom,row.required,
   row.childRevisionId??'COMPONENT',null,null,null,'NOT_ASSESSABLE'].map(csvCell).join(','));
 }
 return '\uFEFF'+csv.join('\r\n')+'\r\n';
}
export function procurementReview(r:RequirementsResult):readonly RequirementsRow[]{
 if(!allowed(r))throw Error('MIS_REPORT_SOURCE_INVALID');
 // Only leaf demand is displayed: assembly demand remains separately labeled.
 // No net purchase amount can be computed without eligible stock, reservations,
 // open purchase orders and approved replenishment policy.
 return r.grossLeaf;
}
