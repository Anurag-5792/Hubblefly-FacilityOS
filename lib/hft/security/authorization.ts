/** Security boundary: only the server-side identity adapter may construct verified principals. */
export type Scope = Readonly<{ legalEntityId: string; siteId: string; warehouseIds: readonly string[] }>;
export type Permission = 'master:read' | 'master:write' | 'stock:read' | 'stock:prepare' | 'stock:approve' | 'stock:post' | 'audit:read';
export type VerifiedPrincipal = Readonly<{
  subject: string;
  authenticated: true;
  active: true;
  scope: Scope;
  permissions: readonly Permission[];
}>;

export function authorize(principal: VerifiedPrincipal | null, permission: Permission,
  target: Readonly<{ legalEntityId: string; siteId: string; warehouseId?: string }>): void {
  if (!principal || !principal.authenticated || !principal.active || !principal.subject.trim()) throw new Error('AUTHENTICATION_REQUIRED');
  if (!principal.permissions.includes(permission)) throw new Error('PERMISSION_DENIED');
  if (target.legalEntityId !== principal.scope.legalEntityId || target.siteId !== principal.scope.siteId) throw new Error('CROSS_ENTITY_DENIED');
  if (target.warehouseId && !principal.scope.warehouseIds.includes(target.warehouseId)) throw new Error('WAREHOUSE_SCOPE_DENIED');
}

/** This branch is engineering-only. No environment flag can activate live stock posting. */
export function assertPostingMode(env: Readonly<Record<string, string | undefined>>): void {
  if (env.HFT_LIVE_POSTING_ENABLED !== undefined && env.HFT_LIVE_POSTING_ENABLED !== 'false') {
    throw new Error('LIVE_POSTING_PROHIBITED_IN_R1_ENGINEERING');
  }
}

export function assertSecureStartup(env: Readonly<Record<string, string | undefined>>): void {
  assertPostingMode(env);
  if (env.NODE_ENV === 'production' || env.HFT_ENVIRONMENT === 'production') {
    // Deliberately fail even when configured: an independently reviewed identity
    // adapter and production release authorization do not exist in this package.
    throw new Error('PRODUCTION_STARTUP_NOT_AUTHORIZED');
  }
  if (env.HFT_AUTH_SOURCE === 'preview' || env.HFT_AUTH_SOURCE === 'sample') {
    throw new Error('INSECURE_AUTH_SOURCE_REJECTED');
  }
}
