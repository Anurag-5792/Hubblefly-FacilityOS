import type { AggregateVersion } from "./aggregate-version";
import type { ActorContext } from "./actor-context";
import type { Clock, UtcTimestamp } from "./clock";
import type { InternalId, InternalIdFactory } from "./ids";
import { deepFreezeJson, type JsonObject, type JsonValue } from "./json";
import type { CausationId, CommandId, CorrelationId, RequestId } from "./trace-context";

export type EventVersion = number & { readonly __brand: "EventVersion" };

export interface EntityReference {
  readonly type: string;
  readonly id: InternalId;
}
export interface EventMetadata {
  readonly eventId: InternalId;
  readonly eventType: string;
  readonly entity: Readonly<EntityReference>;
  readonly aggregateVersion?: AggregateVersion;
  readonly occurredAt: UtcTimestamp;
  readonly actor: Readonly<ActorContext>;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly commandId?: CommandId;
  readonly requestId?: RequestId;
  readonly eventVersion: EventVersion;
  readonly metadata: Readonly<JsonObject>;
}
export interface EventEnvelope<Payload extends JsonValue> {
  readonly metadata: Readonly<EventMetadata>;
  readonly payload: Readonly<Payload>;
}

const eventNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/;

export function parseEventVersion(value: number): EventVersion {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Event version must be a positive safe integer.");
  }
  return value as EventVersion;
}

function validateEventName(value: string, label: string): string {
  if (!eventNamePattern.test(value)) {
    throw new TypeError(`${label} must be 1-100 safe identifier characters.`);
  }
  return value;
}

export function createEntityReference(type: string, id: InternalId): Readonly<EntityReference> {
  return Object.freeze({ type: validateEventName(type, "Entity type"), id });
}

export function createEventMetadata(input: {
  eventType: string;
  entity: EntityReference;
  aggregateVersion?: AggregateVersion;
  actor: ActorContext;
  correlationId: CorrelationId;
  causationId?: CausationId;
  commandId?: CommandId;
  requestId?: RequestId;
  eventVersion: number;
  metadata?: JsonObject;
  clock: Clock;
  idFactory: InternalIdFactory;
}): Readonly<EventMetadata> {
  const metadata = deepFreezeJson({ ...(input.metadata ?? {}) });
  return Object.freeze({
    eventId: input.idFactory.next(),
    eventType: validateEventName(input.eventType, "Event type"),
    entity: Object.freeze({ ...input.entity }),
    aggregateVersion: input.aggregateVersion,
    occurredAt: input.clock.nowUtc(),
    actor: input.actor,
    correlationId: input.correlationId,
    causationId: input.causationId,
    commandId: input.commandId,
    requestId: input.requestId ?? input.actor.requestId,
    eventVersion: parseEventVersion(input.eventVersion),
    metadata,
  });
}

export function createEventEnvelope<Payload extends JsonValue>(
  metadata: EventMetadata,
  payload: Payload,
): Readonly<EventEnvelope<Payload>> {
  return Object.freeze({ metadata, payload: deepFreezeJson(payload) });
}
