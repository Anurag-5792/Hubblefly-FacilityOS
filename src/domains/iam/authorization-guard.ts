import "server-only";

import type { DB } from "../../platform/db/kysely.types";
import type { UnitOfWork } from "../../platform/db/unit-of-work";
import type { AuthenticatedUser } from "./authenticated-user";
import type {
  AuthorizationDecision,
  AuthorizationScope,
} from "./authorization-model";
import type { AuthorizationService } from "./authorization-service";

export async function requireCapabilityWithin(
  uow: UnitOfWork<DB>,
  input: {
    authorization: AuthorizationService;
    user: Readonly<AuthenticatedUser>;
    capability: string;
    scope: Readonly<AuthorizationScope>;
    resourceContext?: Readonly<Record<string, unknown>>;
  },
): Promise<AuthorizationDecision> {
  return await input.authorization.requireWithin(uow, {
    user: input.user,
    capability: input.capability,
    scope: input.scope,
    resourceContext: input.resourceContext,
  });
}

export async function requireCapability(input: {
  authorization: AuthorizationService;
  user?: Readonly<AuthenticatedUser>;
  capability: string;
  scope: Readonly<AuthorizationScope>;
  resourceContext?: Readonly<Record<string, unknown>>;
}): Promise<AuthorizationDecision> {
  return await input.authorization.require({
    user: input.user,
    capability: input.capability,
    scope: input.scope,
    resourceContext: input.resourceContext,
  });
}

export function toAuthorizationHint(
  decision: AuthorizationDecision,
): Readonly<{ capability: string; allowed: boolean }> {
  return Object.freeze({
    capability: decision.requestedCapability,
    allowed: decision.allowed,
  });
}
