import "server-only";

import { sql, type Selectable, type Transaction } from "kysely";

import type {
  DB,
  IamCapability,
  IamRole,
  IamRoleAssignment,
  IamRoleCapability,
} from "../../platform/db/kysely.types";
import { assertSingleVersionedUpdate } from "../../platform/db/optimistic-concurrency";
import { TransactionalRepository } from "../../platform/db/repository";
import {
  parseAggregateVersion,
  parseInternalId,
  parseUtcTimestamp,
  type ActorContext,
  type AggregateVersion,
  type InternalId,
  type UtcTimestamp,
} from "../../platform/primitives";
import {
  parseCapabilityCode,
  parseRoleCode,
  type AuthorizationKind,
  type AuthorizationScopeLevel,
  type AuthorizationStatus,
  type Capability,
  type Role,
  type RoleAssignment,
  type RoleCapability,
} from "./authorization-model";

export interface AuthorizationAuditStamp {
  readonly at: UtcTimestamp;
  readonly actor: Readonly<ActorContext>;
}

function roleFromRow(row: Selectable<IamRole>): Role {
  return {
    id: parseInternalId(row.id),
    code: parseRoleCode(row.code),
    displayName: row.display_name,
    description: row.description ?? undefined,
    kind: row.kind as AuthorizationKind,
    status: row.status as AuthorizationStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function capabilityFromRow(row: Selectable<IamCapability>): Capability {
  return {
    id: parseInternalId(row.id),
    code: parseCapabilityCode(row.code),
    displayName: row.display_name,
    description: row.description ?? undefined,
    kind: row.kind as AuthorizationKind,
    status: row.status as AuthorizationStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function roleCapabilityFromRow(row: Selectable<IamRoleCapability>): RoleCapability {
  return {
    id: parseInternalId(row.id),
    roleId: parseInternalId(row.role_id),
    capabilityId: parseInternalId(row.capability_id),
    status: row.status as AuthorizationStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function assignmentFromRow(row: Selectable<IamRoleAssignment>): RoleAssignment {
  return {
    id: parseInternalId(row.id),
    userProfileId: parseInternalId(row.user_profile_id),
    roleId: parseInternalId(row.role_id),
    organisationId: parseInternalId(row.organisation_id),
    legalEntityId: row.legal_entity_id ? parseInternalId(row.legal_entity_id) : undefined,
    siteId: row.site_id ? parseInternalId(row.site_id) : undefined,
    scopeLevel: row.scope_level as AuthorizationScopeLevel,
    validFrom: parseUtcTimestamp(new Date(row.valid_from).toISOString()),
    validUntil: row.valid_until
      ? parseUtcTimestamp(new Date(row.valid_until).toISOString())
      : undefined,
    status: row.status as AuthorizationStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function actorId(actor: ActorContext): string {
  return actor.actorId;
}

export class AuthorizationRepository extends TransactionalRepository<DB> {
  constructor(transaction: Transaction<DB>) {
    super(transaction);
  }

  async insertRole(input: {
    id: InternalId;
    code: string;
    displayName: string;
    description?: string;
    kind: AuthorizationKind;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    await this.transaction.insertInto("iam.role").values({
      id: input.id,
      code: input.code,
      display_name: input.displayName,
      description: input.description ?? null,
      kind: input.kind,
      status: "ACTIVE",
      version: 0,
      created_at: input.stamp.at,
      created_actor_type: input.stamp.actor.actorType,
      created_actor_id: actorId(input.stamp.actor),
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).executeTakeFirstOrThrow();
  }

  async insertCapability(input: {
    id: InternalId;
    code: string;
    displayName: string;
    description?: string;
    kind: AuthorizationKind;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    await this.transaction.insertInto("iam.capability").values({
      id: input.id,
      code: input.code,
      display_name: input.displayName,
      description: input.description ?? null,
      kind: input.kind,
      status: "ACTIVE",
      version: 0,
      created_at: input.stamp.at,
      created_actor_type: input.stamp.actor.actorType,
      created_actor_id: actorId(input.stamp.actor),
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).executeTakeFirstOrThrow();
  }

  async insertRoleCapability(input: {
    id: InternalId;
    roleId: InternalId;
    capabilityId: InternalId;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    await this.transaction.insertInto("iam.role_capability").values({
      id: input.id,
      role_id: input.roleId,
      capability_id: input.capabilityId,
      status: "ACTIVE",
      version: 0,
      created_at: input.stamp.at,
      created_actor_type: input.stamp.actor.actorType,
      created_actor_id: actorId(input.stamp.actor),
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).executeTakeFirstOrThrow();
  }

  async insertRoleAssignment(input: {
    id: InternalId;
    userProfileId: InternalId;
    roleId: InternalId;
    organisationId: InternalId;
    legalEntityId?: InternalId;
    siteId?: InternalId;
    scopeLevel: AuthorizationScopeLevel;
    validFrom: UtcTimestamp;
    validUntil?: UtcTimestamp;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    await this.transaction.insertInto("iam.role_assignment").values({
      id: input.id,
      user_profile_id: input.userProfileId,
      role_id: input.roleId,
      organisation_id: input.organisationId,
      legal_entity_id: input.legalEntityId ?? null,
      site_id: input.siteId ?? null,
      scope_level: input.scopeLevel,
      valid_from: input.validFrom,
      valid_until: input.validUntil ?? null,
      status: "ACTIVE",
      version: 0,
      created_at: input.stamp.at,
      created_actor_type: input.stamp.actor.actorType,
      created_actor_id: actorId(input.stamp.actor),
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).executeTakeFirstOrThrow();
  }

  async findRole(id: InternalId): Promise<Role | undefined> {
    const row = await this.transaction.selectFrom("iam.role")
      .selectAll().where("id", "=", id).executeTakeFirst();
    return row ? roleFromRow(row) : undefined;
  }

  async findRoleByCode(code: string): Promise<Role | undefined> {
    const row = await this.transaction.selectFrom("iam.role")
      .selectAll().where("code", "=", code).executeTakeFirst();
    return row ? roleFromRow(row) : undefined;
  }

  async findCapability(id: InternalId): Promise<Capability | undefined> {
    const row = await this.transaction.selectFrom("iam.capability")
      .selectAll().where("id", "=", id).executeTakeFirst();
    return row ? capabilityFromRow(row) : undefined;
  }

  async findCapabilityByCode(code: string): Promise<Capability | undefined> {
    const row = await this.transaction.selectFrom("iam.capability")
      .selectAll().where("code", "=", code).executeTakeFirst();
    return row ? capabilityFromRow(row) : undefined;
  }

  async findRoleCapability(id: InternalId): Promise<RoleCapability | undefined> {
    const row = await this.transaction.selectFrom("iam.role_capability")
      .selectAll().where("id", "=", id).executeTakeFirst();
    return row ? roleCapabilityFromRow(row) : undefined;
  }

  async findAssignment(id: InternalId): Promise<RoleAssignment | undefined> {
    const row = await this.transaction.selectFrom("iam.role_assignment")
      .selectAll().where("id", "=", id).executeTakeFirst();
    return row ? assignmentFromRow(row) : undefined;
  }

  async listAssignmentsForUser(userProfileId: InternalId): Promise<RoleAssignment[]> {
    const rows = await this.transaction.selectFrom("iam.role_assignment")
      .selectAll()
      .where("user_profile_id", "=", userProfileId)
      .orderBy("id")
      .execute();
    return rows.map(assignmentFromRow);
  }

  async listRolesByIds(ids: readonly InternalId[]): Promise<Role[]> {
    if (ids.length === 0) return [];
    const rows = await this.transaction.selectFrom("iam.role")
      .selectAll()
      .where("id", "in", [...ids])
      .execute();
    return rows.map(roleFromRow);
  }

  async listRoleCapabilities(roleIds: readonly InternalId[]): Promise<RoleCapability[]> {
    if (roleIds.length === 0) return [];
    const rows = await this.transaction.selectFrom("iam.role_capability")
      .selectAll()
      .where("role_id", "in", [...roleIds])
      .execute();
    return rows.map(roleCapabilityFromRow);
  }

  async listCapabilitiesByIds(ids: readonly InternalId[]): Promise<Capability[]> {
    if (ids.length === 0) return [];
    const rows = await this.transaction.selectFrom("iam.capability")
      .selectAll()
      .where("id", "in", [...ids])
      .execute();
    return rows.map(capabilityFromRow);
  }

  async updateRoleStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.role").set({
      status: input.status,
      version: sql<string>`version + 1`,
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();
    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "Role", aggregateId: input.id, expectedVersion: input.expectedVersion,
    });
  }

  async updateCapabilityStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.capability").set({
      status: input.status,
      version: sql<string>`version + 1`,
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();
    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "Capability", aggregateId: input.id, expectedVersion: input.expectedVersion,
    });
  }

  async updateRoleCapabilityStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.role_capability").set({
      status: input.status,
      version: sql<string>`version + 1`,
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();
    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "RoleCapability", aggregateId: input.id, expectedVersion: input.expectedVersion,
    });
  }

  async updateAssignmentStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: AuthorizationStatus;
    stamp: AuthorizationAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.role_assignment").set({
      status: input.status,
      version: sql<string>`version + 1`,
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: actorId(input.stamp.actor),
    }).where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();
    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "RoleAssignment", aggregateId: input.id, expectedVersion: input.expectedVersion,
    });
  }
}

export const authorizationRepository = (transaction: Transaction<DB>) =>
  new AuthorizationRepository(transaction);
