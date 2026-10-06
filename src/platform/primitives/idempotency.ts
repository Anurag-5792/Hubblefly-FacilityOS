import type { Brand } from "./brand";

export type IdempotencyKey = Brand<string, "IdempotencyKey">;
export type IdempotencyScope = Brand<string, "IdempotencyScope">;

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const scopePattern = /^[a-z][a-z0-9._-]{0,79}$/;

export function parseIdempotencyKey(value: string): IdempotencyKey {
  if (!keyPattern.test(value)) {
    throw new TypeError("Idempotency key must be 8-200 safe characters and begin with an alphanumeric character.");
  }
  return value as IdempotencyKey;
}

export function parseIdempotencyScope(value: string): IdempotencyScope {
  if (!scopePattern.test(value)) {
    throw new TypeError("Idempotency scope must be 1-80 lowercase characters using letters, digits, dot, underscore or hyphen.");
  }
  return value as IdempotencyScope;
}

export interface ScopedIdempotencyKey {
  readonly scope: IdempotencyScope;
  readonly key: IdempotencyKey;
}

export function createScopedIdempotencyKey(scope: string, key: string): Readonly<ScopedIdempotencyKey> {
  return Object.freeze({
    scope: parseIdempotencyScope(scope),
    key: parseIdempotencyKey(key),
  });
}

export function sameIdempotencyIdentity(left: ScopedIdempotencyKey, right: ScopedIdempotencyKey): boolean {
  return left.scope === right.scope && left.key === right.key;
}
