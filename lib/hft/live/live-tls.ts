/**
 * LIVE R1: qualify the actual node-postgres client TLS socket, not the
 * PostgreSQL backend's pg_stat_ssl observation. Neon may terminate the
 * independently verified client TLS connection at its proxy.
 *
 * This is an additional runtime admission check, not permission to use
 * sslmode=require/no-verify or to bypass the approved CA and hostname.
 */
import {isIP} from 'node:net';
import {checkServerIdentity, type PeerCertificate} from 'node:tls';

type LiveSocket = Readonly<{
  encrypted?: boolean;
  authorized?: boolean;
  authorizationError?: Error|string|null;
  servername?: string;
  remoteAddress?: string;
  remotePort?: number;
  getProtocol?: () => string|null;
  getCipher?: () => {name?: string}|null;
  getPeerCertificate?: () => PeerCertificate;
}>;

export function assertVerifiedLiveTls(
  client: Readonly<{connection?: {stream?: unknown}}>,
  approvedHost: string,
  approvedPort: number,
): void {
  const deny = (): never => {throw Error('LIVE_R1_CLIENT_TLS_NOT_VERIFIED');};
  if(!approvedHost||isIP(approvedHost)!==0||
    !Number.isInteger(approvedPort)||approvedPort<1||approvedPort>65535)deny();
  const s=client.connection?.stream as LiveSocket|undefined;
  if(!s||s.encrypted!==true||s.authorized!==true||
    s.authorizationError!=null||s.servername!==approvedHost||
    !s.remoteAddress||isIP(s.remoteAddress)===0||
    s.remotePort!==approvedPort)deny();
  const protocol=s.getProtocol?.();
  if(protocol!=='TLSv1.2'&&protocol!=='TLSv1.3')deny();
  const cipher=s.getCipher?.();
  if(!cipher||!cipher.name)deny();
  const peer=s.getPeerCertificate?.();
  if(!peer||!Buffer.isBuffer(peer.raw)||peer.raw.length===0)deny();
  try{if(checkServerIdentity(approvedHost,peer))deny();}
  catch{deny();}
}
