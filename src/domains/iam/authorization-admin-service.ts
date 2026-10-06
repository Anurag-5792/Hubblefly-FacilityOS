import "server-only";

import type { DB } from "../../platform/db/kysely.types";
import { OptimisticConcurrencyError } from "../../platform/db/optimistic-concurrency";
import type { UnitOfWorkManager } from "../../platform/db/unit-of-work";
import {
  ConcurrencyConflictError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type AggregateVersion,
  type Clock,
  type InternalId,
  type InternalIdFactory,
  type UtcTimestamp,
} from "../../platform/primitives";
import { organisationRepository } from "../core";
import {
  assignmentScopeLevel,
  parseCapabilityCode,
  parseRoleCode,
  type AuthorizationKind,
  type AuthorizationScope,
  type AuthorizationStatus,
} from "./authorization-model";
import { authorizationRepository } from "./authorization-repository";
import { userProfileRepository } from "./repository";

function cleanName(value: string, label: string, max: number): string {
  const result = value.trim();
  if (result.length < 2 || result.length > max) {
    throw new ValidationError(`${label} must be 2-${max} characters.`);
  }
  return result;
}

function cleanDescription(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const result = value.trim();
  if (result.length < 1 || result.length > 500) {
    throw new ValidationError("Description must be 1-500 characters.");
  }
  return result;
}

