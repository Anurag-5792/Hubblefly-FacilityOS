'use client';
/** HFT-native Employee directory. Source patterns: SBAI/RPTO/Survey only.
 * No donor API, HR private fields, access grant, or direct Employee UPDATE.
 */
import {useMemo,useState} from 'react';
import {readEmployeeDirectory,filterEmployeeDirectory,
 type EmployeeMasterRow,type EmployeeFilter,type EmployeeScope}
 from './employee-view-model.ts';
import styles from './reuse-prep.module.css';

export function EmployeeMasterDirectory(props:Readonly<{
 rawP3Records:readonly unknown[];
 requestedScope:EmployeeScope;
 verifiedReadResponse:boolean;
 mayRequestEdit:boolean;
 onRequestEdit:(employee:EmployeeMasterRow)=>void;
}>){
 const [search,setSearch]=useState('');
 const [department,setDepartment]=useState('');
 const [designation,setDesignation]=useState('');
 const [status,setStatus]=useState<EmployeeFilter['status']>('ALL');
 const validated=useMemo(()=>{
  if(!props.verifiedReadResponse)
   return {rows:[] as readonly EmployeeMasterRow[],error:'SIGNED_P3_EMPLOYEE_LIST_REQUIRED'};
  try{return {rows:readEmployeeDirectory(props.rawP3Records,props.requestedScope),error:''};}
  catch{return {rows:[] as readonly EmployeeMasterRow[],error:'P3_EMPLOYEE_RESPONSE_SCOPE_OR_FORMAT_DENIED'};}
 },[props.verifiedReadResponse,props.rawP3Records,props.requestedScope]);
 const departments=[...new Set(validated.rows.map(x=>x.department))].sort();
 const designations=[...new Set(validated.rows.map(x=>x.designation))].sort();
 const visible=filterEmployeeDirectory(validated.rows,{search,department,designation,status});
 return <section className={styles.panel} aria-label="Employee Master directory">
  <div className={styles.header}>
   <div><p className={styles.eyebrow}>FacilityOS · HFT P3</p>
    <h2>Employee directory</h2>
    <p>Lists only verified HFT Employee Master fields returned by the existing scoped P3 reader.</p>
   </div><span className={styles.neutralStatus}>
    {validated.error?'READ UNAVAILABLE':'SCOPED P3 LIST'}
   </span>
  </div>
  <div className={styles.filters}>
   <label>Search employee<input value={search} onChange={e=>setSearch(e.target.value)}
    placeholder="Employee ID or name" maxLength={80}/></label>
   <label>Department<select value={department} onChange={e=>setDepartment(e.target.value)}>
    <option value="">All departments</option>
    {departments.map(value=><option value={value} key={value}>{value}</option>)}
   </select></label>
   <label>Designation<select value={designation} onChange={e=>setDesignation(e.target.value)}>
    <option value="">All designations</option>
    {designations.map(value=><option value={value} key={value}>{value}</option>)}
   </select></label>
   <label>Employee status<select value={status}
     onChange={e=>setStatus(e.target.value as EmployeeFilter['status'])}>
    <option value="ALL">All</option><option value="ACTIVE">Active</option>
    <option value="INACTIVE">Inactive</option>
   </select></label>
  </div>
  <p role="status" className={styles.note}>
   {validated.error||String(visible.length)+' scoped employee records in view.'}
  </p>
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Employee ID</th><th>Full name</th><th>Department</th>
    <th>Designation</th><th>Status</th><th>Action</th></tr></thead>
   <tbody>{visible.map(row=><tr key={row.recordId}>
    <td>{row.recordId}</td><td>{row.fullName}</td><td>{row.department}</td>
    <td>{row.designation}</td><td>{row.active?'Active':'Inactive'}</td>
    <td><button type="button"
     disabled={!props.mayRequestEdit||!props.verifiedReadResponse||!!validated.error}
     onClick={()=>props.onRequestEdit(row)}>Request edit</button></td>
   </tr>)}</tbody>
  </table></div>
  <p className={styles.footnote}>Department and designation are descriptive HR data,
   not application roles. The existing P3 edit-request path requires signed
   identity, exact revision, independent approval and database audit.</p>
 </section>;
}
