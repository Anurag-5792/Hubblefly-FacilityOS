import "server-only";

import { sql, type Transaction } from "kysely";
import type { DB } from "../../platform/db/kysely.types";
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
  parseSupabaseAuthUserId,
  type SupabaseAuthUserId,
  type UserProfile,
  type UserProfileStatus,
} from "./model";

export interface UserProfileAuditStamp {
  readonly at: UtcTimestamp;
  readonly actor: Readonly<ActorContext>;
}

function mapProfile(row: {
  id: string;
  auth_user_id: string;
  display_name: string;
  email_snapshot: string | null;
  status: string;
  version: string | number | bigint;
  created_at: Date | string;
  updated_at: Date | string;
}): UserProfile {
  return {
    id: parseInternalId(row.id),
    authUserId: parseSupabaseAuthUserId(row.auth_user_id),
    displayName: row.display_name,
    emailSnapshot: row.email_snapshot ?? undefined,
    status: row.status as UserProfileStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

export class UserProfileRepository extends TransactionalRepository<DB> {
  constructor(transaction: Transaction<DB>) {
    super(transaction);
  }

  async insertProfile(input: {
    id: InternalId;
    authUserId: SupabaseAuthUserId;
    displayName: string;
    emailSnapshot?: string;
    stamp: UserProfileAuditStamp;
  }): Promise<void> {
    await this.transaction.insertInto("iam.user_profile").values({
      id: input.id,
      auth_user_id: input.authUserId,
      display_name: input.displayName,
      email_snapshot: input.emailSnapshot ?? null,
      status: "ACTIVE",
      version: 0,
      created_at: input.stamp.at,
      created_actor_type: input.stamp.actor.actorType,
      created_actor_id: input.stamp.actor.actorId,
      updated_at: input.stamp.at,
      updated_actor_type: input.stamp.actor.actorType,
      updated_actor_id: input.stamp.actor.actorId,
    }).executeTakeFirstOrThrow();
  }

  async findByAuthUserId(authUserId: SupabaseAuthUserId): Promise<UserProfile | undefined> {
    const row = await this.transaction.selectFrom("iam.user_profile")
      .selectAll().where("auth_user_id", "=", authUserId).executeTakeFirst();
    return row ? mapProfile(row) : undefined;
  }

  async findById(id: InternalId): Promise<UserProfile | undefined> {
    const row = await this.transaction.selectFrom("iam.user_profile")
      .selectAll().where("id", "=", id).executeTakeFirst();
    return row ? mapProfile(row) : undefined;
  }

  async updateStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: UserProfileStatus;
    stamp: UserProfileAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.user_profile")
      .set({
        status: input.status,
        version: sql<string>`version + 1`,
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: input.stamp.actor.actorId,
      })
      .where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();

    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "UserProfile",
      aggregateId: input.id,
      expectedVersion: input.expectedVersion,
    });
  }

  async updateDisplayName(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    displayName: string;
    stamp: UserProfileAuditStamp;
  }): Promise<void> {
    const result = await this.transaction.updateTable("iam.user_profile")
      .set({
        display_name: input.displayName,
        version: sql<string>`version + 1`,
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: input.stamp.actor.actorId,
      })
      .where("id", "=", input.id)
      .where("version", "=", String(input.expectedVersion))
      .executeTakeFirst();

    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "UserProfile",
      aggregateId: input.id,
      expectedVersion: input.expectedVersion,
    });
  }
}

export const userProfileRepository = (transaction: Transaction<DB>) =>
  new UserProfileRepository(transaction);
