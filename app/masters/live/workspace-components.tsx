import type {ReactNode} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import logo from '../../assets/hubblefly-official-logo.png';
import {LIVE_KINDS,type LiveKind,type LiveRecord} from '../../../lib/hft/live/live-contract.ts';
import s from './workspace.module.css';

export const meta:Record<LiveKind,{plural:string;singular:string;id:string;desc:string;icon:string}>={
 EMPLOYEE:{plural:'Employees',singular:'employee',id:'Employee ID',desc:'Manage employee details, departments and designations.',icon:'people'},
 ITEM:{plural:'Items',singular:'item',id:'Item code',desc:'Maintain item identifiers, units of measure and tracking types.',icon:'box'},
 SUPPLIER:{plural:'Suppliers',singular:'supplier',id:'Supplier ID',desc:'Maintain supplier identities and registered legal names.',icon:'truck'},
 WAREHOUSE:{plural:'Warehouses',singular:'warehouse',id:'Warehouse ID',desc:'Manage warehouse records in your assigned scope.',icon:'warehouse'},
 LOCATION:{plural:'Locations',singular:'location',id:'Location ID',desc:'Maintain location references and their parent locations.',icon:'pin'},
 SITE:{plural:'Sites',singular:'site',id:'Site ID',desc:'Manage site identifiers and names.',icon:'site'}
};
const paths:Record<string,string>={
 people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M17 3.13a4 4 0 0 1 0 7.75',
 box:'M12 3l9 5-9 5-9-5 9-5 M3 8v8l9 5 9-5V8 M12 13v8 M7.5 5.5l9 5',
 truck:'M2 5h13v12H2z M15 9h4l3 4v4h-7 M7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 warehouse:'M3 21V8l9-5 9 5v13 M7 21V11h10v10 M7 15h10 M7 18h10 M2 21h20',
 pin:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 site:'M3 21h18 M5 21V3h10v18 M15 10h4v11 M8 7h4 M8 11h4 M8 15h4',
 lock:'M5 10h14v11H5z M8 10V7a4 4 0 1 1 8 0v3 M12 14v3',
 plus:'M12 5v14 M5 12h14',search:'M19 19l3 3 M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16',
 refresh:'M20 11a8 8 0 1 0-2 6 M20 3v8h-8',chevron:'M9 18l6-6-6-6',
 close:'M6 6l12 12 M18 6 6 18',check:'M5 12l4 4L19 6',
 logout:'M10 4H4v16h6 M10 12h11 M17 8l4 4-4 4',
 history:'M3 12a9 9 0 1 0 3-6.7 M3 3v6h6 M12 7v5l3 2'
};
export function Icon({name}:{name:string}){return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
 fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.box}/></svg>;}

