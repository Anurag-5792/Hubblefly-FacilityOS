/**
 * Nonproduction request-bound identity adapter. Verifies an Ed25519 issuer-
 * signed, short-lived cookie. It NEVER issues sessions, trusts forwarded
 * identity headers, or enables an HTTP posting route. Issuer onboarding,
 * revocation and human approval remain separate release blockers.
 */
import { createPublicKey, verify } from 'node:crypto';
import { assertSecureStartup } from './authorization.ts';

export type VerifiedRequestOperator = Readonly<{
  subject: string;
  sessionId: string;
  expiresAt: number;
  scope: Readonly<{ legalEntityId: string; siteId: string; warehouseIds: readonly string[] }>;
}>;
export type RequestIdentityEnvironment = Readonly<Record<string, string | undefined>>;
const verified = new WeakSet<VerifiedRequestOperator>();
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const cookieName = '__Host-hft_session';

function decodePart(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length > 3500) throw new Error('SESSION_ENCODING_INVALID');
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) throw new Error('SESSION_ENCODING_NONCANONICAL');
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new Error('SESSION_JSON_INVALID'); }
}
function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('SESSION_CLAIMS_INVALID');
  return x as Record<string, unknown>;
}
function requiredId(x: unknown): string {
  if (typeof x !== 'string' || !identifier.test(x)) throw new Error('SESSION_IDENTIFIER_INVALID');
  return x;
}
function tokenFromCookie(raw: string | null): string {
  if (!raw) throw new Error('SESSION_COOKIE_REQUIRED');
  const found: string[] = [];
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === cookieName) found.push(part.slice(index + 1).trim());
  }
  if (found.length !== 1 || !found[0]) throw new Error('SESSION_COOKIE_DUPLICATE_OR_MISSING');
  return found[0];
}

export function resolveVerifiedRequestOperator(request: Request, env: RequestIdentityEnvironment): VerifiedRequestOperator {
  assertSecureStartup(env);
  if (request.method !== 'POST') throw new Error('POST_ONLY_IDENTITY_BINDING');
  const requiredOrigin = env.HFT_PUBLIC_ORIGIN;
  if (!requiredOrigin) throw new Error('TRUSTED_REQUEST_ORIGIN_REQUIRED');
  let origin: URL;
  try { origin = new URL(requiredOrigin); }
  catch { throw new Error('TRUSTED_REQUEST_ORIGIN_INVALID'); }
  if (origin.origin !== requiredOrigin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('TRUSTED_REQUEST_ORIGIN_INVALID');
  const localhostTest = env.HFT_ENVIRONMENT === 'test' && origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !localhostTest) throw new Error('SECURE_REQUEST_ORIGIN_REQUIRED');
  if (new URL(request.url).origin !== origin.origin || request.headers.get('origin') !== origin.origin)
    throw new Error('REQUEST_ORIGIN_MISMATCH');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') throw new Error('CROSS_SITE_REQUEST_DENIED');
  if (request.headers.has('authorization') || request.headers.has('x-user-id'))
    throw new Error('UNTRUSTED_AUTHENTICATION_HEADER');

  const token = tokenFromCookie(request.headers.get('cookie'));
  if (token.length > 4096) throw new Error('SESSION_TOO_LARGE');
  const segments = token.split('.');
  if (segments.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(segments[2])) throw new Error('SESSION_FORMAT_INVALID');
  const header = record(decodePart(segments[0]));
  if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || header.kid !== 'hft-r1')
    throw new Error('SESSION_ALGORITHM_OR_KEY_REJECTED');
  const publicKeyPem = env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM;
  if (!publicKeyPem) throw new Error('SESSION_PUBLIC_KEY_NOT_CONFIGURED');
  let validSignature = false;
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('SESSION_KEY_TYPE_INVALID');
    validSignature = verify(null, Buffer.from(segments[0]+'.'+segments[1], 'ascii'), key, Buffer.from(segments[2], 'base64url'));
  } catch { throw new Error('SESSION_SIGNATURE_OR_KEY_INVALID'); }
  if (!validSignature) throw new Error('SESSION_SIGNATURE_OR_KEY_INVALID');
  const claims = record(decodePart(segments[1]));
  if (!env.HFT_SESSION_ISSUER || !env.HFT_SESSION_AUDIENCE ||
      claims.iss !== env.HFT_SESSION_ISSUER || claims.aud !== env.HFT_SESSION_AUDIENCE)
    throw new Error('SESSION_ISSUER_AUDIENCE_INVALID');
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) ||
      typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) ||
      claims.iat > now + 30 || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > 900 ||
      (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isSafeInteger(claims.nbf) || claims.nbf > now)))
    throw new Error('SESSION_EXPIRED_OR_INVALID');
  const subject = requiredId(claims.sub);
  const sessionId = requiredId(claims.jti);
  const legalEntityId = requiredId(claims.legalEntityId);
  const siteId = requiredId(claims.siteId);
  if (!Array.isArray(claims.warehouseIds) || claims.warehouseIds.length === 0 || claims.warehouseIds.length > 32)
    throw new Error('SESSION_WAREHOUSE_SCOPE_INVALID');
  const warehouseIds = claims.warehouseIds.map(requiredId);
  if (new Set(warehouseIds).size !== warehouseIds.length) throw new Error('SESSION_WAREHOUSE_SCOPE_DUPLICATE');
  const operator: VerifiedRequestOperator = Object.freeze({ subject, sessionId, expiresAt: claims.exp,
    scope: Object.freeze({ legalEntityId, siteId, warehouseIds: Object.freeze(warehouseIds) }) });
  verified.add(operator);
  return operator;
}

/** Runtime proof prevents a forged as-cast from granting stock access. */
export function assertVerifiedRequestOperator(operator: VerifiedRequestOperator | null | undefined,
  scope: Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>): string {
  if (!operator || typeof operator !== 'object' || !verified.has(operator)) throw new Error('VERIFIED_REQUEST_IDENTITY_REQUIRED');
  if (operator.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('SESSION_EXPIRED_OR_INVALID');
  if (scope.legalEntityId !== operator.scope.legalEntityId || scope.siteId !== operator.scope.siteId ||
      !operator.scope.warehouseIds.includes(scope.warehouseId)) throw new Error('SIGNED_SCOPE_DENIED');
  return operator.subject;
}
