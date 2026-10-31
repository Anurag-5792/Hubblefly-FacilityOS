/** Read-only online PostgreSQL effective function/role gate. */
import type {PgQueryClient} from './isolated-pg-transaction.ts';
export type OnlineRuntimeDuty='P2_STORES'|'P3_MASTERS';
const functions:Readonly<Record<OnlineRuntimeDuty,readonly string[]>>={
 P2_STORES:[
  'hft.post_stock_command_protected_v1(jsonb,jsonb)',
  'hft.reconcile_protected_stock_command_v1(jsonb,jsonb)',
  'hft.p0_resolve_authorized_stock_v1(jsonb,jsonb)',
  'hft.p0_append_count_observation_v1(jsonb,jsonb)',
  'hft.p0_reconcile_count_observation_v1(jsonb,jsonb)',
  'hft.p0_read_authoritative_stores_v1(jsonb,jsonb)'
 ],
 P3_MASTERS:[
  'hft.p3_submit_master_change_v1(jsonb,jsonb)',
  'hft.p3_decide_apply_employee_v1(jsonb,jsonb)',
  'hft.p3_read_masters_v1(jsonb,jsonb)'
 ]
};
export const ONLINE_RUNTIME_CATALOG_SQL="\nWITH required(signature) AS (\n SELECT pg_catalog.jsonb_array_elements_text($1::jsonb)\n), found AS (\n SELECT signature,pg_catalog.to_regprocedure(signature) AS oid FROM required\n), fstate AS (\n SELECT COUNT(*)::integer AS n,BOOL_AND(p.prosecdef AND NOT owner.rolcanlogin\n  AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')) AS ok\n FROM found f JOIN pg_catalog.pg_proc p ON p.oid=f.oid\n JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner\n), extras AS (\n SELECT COUNT(*)::integer AS n FROM pg_catalog.pg_proc p\n JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace\n WHERE ns.nspname IN ('hft','hft_secret','hft_crypto')\n AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')\n AND p.oid NOT IN (SELECT oid FROM found WHERE oid IS NOT NULL)\n), dml AS (\n SELECT COUNT(*)::integer AS n FROM pg_catalog.pg_class c\n JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace\n WHERE ns.nspname IN ('hft','hft_secret') AND\n (CASE WHEN c.relkind='S' THEN\n  pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')\n WHEN c.relkind IN ('r','p','v','m','f') THEN\n  pg_catalog.has_table_privilege(current_user,c.oid,\n   'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')\n ELSE false END)\n), elevated AS (\n SELECT COUNT(*)::integer AS n FROM pg_catalog.pg_roles r\n WHERE r.rolname IN ('hft_engineering','hft_r1_posting_owner',\n  'hft_r1_p3_master_owner','hft_r1_governance_issuer')\n AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')\n)\nSELECT (SELECT n FROM fstate) AS function_count,\n (SELECT COALESCE(ok,false) FROM fstate) AS functions_secure,\n (SELECT n FROM extras) AS unexpected_functions,\n (SELECT n FROM dml) AS direct_relation_grants,\n (SELECT n FROM elevated) AS privileged_memberships,\n pg_catalog.has_schema_privilege(current_user,'hft','USAGE') AS schema_usage,\n pg_catalog.has_schema_privilege(current_user,'hft','CREATE') AS schema_create,\n pg_catalog.has_schema_privilege(current_user,'hft_secret','USAGE') AS secret_usage,\n pg_catalog.has_schema_privilege(current_user,'hft_crypto','USAGE') AS crypto_usage,\n (SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole\n  AND NOT r.rolreplication AND NOT r.rolbypassrls\n  FROM pg_catalog.pg_roles r WHERE r.rolname=current_user) AS nonprivileged_login,\n pg_catalog.current_setting('server_version_num')::integer AS server_version_num\n";
type Row=Readonly<{function_count:number;functions_secure:boolean;
 unexpected_functions:number;direct_relation_grants:number;
 privileged_memberships:number;schema_usage:boolean;schema_create:boolean;
 secret_usage:boolean;crypto_usage:boolean;nonprivileged_login:boolean;
 server_version_num:number}>;
export async function assertOnlineRuntimeCatalog(
 c:PgQueryClient,duty:OnlineRuntimeDuty):Promise<void>{
 const list=functions[duty];
 if(!list)throw Error('HFT_ONLINE_DB_DUTY_INVALID');
 const result=await c.query<Row>(ONLINE_RUNTIME_CATALOG_SQL,[JSON.stringify(list)]);
 const r=result.rows[0];
 if(result.rows.length!==1||!r||r.function_count!==list.length||
  r.functions_secure!==true||r.unexpected_functions!==0||
  r.direct_relation_grants!==0||r.privileged_memberships!==0||
  r.schema_usage!==true||r.schema_create!==false||
  r.secret_usage!==false||r.crypto_usage!==false||
  r.nonprivileged_login!==true||
  !Number.isSafeInteger(r.server_version_num)||r.server_version_num<150000)
  throw Error('HFT_ONLINE_DB_RUNTIME_ACL_OR_SCHEMA_NOT_QUALIFIED');
}
