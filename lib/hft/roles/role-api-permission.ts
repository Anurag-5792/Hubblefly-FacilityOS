/** Fresh eligibility AND operation-bound role authorization for protected APIs.
 * Business roles never replace P0/P2/P3 checks or confer PostgreSQL membership.
 */
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
import {type Scope,type Permission} from './role-assignment.ts';
import {openRoleBackendPool,assertRoleConnection,
 assertRoleBackendProfile,type RoleBackendEnv,type RoleDatabaseIdentity} from './role-backend.ts';
import {PostgresRoleStore} from './role-postgres.ts';
import {requireCurrentBusinessPermission} from './role-service.ts';
import {bindRoleOperationFence} from './role-operation-fence.ts';
import type {PgPool} from '../persistence/isolated-pg-transaction.ts';
export type RoleOperationBinding=Readonly<{bind<T extends PgPool>(pool:T):T}>;
export async function requireApiBusinessRole(env:RoleBackendEnv,
 signedActor:VerifiedRequestOperator,scope:Scope,
 permission:Permission):Promise<RoleOperationBinding>{
 assertRoleBackendProfile(env);
 assertVerifiedRequestOperator(signedActor,scope);
 // Advisory locks are database-local. Separate projects/branches/databases or
 // endpoints cannot pretend to share this ordering boundary.
 if(env.HFT_ROLE_RESOURCE_PROJECT!==env.HFT_STORES_RESOURCE_PROJECT||
  env.HFT_ROLE_RESOURCE_BRANCH!==env.HFT_STORES_RESOURCE_BRANCH||
  env.HFT_ROLE_PG_DATABASE!==env.HFT_STORES_APPROVED_DATABASE||
  env.HFT_ROLE_PG_DATABASE!==env.PGDATABASE||
  env.HFT_ROLE_PG_HOST!==env.PGHOST||env.HFT_ROLE_PG_PORT!==env.PGPORT)
  throw Error('ROLE_STOCK_FENCE_SAME_DATABASE_REQUIRED');
 const fresh=async()=>{
  assertVerifiedRequestOperator(signedActor,scope);
  const pool=openRoleBackendPool(env);
  try{
   let identity:RoleDatabaseIdentity|undefined;
   const store=new PostgresRoleStore(pool,async client=>{identity=await assertRoleConnection(client,env);});
   await requireCurrentBusinessPermission(store,signedActor,scope,permission);
   if(!identity)throw Error('ROLE_DATABASE_IDENTITY_NOT_VERIFIED');
   return identity;
  }finally{await pool.end();}
 };
 await fresh(); // Request-start denial is useful, but is NOT the operation fence.
 return {bind<T extends PgPool>(pool:T):T{
  return bindRoleOperationFence(pool,env.HFT_ROLE_PG_DATABASE!,fresh);
 }};
}
