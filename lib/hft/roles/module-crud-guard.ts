/** All module operations must check an authenticated effective grant in the
 * same admitted role-store transaction as their guarded callback. This is a
 * source contract, not an installed Draft/P3/Stores module CRUD endpoint.
 * In particular the owner's separate Draft-only pilot remains independent.
 */
import {modulePermission,requirePermission,requireScope,sameScope,deny,
 type CrudAction,type CrudModule,type Principal,type Scope} from './role-assignment.ts';
import {type RoleStore,type RoleTransaction,type SessionIdentity} from './role-service.ts';

export async function withAuthorizedModuleCrud<T>(
 store:RoleStore,session:SessionIdentity,scope:Scope,
 module:CrudModule,action:CrudAction,
 operation:(transaction:RoleTransaction,actor:Principal)=>Promise<T>
):Promise<T>{
 const permission=modulePermission(module,action);
 return store.write(scope,async tx=>{
  const actor=await tx.principal(session);
  requireScope(actor,scope,new Date().toISOString());
  if(!(await tx.scopes(actor)).some(x=>sameScope(x,scope)))
   deny('ROLE_ACTOR_OR_SCOPE_DENIED');
  const employee=await tx.employee(scope,actor.employeeId);
  if(!employee.active||employee.personId!==actor.personId)
   deny('ROLE_ACTOR_EMPLOYEE_NOT_ACTIVE');
  requirePermission(actor,await tx.assignment(scope,actor.employeeId),
   permission,scope,new Date().toISOString());
  return operation(tx,actor);
 });
}