export class AuthorizationAdministrationService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async createRole(input: {
    code: string;
    displayName: string;
    description?: string;
    kind?: AuthorizationKind;
  }, actor: Readonly<ActorContext>): Promise<InternalId> {
    const code = parseRoleCode(input.code);
    return await this.unitOfWork.withTransaction(async (uow) => {
      const id = this.ids.next();
      await uow.repository(authorizationRepository).insertRole({
        id,
        code,
        displayName: cleanName(input.displayName, "Role display name", 120),
        description: cleanDescription(input.description),
        kind: input.kind ?? "CUSTOM",
        stamp: { at: this.clock.nowUtc(), actor },
      });
      return id;
    });
  }

  async registerCapability(input: {
    code: string;
    displayName: string;
    description?: string;
    kind?: AuthorizationKind;
  }, actor: Readonly<ActorContext>): Promise<InternalId> {
    const code = parseCapabilityCode(input.code);
    return await this.unitOfWork.withTransaction(async (uow) => {
      const id = this.ids.next();
      await uow.repository(authorizationRepository).insertCapability({
        id,
        code,
        displayName: cleanName(input.displayName, "Capability display name", 160),
        description: cleanDescription(input.description),
        kind: input.kind ?? "SYSTEM",
        stamp: { at: this.clock.nowUtc(), actor },
      });
      return id;
    });
  }

  async mapCapability(input: {
    roleId: InternalId;
    capabilityId: InternalId;
  }, actor: Readonly<ActorContext>): Promise<InternalId> {
    return await this.unitOfWork.withTransaction(async (uow) => {
      const repository = uow.repository(authorizationRepository);
      if (!(await repository.findRole(input.roleId))) throw new NotFoundError("Role");
      if (!(await repository.findCapability(input.capabilityId))) {
        throw new NotFoundError("Capability");
      }
      const id = this.ids.next();
      await repository.insertRoleCapability({
        id,
        roleId: input.roleId,
        capabilityId: input.capabilityId,
        stamp: { at: this.clock.nowUtc(), actor },
      });
      return id;
    });
  }

  async createAssignment(input: {
    userProfileId: InternalId;
    roleId: InternalId;
    scope: Readonly<AuthorizationScope>;
    validFrom?: UtcTimestamp;
    validUntil?: UtcTimestamp;
  }, actor: Readonly<ActorContext>): Promise<InternalId> {
    const validFrom = input.validFrom ?? this.clock.nowUtc();
    if (input.validUntil && input.validUntil <= validFrom) {
      throw new ValidationError("Role Assignment valid_until must be later than valid_from.");
    }

    return await this.unitOfWork.withTransaction(async (uow) => {
      const authorization = uow.repository(authorizationRepository);
      const organisations = uow.repository(organisationRepository);
      const profiles = uow.repository(userProfileRepository);

      if (!(await profiles.findById(input.userProfileId))) {
        throw new NotFoundError("FacilityOS user profile");
      }
      if (!(await authorization.findRole(input.roleId))) {
        throw new NotFoundError("Role");
      }

      const organisation = await organisations.findOrganisation(input.scope.organisationId);
      if (!organisation || organisation.status !== "ACTIVE") {
        throw new ValidationError("Assignment Organisation must exist and be active.");
      }

      if (input.scope.legalEntityId) {
        const legalEntity = await organisations.findLegalEntity(input.scope.legalEntityId);
        if (
          !legalEntity ||
          legalEntity.status !== "ACTIVE" ||
          legalEntity.organisationId !== input.scope.organisationId
        ) {
          throw new ValidationError(
            "Assignment Legal Entity must belong to the assignment Organisation and be active.",
          );
        }
      }

      if (input.scope.siteId) {
        const site = await organisations.findSite(input.scope.siteId);
        if (
          !site ||
          site.status !== "ACTIVE" ||
          site.organisationId !== input.scope.organisationId
        ) {
          throw new ValidationError(
            "Assignment Site must belong to the assignment Organisation and be active.",
          );
        }
      }

      if (
        input.scope.siteId &&
        input.scope.legalEntityId &&
        !(await organisations.siteHasLegalEntity(
          input.scope.siteId,
          input.scope.legalEntityId,
        ))
      ) {
        throw new ValidationError(
          "Assignment Site must be associated with the assignment Legal Entity.",
        );
      }

      const id = this.ids.next();
      await authorization.insertRoleAssignment({
        id,
        userProfileId: input.userProfileId,
        roleId: input.roleId,
        organisationId: input.scope.organisationId,
        legalEntityId: input.scope.legalEntityId,
        siteId: input.scope.siteId,
        scopeLevel: assignmentScopeLevel(input.scope),
        validFrom,
        validUntil: input.validUntil,
        stamp: { at: this.clock.nowUtc(), actor },
      });
      return id;
    });
  }

  async setRoleStatus(input: {
    roleId: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
  }, actor: Readonly<ActorContext>): Promise<void> {
    await this.versioned(async () => {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(authorizationRepository);
        if (!(await repository.findRole(input.roleId))) throw new NotFoundError("Role");
        await repository.updateRoleStatus({
          id: input.roleId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    });
  }

  async setCapabilityStatus(input: {
    capabilityId: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
  }, actor: Readonly<ActorContext>): Promise<void> {
    await this.versioned(async () => {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(authorizationRepository);
        if (!(await repository.findCapability(input.capabilityId))) {
          throw new NotFoundError("Capability");
        }
        await repository.updateCapabilityStatus({
          id: input.capabilityId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    });
  }

  async setRoleCapabilityStatus(input: {
    roleCapabilityId: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
  }, actor: Readonly<ActorContext>): Promise<void> {
    await this.versioned(async () => {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(authorizationRepository);
        if (!(await repository.findRoleCapability(input.roleCapabilityId))) {
          throw new NotFoundError("Role Capability");
        }
        await repository.updateRoleCapabilityStatus({
          id: input.roleCapabilityId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    });
  }

  async setAssignmentStatus(input: {
    assignmentId: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
  }, actor: Readonly<ActorContext>): Promise<void> {
    await this.versioned(async () => {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(authorizationRepository);
        if (!(await repository.findAssignment(input.assignmentId))) {
          throw new NotFoundError("Role Assignment");
        }
        await repository.updateAssignmentStatus({
          id: input.assignmentId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    });
  }

  private async versioned(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new ConcurrencyConflictError();
      }
      throw error;
    }
  }
}
