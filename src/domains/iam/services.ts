import type { DB } from "../../platform/db/kysely.types";
import { OptimisticConcurrencyError } from "../../platform/db/optimistic-concurrency";
import type { UnitOfWorkManager } from "../../platform/db/unit-of-work";
import {
  ConcurrencyConflictError,
  type ActorContext,
  type AggregateVersion,
  type Clock,
  type InternalId,
  type InternalIdFactory,
  precondition,
} from "../../platform/primitives";
import { userProfileRepository } from "./repository";
import {
  parseSupabaseAuthUserId,
  type SupabaseAuthUserId,
  type UserProfileStatus,
} from "./model";

function cleanDisplayName(value: string): string {
  const result = value.trim();
  precondition(result.length >= 1 && result.length <= 160, "Display name must be 1-160 characters.");
  return result;
}

function cleanEmailSnapshot(value?: string): string | undefined {
  if (!value) return undefined;
  const result = value.trim().toLowerCase();
  precondition(result.length >= 3 && result.length <= 320, "Email snapshot has an invalid length.");
  return result;
}

export class UserProfileService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async provision(input: {
    authUserId: string;
    displayName: string;
    emailSnapshot?: string;
  }, actor: Readonly<ActorContext>): Promise<InternalId> {
    const authUserId: SupabaseAuthUserId = parseSupabaseAuthUserId(input.authUserId);
    return await this.unitOfWork.withTransaction(async (uow) => {
      const repository = uow.repository(userProfileRepository);
      const existing = await repository.findByAuthUserId(authUserId);
      if (existing) return existing.id;

      const id = this.ids.next();
      const at = this.clock.nowUtc();
      await repository.insertProfile({
        id,
        authUserId,
        displayName: cleanDisplayName(input.displayName),
        emailSnapshot: cleanEmailSnapshot(input.emailSnapshot),
        stamp: { at, actor },
      });
      return id;
    });
  }

  async setStatus(input: {
    profileId: InternalId;
    expectedVersion: AggregateVersion;
    status: UserProfileStatus;
  }, actor: Readonly<ActorContext>): Promise<void> {
    try {
      await this.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(userProfileRepository).updateStatus({
          id: input.profileId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) throw new ConcurrencyConflictError();
      throw error;
    }
  }

  async updateDisplayName(input: {
    profileId: InternalId;
    expectedVersion: AggregateVersion;
    displayName: string;
  }, actor: Readonly<ActorContext>): Promise<void> {
    try {
      await this.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(userProfileRepository).updateDisplayName({
          id: input.profileId,
          expectedVersion: input.expectedVersion,
          displayName: cleanDisplayName(input.displayName),
          stamp: { at: this.clock.nowUtc(), actor },
        });
      });
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) throw new ConcurrencyConflictError();
      throw error;
    }
  }
}
