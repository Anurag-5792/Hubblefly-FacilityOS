/** Fresh application-role authorization for protected HFT APIs.
 * Does not confer PostgreSQL login role membership or replace signed
 * transactional maker/checker/QC approval verification in P0/P2.
 */
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
import {type Scope,type Permission}
 from './role-assignment.ts';
import {openRoleBackendPool,assertRoleConnection,
 assertRoleBackendProfile,type RoleBackendEnv}
 from './role-backend.ts';
import {PostgresRoleStore} from './role-postgres.ts';
import {requireCurrentBusinessPermission} from './role-service.ts';

export async function requireApiBusinessRole(env:RoleBackendEnv,
 signedActor:VerifiedRequestOperator,scope:Scope,
 permission:Permission):Promise<void>{
 assertRoleBackendProfile(env);
 assertVerifiedRequestOperator(signedActor,scope);
 const pool=openRoleBackendPool(env);
 try{
  const store=new PostgresRoleStore(pool,client=>assertRoleConnection(client,env));
  await requireCurrentBusinessPermission(store,signedActor,scope,permission);
 }finally{
  await pool.end();
 }
}
