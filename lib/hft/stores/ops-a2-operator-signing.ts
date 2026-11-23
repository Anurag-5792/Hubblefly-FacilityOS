/** Only after a separately admitted PG18.7 operational Stores installation.
 * Keys must be independently enrolled in protected PostgreSQL and supplied as
 * managed runtime secrets. This module never enrolls or generates signer keys.
 */
import {assertOperatorRuntimeProfile} from '../roles/role-isolated-profile.ts';
import type {OpsA2Signer} from '../persistence/ops-a2-stores-source.ts';
type Env=Readonly<Record<string,string|undefined>>;
function key(s:string|undefined){
 if(!s||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))
  throw Error('OPS_A2_STORES_SIGNER_MISSING');
 const b=Buffer.from(s,'base64');
 if(b.length<32||b.length>128||b.toString('base64')!==s)
  throw Error('OPS_A2_STORES_SIGNER_INVALID');
 return b;
}
function version(s:string|undefined){
 if(!s||!/^[1-9][0-9]{0,7}$/.test(s))
  throw Error('OPS_A2_STORES_SIGNER_VERSION_INVALID');
 return Number(s);
}
export function operationalStoresSigner(env:Env):OpsA2Signer{
 assertOperatorRuntimeProfile(env);
 const post=key(env.HFT_OPS_A2_POST_KEY_BASE64);
 try{
  const p0=key(env.HFT_P0_STORES_KEY_BASE64);
  return {key:post,keyVersion:version(env.HFT_OPS_A2_POST_KEY_VERSION),
   p0Key:p0,p0KeyVersion:version(env.HFT_P0_STORES_KEY_VERSION)};
 }catch(e){post.fill(0);throw e;}
}
export function clearStoresSigner(signer:OpsA2Signer){
 signer.key.fill(0);signer.p0Key.fill(0);
}
