import type { Brand } from "./brand";

export type Cursor = Brand<string, "Cursor">;
const cursorPattern = /^[A-Za-z0-9_-]{1,2048}$/;

export interface PaginationLimits {
  readonly defaultLimit: number;
  readonly maxLimit: number;
}
const defaultLimits: PaginationLimits = Object.freeze({ defaultLimit: 50, maxLimit: 200 });

function validateLimit(raw: number | undefined, limits: PaginationLimits): number {
  const value = raw ?? limits.defaultLimit;
  if (!Number.isSafeInteger(value) || value < 1 || value > limits.maxLimit) {
    throw new TypeError(`Pagination limit must be an integer between 1 and ${limits.maxLimit}.`);
  }
  return value;
}

export function parseCursor(value: string): Cursor {
  if (!cursorPattern.test(value)) {
    throw new TypeError("Cursor must be an opaque base64url-safe value up to 2048 characters.");
  }
  return value as Cursor;
}

export interface OffsetPaginationRequest {
  readonly kind: "offset";
  readonly offset: number;
  readonly limit: number;
}
export interface CursorPaginationRequest {
  readonly kind: "cursor";
  readonly cursor?: Cursor;
  readonly limit: number;
}

export function parseOffsetPagination(
  input: { offset?: number; limit?: number },
  limits: PaginationLimits = defaultLimits,
): Readonly<OffsetPaginationRequest> {
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError("Pagination offset must be a non-negative safe integer.");
  }
  return Object.freeze({ kind: "offset", offset, limit: validateLimit(input.limit, limits) });
}

export function parseCursorPagination(
  input: { cursor?: string; limit?: number },
  limits: PaginationLimits = defaultLimits,
): Readonly<CursorPaginationRequest> {
  return Object.freeze({
    kind: "cursor",
    cursor: input.cursor === undefined ? undefined : parseCursor(input.cursor),
    limit: validateLimit(input.limit, limits),
  });
}

export interface OffsetPageMetadata {
  readonly kind: "offset";
  readonly offset: number;
  readonly limit: number;
  readonly total?: number;
}
export interface CursorPageMetadata {
  readonly kind: "cursor";
  readonly limit: number;
  readonly nextCursor?: Cursor;
  readonly hasMore: boolean;
}
export interface Page<Item, Metadata extends OffsetPageMetadata | CursorPageMetadata> {
  readonly items: readonly Item[];
  readonly page: Readonly<Metadata>;
}
