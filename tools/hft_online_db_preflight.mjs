/** Read-only online PostgreSQL staging qualification; never posts stock. */
import {openOnlinePgPool} from '../lib/hft/persistence/online-pg-transport.ts';
import {withProtectedReadbackTransaction} from '../lib/hft/persistence/protected-posting-transaction.ts';
import {withP3Database} from '../lib/hft/masters/p3-database.ts';
const duty=process.argv[2]==='--masters'?'P3_MASTERS':
 process.argv[2]==='--stores'?'P2_STORES':null;
if(!duty){process.stderr.write('HFT_ONLINE_PREFLIGHT=INVALID_DUTY\n');process.exitCode=2;}
else {
 let pool;
 try {
  pool=openOnlinePgPool(process.env,duty);
  const verdict=async()=>({connection:'TLS_AND_ROLE_ATTESTED',
   privilegeCatalog:'QUALIFIED_SOURCE_SHAPE',
   actualTransactions:'NOT_EXECUTED',production:'NOT_AUTHORIZED'});
  const result=duty==='P3_MASTERS'
   ?await withP3Database(pool,process.env,true,verdict)
   :await withProtectedReadbackTransaction(pool,process.env,verdict);
  process.stdout.write('HFT_ONLINE_PREFLIGHT='+JSON.stringify({duty,...result})+'\n');
 }catch{
  process.stderr.write('HFT_ONLINE_PREFLIGHT=FAILED_CLOSED\n');
  process.exitCode=1;
 }finally {
  if(pool)try{await pool.end();}catch{
   process.stderr.write('HFT_ONLINE_PREFLIGHT=POOL_CLOSE_UNVERIFIED\n');
   process.exitCode=1;
  }
 }
}
