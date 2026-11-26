import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertVerifiedLiveTls} from '../../lib/hft/live/live-tls.ts';
const host='fixture.db.example.org';
function connection(patch:Record<string,unknown>={}){
 return {connection:{stream:{encrypted:true,authorized:true,authorizationError:null,
  servername:host,remoteAddress:'192.0.2.15',remotePort:5432,
  getProtocol:()=> 'TLSv1.3',getCipher:()=>({name:'TLS_AES_256_GCM_SHA384'}),
  getPeerCertificate:()=>({raw:Buffer.from('synthetic'),subjectaltname:'DNS:'+host}),
  ...patch}}};
}
test('direct TLS socket admission accepts a CA-validated/hostname-matched synthetic socket',()=>{
 assert.doesNotThrow(()=>assertVerifiedLiveTls(connection(),host,5432));
});
test('rejects missing, unauthorised, downgraded and host-swapped TLS sockets',()=>{
 const invalid=[
  {encrypted:false},{authorized:false},{authorizationError:'SELF_SIGNED_CERT_IN_CHAIN'},
  {servername:'attacker.example.org'},{remoteAddress:'attacker.example.org'},
  {remotePort:5433},{getProtocol:()=> 'TLSv1.1'},
  {getPeerCertificate:()=>({raw:Buffer.from('synthetic'),subjectaltname:'DNS:other.example.org'})},
  {getPeerCertificate:()=>({subjectaltname:'DNS:'+host})},
  {getCipher:()=>null}
 ];
 for(const patch of invalid)assert.throws(()=>assertVerifiedLiveTls(connection(patch),host,5432),/CLIENT_TLS_NOT_VERIFIED/);
 assert.throws(()=>assertVerifiedLiveTls({},host,5432),/CLIENT_TLS_NOT_VERIFIED/);
});
