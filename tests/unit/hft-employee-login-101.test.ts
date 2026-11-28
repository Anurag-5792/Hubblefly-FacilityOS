import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAuthoritativeGoogleEmail,employeeAccess,type EmployeeLoginContext} from '../../lib/hft/live/employee-login-core.ts';
const at='2026-11-28T00:00:00.000Z';
const c:EmployeeLoginContext={legalEntityId:'HFT',employeeId:'EMP-A',personId:'PERSON-A',subject:'SUB-A',siteId:'SITE-A',fullName:'Synthetic employee',email:'employee@example.invalid',employeeVersion:1,loginVersion:2,assignments:[]};
test('Google mailbox authority is required independently of email_verified',()=>{
 assert.equal(assertAuthoritativeGoogleEmail('USER@GMAIL.COM',true,undefined),'user@gmail.com');
 assert.equal(assertAuthoritativeGoogleEmail('employee@example.invalid',true,'example.invalid'),'employee@example.invalid');
 for(const args of [['employee@example.invalid',true,undefined],['employee@example.invalid',true,'other.invalid'],['user@gmail.com',false,undefined]])assert.throws(()=>assertAuthoritativeGoogleEmail(args[0],args[1],args[2]),/HF101_/);
});
test('no default privileges and only fresh scoped persisted roles',()=>{
 assert.deepEqual(employeeAccess(c,at),{state:'PENDING_ROLE',scopes:[]});
 const assignment={employeeId:c.employeeId,scope:{legalEntityId:c.legalEntityId,siteId:c.siteId,warehouseId:'WH-A'},revision:1,revokedFrom:null,periods:[{from:at,to:null,roles:['VIEWER' as const]}]};
 assert.deepEqual(employeeAccess({...c,assignments:[assignment]},at),{state:'ROLE_ASSIGNED',scopes:[{warehouseId:'WH-A',permissions:['stock.read']}]});
 assert.deepEqual(employeeAccess({...c,assignments:[{...assignment,periods:[]}]},at),{state:'PENDING_ROLE',scopes:[]});
 assert.throws(()=>employeeAccess({...c,assignments:[{...assignment,scope:{...assignment.scope,siteId:'OTHER'}}]},at),/SCOPE_DENIED/);
});
