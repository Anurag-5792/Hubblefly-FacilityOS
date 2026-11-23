/** Harness-only barriers around REAL pg operations. Never replaces a result,
 * SQL parameter, authentication check, database connection or callback.
 * Nothing in app/lib imports this file. No public HTTP flags or pause hooks.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {createRequire} from 'node:module';
const pg=createRequire(import.meta.url)('pg') as typeof import('pg');
type Wire={user?:string;processID?:number;options?:{user?:string}};
type Method=(...args:unknown[])=>unknown;
export type Observation=Readonly<{sequence:number;context:string;phase:'before'|'after';label:string;login:string;pid:number|null}>;
export type PgObservation={query:Observation[];run<T>(name:string,work:()=>Promise<T>):Promise<T>;
 hook:((event:Observation)=>Promise<void>)|null;close():void};
function label(sql:string):string{
 if(sql.includes('pg_advisory_lock($1::integer,$2::integer)'))return 'ROLE_SESSION_FENCE';
 if(sql.includes('pg_advisory_unlock($1::integer,$2::integer)'))return 'ROLE_SESSION_UNLOCK';
 if(sql.includes('pg_try_advisory_xact_lock_shared'))return 'STOCK_SHARED_FENCE';
 if(sql.includes('SELECT hft.ops_a2_operator_resolve_receive_v1'))return 'RESOLVE';
 if(sql.includes('SELECT hft.ops_a2_operator_post_receive_v1'))return 'POST';
 if(sql.includes('SELECT hft.ops_a2_operator_reconcile_receive_v1'))return 'RECONCILE';
 if(sql.includes('SELECT hft.ops_a2_operator_read_receive_v1'))return 'READ';
 if(sql==='COMMIT'||sql==='ROLLBACK')return sql;
 return 'SQL';
}
export function observeRealPg():PgObservation{
 const context=new AsyncLocalStorage<string>();let seq=0;
 const cp=pg.Client.prototype as unknown as {query:Method};
 const pp=pg.Pool.prototype as unknown as {end:Method};
 const originalQuery=cp.query,originalEnd=pp.end;
 const observer:PgObservation={query:[],hook:null,run:(name,work)=>context.run(name,work),
  close(){cp.query=originalQuery;pp.end=originalEnd;observer.hook=null;}};
 async function emit(wire:Wire,phase:Observation['phase'],name:string):Promise<void>{
  const ctx=context.getStore();if(!ctx)return;
  const event={sequence:++seq,context:ctx,phase,label:name,login:wire.user||wire.options?.user||'',pid:wire.processID??null};
  observer.query.push(event);await observer.hook?.(event);
 }
 cp.query=function(this:Wire,...args:unknown[]){
  // Callback-style/internal pg calls are passed through byte-for-byte.
  if(!context.getStore()||typeof args[0]!=='string'||args.some(x=>typeof x==='function'))
   return Reflect.apply(originalQuery,this,args);
  return (async()=>{
   const name=label(args[0] as string);await emit(this,'before',name);
   const actual=await Reflect.apply(originalQuery,this,args);
   await emit(this,'after',name);return actual;
  })();
 };
 pp.end=function(this:Wire,...args:unknown[]){
  if(!context.getStore()||args.some(x=>typeof x==='function'))return Reflect.apply(originalEnd,this,args);
  return (async()=>{const actual=await Reflect.apply(originalEnd,this,args);await emit(this,'after','POOL_END');return actual;})();
 };
 return observer;
}
export function barrier(){
 let arrived!:()=>void,release!:()=>void;
 const reached=new Promise<void>(r=>{arrived=r;}),resume=new Promise<void>(r=>{release=r;});
 return {reached,release,async pause(){arrived();await resume;}};
}
