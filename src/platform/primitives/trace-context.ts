import { randomUUID } from "node:crypto";
import type { Brand } from "./brand";
import { isUuid } from "./ids";

export type CorrelationId = Brand<string, "CorrelationId">;
export type CausationId = Brand<string, "CausationId">;
export type CommandId = Brand<string, "CommandId">;
export type RequestId = Brand<string, "RequestId">;

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function parseUuidTraceId<Name extends string>(value: string, label: string): Brand<string, Name> {
  if (!isUuid(value)) throw new TypeError(`${label} must be a valid UUID.`);
  return value.toLowerCase() as Brand<string, Name>;
}

export function generateCorrelationId(): CorrelationId {
  return parseCorrelationId(randomUUID());
}
export function parseCorrelationId(value: string): CorrelationId {
  return parseUuidTraceId<"CorrelationId">(value, "Correlation ID");
}
export function generateCausationId(): CausationId {
  return parseCausationId(randomUUID());
}
export function parseCausationId(value: string): CausationId {
  return parseUuidTraceId<"CausationId">(value, "Causation ID");
}
export function generateCommandId(): CommandId {
  return parseCommandId(randomUUID());
}
export function parseCommandId(value: string): CommandId {
  return parseUuidTraceId<"CommandId">(value, "Command ID");
}
export function parseRequestId(value: string): RequestId {
  if (!requestIdPattern.test(value)) {
    throw new TypeError("Request ID must be 1-128 safe characters and begin with an alphanumeric character.");
  }
  return value as RequestId;
}

export interface OperationContext {
  readonly requestId: RequestId;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
}

export function createOperationContext(input: OperationContext): Readonly<OperationContext> {
  return Object.freeze({ ...input });
}
