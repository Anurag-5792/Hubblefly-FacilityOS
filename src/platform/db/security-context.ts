import {
  isUuid,
  parseCorrelationId,
  parseRequestId,
  type CorrelationId,
  type RequestId,
} from "../primitives";

export interface DatabaseSecurityContext {
  readonly authUserId: string;
  readonly requestId: RequestId;
  readonly correlationId: CorrelationId;
}

export function createDatabaseSecurityContext(input: {
  authUserId: string;
  requestId: string;
  correlationId: string;
}): Readonly<DatabaseSecurityContext> {
  if (!isUuid(input.authUserId)) {
    throw new TypeError("Database security context auth user ID must be a valid UUID.");
  }

  return Object.freeze({
    authUserId: input.authUserId.toLowerCase(),
    requestId: parseRequestId(input.requestId),
    correlationId: parseCorrelationId(input.correlationId),
  });
}
