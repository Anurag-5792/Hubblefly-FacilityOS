/** Quantitative, legally-owned stock account model. NO runtime posting gate. */
import { parseQuantity } from '../domain/quantity.ts';
import type { StockCommand, StockFact } from '../domain/ledger.ts';

export type AccountKind = 'AVAILABLE'|'CUSTODY'|'QUARANTINE'|'DAMAGED'|'WIP'|'INSTALLED';
export type Condition = 'GOOD'|'QUARANTINE'|'DAMAGED';
export type AccountIdentity = Readonly<{
  legalEntityId: string; warehouseId: string; locationId: string; itemCode: string;
  batchNo: string; serialNo: string; kind: AccountKind; condition: Condition; custodianEmployeeId: string;
}>;
export type QuantitativeLeg = Readonly<{
  bucket: AccountKind|'EXTERNAL'; signedMicro: bigint; account: AccountIdentity|null;
}>;
function amount(text: string): bigint {
  const negative=text.startsWith('-');
  const magnitude=parseQuantity(negative?text.slice(1):text);
  if(magnitude===0n) throw new Error('EMPTY_STOCK_MOVEMENT');
  return negative?-magnitude:magnitude;
}
/** Distinct identity for each custody holder and physical location. */
export function accountIdentity(command:StockCommand, bucket:AccountKind):AccountIdentity {
  if(!command.locationId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(command.locationId))
    throw new Error('POSTING_LOCATION_REQUIRED');
  if(bucket==='CUSTODY' && !command.employeeId) throw new Error('CUSTODY_EMPLOYEE_REQUIRED');
  return {
    legalEntityId:command.legalEntityId,warehouseId:command.warehouseId,locationId:command.locationId,
    itemCode:command.itemCode,batchNo:command.batchNo??'',serialNo:command.serialNo??'',
    kind:bucket,condition:bucket==='QUARANTINE'?'QUARANTINE':bucket==='DAMAGED'?'DAMAGED':'GOOD',
    custodianEmployeeId:bucket==='CUSTODY'?command.employeeId!:'',
  };
}
export function postingLegs(command:StockCommand, fact:StockFact):readonly QuantitativeLeg[] {
  if(fact.commandId!==command.commandId || fact.entityId!==command.legalEntityId ||
     fact.itemCode!==command.itemCode || fact.warehouseId!==command.warehouseId)
    throw new Error('FACT_COMMAND_BINDING_MISMATCH');
  // Reject unlocated posts even for inbound EXTERNAL movements.
  accountIdentity(command,'AVAILABLE');
  const legs=fact.movements.map(movement=>{
    const signedMicro=amount(movement.delta);
    return {bucket:movement.bucket,signedMicro,
      account:movement.bucket==='EXTERNAL'?null:accountIdentity(command,movement.bucket)} as const;
  });
  if(legs.length<2 || legs.reduce((x,leg)=>x+leg.signedMicro,0n)!==0n)
    throw new Error('LEDGER_NOT_BALANCED');
  return legs;
}
/** No EXTERNAL leg is owned inventory. Summation is ALWAYS per account ID. */
export function reconstructAccountBalances(legs:readonly Readonly<{accountId:string|null; signedMicro:bigint}>[]):ReadonlyMap<string,bigint> {
  const result=new Map<string,bigint>();
  for(const leg of legs){
    if(leg.accountId===null) continue;
    if(!leg.accountId) throw new Error('STOCK_ACCOUNT_ID_REQUIRED');
    result.set(leg.accountId,(result.get(leg.accountId)??0n)+leg.signedMicro);
  }
  return result;
}
