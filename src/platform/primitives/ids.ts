import { randomUUID } from "node:crypto";
import type { Brand } from "./brand";

export type InternalId = Brand<string, "InternalId">;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function parseInternalId(value: string): InternalId {
  if (!isUuid(value)) throw new TypeError("Internal ID must be a valid UUID.");
  return value.toLowerCase() as InternalId;
}

export function generateInternalId(): InternalId {
  return parseInternalId(randomUUID());
}

export interface InternalIdFactory {
  next(): InternalId;
}

export class SystemInternalIdFactory implements InternalIdFactory {
  next(): InternalId {
    return generateInternalId();
  }
}

export class DeterministicInternalIdFactory implements InternalIdFactory {
  private index = 0;

  constructor(private readonly ids: readonly InternalId[]) {
    if (ids.length === 0) throw new TypeError("Deterministic ID factory requires at least one ID.");
  }

  next(): InternalId {
    const value = this.ids[this.index];
    if (!value) throw new Error("Deterministic ID factory exhausted.");
    this.index += 1;
    return value;
  }
}
