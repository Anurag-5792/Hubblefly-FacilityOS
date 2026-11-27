import type {IntakeRequest} from './intake-contract.ts';
// A missing context is permitted only for the initial READ. All bound reads and
// all mutation/reconciliation requests must match the verified signed context.
export function intakeContextMatches(intent:IntakeRequest['intent'],supplied:string|null,verified:string){
 return supplied===null?intent==='READ':supplied===verified;
}
export function intakeFailure(intent:IntakeRequest['intent'],error:unknown){
 const message=error instanceof Error?error.message:'';
 // Revocation during independent mutation readback is NOT a definitive rejection.
 if(message==='INTAKE_ACCESS_DENIED')return {status:403,code:'INTAKE_ACCESS_DENIED'};
 if(intent==='RENAME'){
  if(['INTAKE_RENAME_INVALID','INTAKE_NO_CHANGE','INTAKE_REVISION_CONFLICT'].includes(message))
   return {status:422,code:'INTAKE_RENAME_REJECTED'};
  return {status:409,code:'INTAKE_CHECK_ORIGINAL_REQUEST'};
 }
 return {status:503,code:'INTAKE_DATABASE_UNAVAILABLE'};
}