export function CorporateBrand({large=false}:{large?:boolean}){
 return <div className={s.corporateBrand+(large?' '+s.corporateLarge:'')}>
  <Image src={logo} alt="Hubblefly corporate logo" unoptimized priority className={s.corporateLogo}/>
  <span className={s.productName}>HFT-OS</span><span className={s.companyName}>Hubblefly Technologies Limited</span>
 </div>;
}
export function MasterNavigation({kind,ready,disabled,onChange}:{kind:LiveKind;ready:boolean;disabled:boolean;onChange:(kind:LiveKind)=>void}){
 return <aside className={s.sidebar}>
  <CorporateBrand/>
  {ready&&<><div className={s.sideCaption}>MASTER DATA</div>
   <nav className={s.navigation} aria-label="Master data">
    {LIVE_KINDS.map(k=><button key={k} type="button" aria-pressed={kind===k} aria-current={kind===k?'page':undefined}
     className={kind===k?s.navSelected:s.navButton} disabled={disabled}
     onClick={()=>onChange(k)}><Icon name={meta[k].icon}/><span>{meta[k].plural}</span></button>)}
   </nav></>}
  <nav className={s.moduleNavigation} aria-label="Application navigation">
   {disabled&&ready?<span className={s.moduleDisabled}>Resolve the current operation before leaving.</span>:<Link href="/" className={s.navButton}><Icon name="chevron"/> Application dashboard</Link>}
  </nav>
  <div className={s.sidebarBottom}><Icon name="lock"/><div><strong>Assigned access</strong><span>Protected master data</span></div></div>
 </aside>;
}
export const trackingLabel=(value:string)=>(({NONE:'No tracking',BATCH:'Batch tracked',SERIAL:'Serial tracked'} as Record<string,string>)[value]||value);
const columnMap:Record<LiveKind,readonly {field:string;label:string}[]>={
 EMPLOYEE:[{field:'department',label:'Department'},{field:'designation',label:'Designation'}],
 ITEM:[{field:'uom',label:'UOM'},{field:'controlType',label:'Tracking type'}],
 SUPPLIER:[],WAREHOUSE:[],SITE:[],LOCATION:[{field:'parentLocationId',label:'Parent location'}]
};
function recordTitle(r:LiveRecord){return r.values.fullName||r.values.legalName||r.values.name||r.values.siteName||r.recordId;}
export function MasterDirectoryTable({kind,records,locked,onOpen}:{kind:LiveKind;records:readonly LiveRecord[];locked:boolean;onOpen:(row:LiveRecord)=>void}){
 return <div className={s.tableWrap}><table className={s.table}><thead><tr>
  <th scope="col">{kind==='ITEM'||kind==='LOCATION'?meta[kind].id:'Name / ID'}</th>
  {columnMap[kind].map(c=><th scope="col" key={c.field}>{c.label}</th>)}
  <th scope="col">Status</th><th scope="col">Revision</th><th scope="col" className={s.right}>Action</th></tr></thead>
  <tbody>{records.map(r=><tr key={r.recordId}>
   <td className={s.nameCell}><div className={s.recordName}><span className={s.avatar}><Icon name={meta[kind].icon}/></span><div><strong>{recordTitle(r)}</strong>{recordTitle(r)!==r.recordId&&<small>{r.recordId}</small>}</div></div></td>
   {columnMap[kind].map(c=><td key={c.field} data-label={c.label}>{c.field==='controlType'?trackingLabel(r.values[c.field]):r.values[c.field]||'None'}</td>)}
   <td data-label="Status"><span className={s.statusPill+(r.deleted?' '+s.retired:'')}>{r.deleted?'Retired':'Recorded'}</span></td>
   <td data-label="Revision" className={s.revision}>v{r.revision}</td>
   <td className={s.actionCell}><button type="button" className={s.textButton} aria-label={(r.deleted?'View ':'Open ')+r.recordId} disabled={locked} onClick={()=>onOpen(r)}>{r.deleted?'View':'Open'} <Icon name="chevron"/></button></td>
  </tr>)}</tbody></table></div>;
}
export function FieldSection({title,description,children}:{title:string;description?:string;children:ReactNode}){
 return <section className={s.formSection}><h3>{title}</h3>{description&&<p className={s.fieldHint}>{description}</p>}{children}</section>;
}

export type SummaryFilter='all'|'recorded'|'retired'|'revised'|'serial'|'batch'|'root'|'child';
export function summaryMatches(r:LiveRecord,filter:SummaryFilter):boolean{
 switch(filter){
 case 'recorded':return !r.deleted;
 case 'retired':return r.deleted;
 case 'revised':return r.revision>1;
 case 'serial':return !r.deleted&&r.values.controlType==='SERIAL';
 case 'batch':return !r.deleted&&r.values.controlType==='BATCH';
 case 'root':return !r.deleted&&!r.values.parentLocationId;
 case 'child':return !r.deleted&&!!r.values.parentLocationId;
 default:return true;
 }
}
export function DirectorySummary({kind,records,complete,ready,received,selected,disabled,onSelect}:{
 kind:LiveKind;records:readonly LiveRecord[];complete:boolean;ready:boolean;received:string;
 selected:SummaryFilter;disabled:boolean;onSelect:(filter:SummaryFilter)=>void
}){
 const common:{key:SummaryFilter;label:string;icon:string}[]=[{key:'all',label:'Total '+meta[kind].plural.toLowerCase(),icon:meta[kind].icon},{key:'recorded',label:'Recorded',icon:'check'}];
 const cards=kind==='ITEM'?[...common,{key:'serial' as const,label:'Serial tracked',icon:'box'},{key:'batch' as const,label:'Batch tracked',icon:'warehouse'}]:
 kind==='LOCATION'?[...common,{key:'root' as const,label:'Root references',icon:'site'},{key:'child' as const,label:'Child references',icon:'pin'}]:
 [...common,{key:'revised' as const,label:'Revised records',icon:'history'},{key:'retired' as const,label:'Retired',icon:'lock'}];
 return <section className={s.summarySection} aria-label="Directory summary">
  <div className={s.summaryCaption}><strong>Directory at a glance</strong><span>{!ready?'Awaiting verified list':complete?'Current scope and active search filters':'Full totals unavailable · capped or ID search'}{ready&&received?' · Read '+new Date(received).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''}</span></div>
  <div className={s.summaryGrid}>{cards.map(c=><button type="button" key={c.key} aria-pressed={selected===c.key}
   aria-label={'Summary filter: '+c.label} disabled={disabled||!ready} onClick={()=>onSelect(selected===c.key?'all':c.key)} className={s.summaryCard}>
   <span className={s.summaryIcon}><Icon name={c.icon}/></span><span>{c.label}</span><strong>{ready&&complete?records.filter(r=>summaryMatches(r,c.key)).length:'—'}</strong><small>{ready&&complete?'Filter directory':'Total not verified'}</small>
  </button>)}</div>
 </section>;
}
