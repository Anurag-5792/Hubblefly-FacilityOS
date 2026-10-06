import { randomUUID } from "node:crypto";
import {
  createOperationContext,
  generateCommandId,
  generateCorrelationId,
  parseCausationId,
  parseCorrelationId,
  parseRequestId,
  type OperationContext,
} from "../../src/platform/primitives";

function safeRequestId(value: string | null) {
  if (value) {
    try { return parseRequestId(value); } catch { /* generate trusted fallback */ }
  }
  return parseRequestId(`req-${randomUUID()}`);
}

export function operationContextFromHeaders(headers: Headers): Readonly<OperationContext> {
  let correlationId = generateCorrelationId();
  const incomingCorrelation = headers.get("x-correlation-id");
  if (incomingCorrelation) {
    try { correlationId = parseCorrelationId(incomingCorrelation); } catch { /* use server value */ }
  }

  let causationId;
  const incomingCausation = headers.get("x-causation-id");
  if (incomingCausation) {
    try { causationId = parseCausationId(incomingCausation); } catch { /* omit invalid value */ }
  }

  return createOperationContext({
    requestId: safeRequestId(headers.get("x-request-id")),
    commandId: generateCommandId(),
    correlationId,
    causationId,
  });
}
