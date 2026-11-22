/** ROLE077-REVOCATION-03: the STOCK connection owns the shared transaction lock.
 * Role reads use the distinct role-only login and a fresh READ ONLY snapshot.
 * No cross-connection lease is trusted and no stock privilege is given to roles.
 */
import type {PgPool,PgQueryClient} from '../persistence/isolated-pg-transaction.ts';
import {ROLE_FENCE_KEYS} from './role-enforcement.ts';
import {deny} from './role-assignment.ts';
const bindings=new WeakMap<PgPool,Readonly<{database:string;fresh:()=>Promise<void>}>>();
export function bindRoleOperationFence<T extends PgPool>(pool:T,database:string,
 fresh:()=>Promise<void>):T{
 if(!database||bindings.has(pool))deny('ROLE_OPERATION_FENCE_REBIND_DENIED');
 bindings.set(pool,{database,fresh});return pool;
}
/** Called ONLY inside the existing protected transaction, before its callback.
 * Nonblocking acquisition: a competing revocation means denial, never a retry.
 * A revoke that committed after the request-start read is seen by fresh().
 * A revoke after this lock must wait until this SAME stock transaction ends.
 */
export async function requireBoundRoleOperationFence(pool:PgPool,client:PgQueryClient,
 database:string,readOnly:boolean):Promise<void>{
 const binding=bindings.get(pool);
 if(!binding||binding.database!==database)deny('ROLE_OPERATION_FENCE_NOT_ADMITTED');
 const r=await client.query<{acquired:boolean;db:string;isolation:string;read_only:string}>(
  `SELECT pg_catalog.pg_try_advisory_xact_lock_shared($1::integer,$2::integer) AS acquired,
   pg_catalog.current_database() AS db,
   pg_catalog.current_setting('transaction_isolation') AS isolation,
   pg_catalog.current_setting('transaction_read_only') AS read_only`,ROLE_FENCE_KEYS);
 const row=r.rows[0];
 if(r.rows.length!==1||row.acquired!==true||row.db!==database||
  row.isolation!==(readOnly?'repeatable read':'serializable')||
  row.read_only!==(readOnly?'on':'off'))deny('ROLE_OPERATION_FENCE_DENIED');
 // This is deliberately AFTER lock acquisition and AFTER the preliminary read.
 // The stock transaction's earlier RR snapshot does not claim current role data.
 await binding.fresh();
}
