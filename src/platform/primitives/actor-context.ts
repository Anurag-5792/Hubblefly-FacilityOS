import { z } from "zod";
import type { RequestId } from "./trace-context";
import { parseRequestId } from "./trace-context";

export const actorTypes = ["HUMAN", "SERVICE", "SYSTEM", "MIGRATION"] as const;
export type ActorType = (typeof actorTypes)[number];
export type ActorId = string & { readonly __brand: "ActorId" };

const safeReference = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);

const actorContextSchema = z.object({
  actorType: z.enum(actorTypes),
  actorId: safeReference,
  requestId: z.string().optional(),
  sessionReference: safeReference.optional(),
  delegationReference: safeReference.optional(),
  scopeReferences: z.array(safeReference).max(64).optional(),
});

export interface ActorContext {
  readonly actorType: ActorType;
  readonly actorId: ActorId;
  readonly requestId?: RequestId;
  readonly sessionReference?: string;
  readonly delegationReference?: string;
  readonly scopeReferences: readonly string[];
}

export function parseActorContext(input: unknown): Readonly<ActorContext> {
  const parsed = actorContextSchema.parse(input);
  const scopeReferences = Object.freeze([...(parsed.scopeReferences ?? [])]);
  return Object.freeze({
    actorType: parsed.actorType,
    actorId: parsed.actorId as ActorId,
    requestId: parsed.requestId === undefined ? undefined : parseRequestId(parsed.requestId),
    sessionReference: parsed.sessionReference,
    delegationReference: parsed.delegationReference,
    scopeReferences,
  });
}
