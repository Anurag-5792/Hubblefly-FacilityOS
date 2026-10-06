import "server-only";

import type { DB } from "../../platform/db/kysely.types";
import type { UnitOfWork, UnitOfWorkManager } from "../../platform/db/unit-of-work";
import type { Clock } from "../../platform/primitives";
import { organisationRepository } from "../core";
import type { AuthenticatedUser } from "./authenticated-user";
import {
  parseCapabilityCode,
  type AuthorizationDecision,
  type AuthorizationScope,
  type Capability,
  type Role,
  type RoleAssignment,
  type RoleCapability,
} from "./authorization-model";
import {
  evaluateAuthorization,
  type AuthorizationDenyPolicy,
  type LoadedRoleAssignment,
} from "./authorization-evaluator";
import { authorizationRepository } from "./authorization-repository";
import { AuthorizationDeniedError } from "./errors";
import { userProfileRepository } from "./repository";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export class AuthorizationService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly clock: Clock,
    private readonly policies: readonly AuthorizationDenyPolicy[] = [],
  ) {}

  async authorize(input: {
    user?: Readonly<AuthenticatedUser>;
    capability: string;
    scope: Readonly<AuthorizationScope>;
    resourceContext?: Readonly<Record<string, unknown>>;
  }): Promise<AuthorizationDecision> {
    const evaluatedAt = this.clock.nowUtc();

    if (!input.user) {
      return evaluateAuthorization({
        ...input,
        evaluatedAt,
        state: { scopeValid: true, assignments: [] },
        policies: this.policies,
      });
    }

    return await this.unitOfWork.withTransaction(async (uow) =>
      await this.authorizeWithin(uow, { ...input, user: input.user! }, evaluatedAt),
    );
  }

  async authorizeWithin(
    uow: UnitOfWork<DB>,
    input: {
      user: Readonly<AuthenticatedUser>;
      capability: string;
      scope: Readonly<AuthorizationScope>;
      resourceContext?: Readonly<Record<string, unknown>>;
    },
    evaluatedAt = this.clock.nowUtc(),
  ): Promise<AuthorizationDecision> {
    const profiles = uow.repository(userProfileRepository);
    const authorization = uow.repository(authorizationRepository);
    const organisations = uow.repository(organisationRepository);

    let requestedCapability: Capability | undefined;
    try {
      const code = parseCapabilityCode(input.capability);
      requestedCapability = await authorization.findCapabilityByCode(code);
    } catch {
      requestedCapability = undefined;
    }

    const profile = await profiles.findById(input.user.facilityUserId);

    let scopeValid = true;
    const organisation = await organisations.findOrganisation(input.scope.organisationId);
    if (!organisation || organisation.status !== "ACTIVE") {
      scopeValid = false;
    }

    if (scopeValid && input.scope.legalEntityId) {
      const legalEntity = await organisations.findLegalEntity(input.scope.legalEntityId);
      if (
        !legalEntity ||
        legalEntity.status !== "ACTIVE" ||
        legalEntity.organisationId !== input.scope.organisationId
      ) {
        scopeValid = false;
      }
    }

    if (scopeValid && input.scope.siteId) {
      const site = await organisations.findSite(input.scope.siteId);
      if (
        !site ||
        site.status !== "ACTIVE" ||
        site.organisationId !== input.scope.organisationId
      ) {
        scopeValid = false;
      }
    }

    if (
      scopeValid &&
      input.scope.siteId &&
      input.scope.legalEntityId &&
      !(await organisations.siteHasLegalEntity(input.scope.siteId, input.scope.legalEntityId))
    ) {
      scopeValid = false;
    }

    const assignments = await authorization.listAssignmentsForUser(
      input.user.facilityUserId,
    );
    const roleIds = unique(assignments.map((assignment) => assignment.roleId));
    const roles = await authorization.listRolesByIds(roleIds);
    const mappings = await authorization.listRoleCapabilities(roleIds);
    const capabilityIds = unique(
      mappings.map((mapping) => mapping.capabilityId),
    );
    const capabilities = await authorization.listCapabilitiesByIds(capabilityIds);

    const roleById = new Map<string, Role>(
      roles.map((role) => [role.id, role]),
    );
    const capabilityById = new Map<string, Capability>(
      capabilities.map((capability) => [capability.id, capability]),
    );
    const mappingsByRole = new Map<string, RoleCapability[]>();
    for (const mapping of mappings) {
      const current = mappingsByRole.get(mapping.roleId) ?? [];
      current.push(mapping);
      mappingsByRole.set(mapping.roleId, current);
    }

    const loadedAssignments: LoadedRoleAssignment[] = assignments.map(
      (assignment: RoleAssignment) => ({
        assignment,
        role: roleById.get(assignment.roleId),
        grants: (mappingsByRole.get(assignment.roleId) ?? []).map((mapping) => ({
          mapping,
          capability: capabilityById.get(mapping.capabilityId),
        })),
      }),
    );

    return evaluateAuthorization({
      ...input,
      evaluatedAt,
      state: {
        profileStatus: profile?.status,
        identityMatches: profile?.authUserId === input.user.authUserId,
        requestedCapability,
        scopeValid,
        assignments: loadedAssignments,
      },
      policies: this.policies,
    });
  }

  async requireWithin(
    uow: UnitOfWork<DB>,
    input: {
      user: Readonly<AuthenticatedUser>;
      capability: string;
      scope: Readonly<AuthorizationScope>;
      resourceContext?: Readonly<Record<string, unknown>>;
    },
    evaluatedAt = this.clock.nowUtc(),
  ): Promise<AuthorizationDecision> {
    const decision = await this.authorizeWithin(uow, input, evaluatedAt);
    if (!decision.allowed) {
      throw new AuthorizationDeniedError(decision.denialReason);
    }
    return decision;
  }

  async require(input: {
    user?: Readonly<AuthenticatedUser>;
    capability: string;
    scope: Readonly<AuthorizationScope>;
    resourceContext?: Readonly<Record<string, unknown>>;
  }): Promise<AuthorizationDecision> {
    const decision = await this.authorize(input);
    if (!decision.allowed) {
      throw new AuthorizationDeniedError(decision.denialReason);
    }
    return decision;
  }
}
