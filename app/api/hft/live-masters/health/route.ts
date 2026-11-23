/** Redacted production readiness. Never advertises operational stock eligibility. */
import {assertLiveProfile} from '../../../../../lib/hft/live/live-profile.ts';
import {openLivePool,admitLiveConnection} from '../../../../../lib/hft/live/live-service.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
 try{
  assertLiveProfile(process.env);
  const pool=openLivePool(process.env);
  try{const c=await pool.connect();
   try{await c.query('BEGIN READ ONLY');await admitLiveConnection(c,process.env);
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
   finally{c.release();}
  }finally{await pool.end();}
  return Response.json({state:'TECHNICAL_ADMISSION_ONLY',masters:true,
   protectedStock:false,releaseApproved:false},
   {headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({state:'NOT_ADMITTED',masters:false,
  protectedStock:false,releaseApproved:false},{status:503,
  headers:{'Cache-Control':'no-store'}});}
}
