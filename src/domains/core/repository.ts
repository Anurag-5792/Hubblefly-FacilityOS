import "server-only";

import { sql, type Transaction } from "kysely";

import type { DB } from "../../platform/db/kysely.types";
import { assertSingleVersionedUpdate } from "../../platform/db/optimistic-concurrency";
import { TransactionalRepository } from "../../platform/db/repository";
import type {
  ActorContext,
  AggregateVersion,
  InternalId,
  UtcTimestamp,
} from "../../platform/primitives";
import {
  parseAggregateVersion,
  parseInternalId,
  parseUtcTimestamp,
} from "../../platform/primitives";
import type {
  IdentifierAllocation,
  IdentifierPeriod,
  IdentifierSeries,
  LegalEntity,
  Organisation,
  OrganisationalStatus,
  Site,
} from "./model";

export interface AuditStamp {
  readonly at: UtcTimestamp;
  readonly actor: Readonly<ActorContext>;
}

function actorId(actor: ActorContext): string {
  return actor.actorId;
}

function toOrganisation(row: {
  id: string;
  code: string;
  name: string;
  status: string;
  version: string | number | bigint;
  created_at: Date | string;
  updated_at: Date | string;
}): Organisation {
  return {
    id: parseInternalId(row.id),
    code: row.code,
    name: row.name,
    status: row.status as OrganisationalStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function toLegalEntity(row: {
  id: string;
  organisation_id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  country_code: string | null;
  status: string;
  version: string | number | bigint;
  created_at: Date | string;
  updated_at: Date | string;
}): LegalEntity {
  return {
    id: parseInternalId(row.id),
    organisationId: parseInternalId(row.organisation_id),
    code: row.code,
    legalName: row.legal_name,
    displayName: row.display_name ?? undefined,
    countryCode: row.country_code ?? undefined,
    status: row.status as OrganisationalStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function toSite(row: {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  status: string;
  version: string | number | bigint;
  created_at: Date | string;
  updated_at: Date | string;
}): Site {
  return {
    id: parseInternalId(row.id),
    organisationId: parseInternalId(row.organisation_id),
    code: row.code,
    name: row.name,
    status: row.status as OrganisationalStatus,
    version: parseAggregateVersion(Number(row.version)),
    createdAt: parseUtcTimestamp(new Date(row.created_at).toISOString()),
    updatedAt: parseUtcTimestamp(new Date(row.updated_at).toISOString()),
  };
}

function toSeries(row: {
  id: string;
  organisation_id: string;
  series_key: string;
  description: string | null;
  format_template: string;
  sequence_width: number;
  scope_legal_entity: boolean;
  scope_site: boolean;
  requires_period: boolean;
  status: string;
  version: string | number | bigint;
}): IdentifierSeries {
  return {
    id: parseInternalId(row.id),
    organisationId: parseInternalId(row.organisation_id),
    seriesKey: row.series_key,
    description: row.description ?? undefined,
    formatTemplate: row.format_template,
    sequenceWidth: Number(row.sequence_width),
    scopeLegalEntity: row.scope_legal_entity,
    scopeSite: row.scope_site,
    requiresPeriod: row.requires_period,
    status: row.status as OrganisationalStatus,
    version: parseAggregateVersion(Number(row.version)),
  };
}

export class OrganisationRepository extends TransactionalRepository<DB> {
  constructor(transaction: Transaction<DB>) {
    super(transaction);
  }

  async insertOrganisation(input: {
    id: InternalId;
    code: string;
    name: string;
    stamp: AuditStamp;
  }): Promise<void> {
    await this.transaction
      .insertInto("core.organisation")
      .values({
        id: input.id,
        code: input.code,
        name: input.name,
        status: "ACTIVE",
        version: 0,
        created_at: input.stamp.at,
        created_actor_type: input.stamp.actor.actorType,
        created_actor_id: actorId(input.stamp.actor),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .executeTakeFirstOrThrow();
  }

  async findOrganisation(id: InternalId): Promise<Organisation | undefined> {
    const row = await this.transaction
      .selectFrom("core.organisation")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toOrganisation(row) : undefined;
  }

  async updateOrganisationStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: OrganisationalStatus;
    stamp: AuditStamp;
  }): Promise<void> {
    const result = await this.transaction
      .updateTable("core.organisation")
      .set((expression) => ({
        status: input.status,
        version: expression("version", "+", 1),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      }))
      .where("id", "=", input.id)
      .where("version", "=", input.expectedVersion)
      .executeTakeFirst();

    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "Organisation",
      aggregateId: input.id,
      expectedVersion: input.expectedVersion,
    });
  }

  async insertLegalEntity(input: {
    id: InternalId;
    organisationId: InternalId;
    code: string;
    legalName: string;
    displayName?: string;
    countryCode?: string;
    stamp: AuditStamp;
  }): Promise<void> {
    await this.transaction
      .insertInto("core.legal_entity")
      .values({
        id: input.id,
        organisation_id: input.organisationId,
        code: input.code,
        legal_name: input.legalName,
        display_name: input.displayName ?? null,
        country_code: input.countryCode ?? null,
        status: "ACTIVE",
        version: 0,
        created_at: input.stamp.at,
        created_actor_type: input.stamp.actor.actorType,
        created_actor_id: actorId(input.stamp.actor),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .executeTakeFirstOrThrow();
  }

  async findLegalEntity(id: InternalId): Promise<LegalEntity | undefined> {
    const row = await this.transaction
      .selectFrom("core.legal_entity")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toLegalEntity(row) : undefined;
  }

  async insertSite(input: {
    id: InternalId;
    organisationId: InternalId;
    code: string;
    name: string;
    legalEntityIds: readonly InternalId[];
    relationIds: readonly InternalId[];
    stamp: AuditStamp;
  }): Promise<void> {
    await this.transaction
      .insertInto("core.site")
      .values({
        id: input.id,
        organisation_id: input.organisationId,
        code: input.code,
        name: input.name,
        status: "ACTIVE",
        version: 0,
        created_at: input.stamp.at,
        created_actor_type: input.stamp.actor.actorType,
        created_actor_id: actorId(input.stamp.actor),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .executeTakeFirstOrThrow();

    await this.transaction
      .insertInto("core.site_legal_entity")
      .values(
        input.legalEntityIds.map((legalEntityId, index) => ({
          id: input.relationIds[index]!,
          organisation_id: input.organisationId,
          site_id: input.id,
          legal_entity_id: legalEntityId,
          status: "ACTIVE",
          version: 0,
          created_at: input.stamp.at,
          created_actor_type: input.stamp.actor.actorType,
          created_actor_id: actorId(input.stamp.actor),
          updated_at: input.stamp.at,
          updated_actor_type: input.stamp.actor.actorType,
          updated_actor_id: actorId(input.stamp.actor),
        })),
      )
      .execute();
  }

  async findSite(id: InternalId): Promise<Site | undefined> {
    const row = await this.transaction
      .selectFrom("core.site")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toSite(row) : undefined;
  }

  async countLegalEntitiesForSite(siteId: InternalId): Promise<number> {
    const row = await this.transaction
      .selectFrom("core.site_legal_entity")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("site_id", "=", siteId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async siteHasLegalEntity(siteId: InternalId, legalEntityId: InternalId): Promise<boolean> {
    const row = await this.transaction
      .selectFrom("core.site_legal_entity")
      .select("id")
      .where("site_id", "=", siteId)
      .where("legal_entity_id", "=", legalEntityId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    return row !== undefined;
  }
}

export class IdentifierRepository extends TransactionalRepository<DB> {
  constructor(transaction: Transaction<DB>) {
    super(transaction);
  }

  async insertSeries(input: {
    id: InternalId;
    organisationId: InternalId;
    seriesKey: string;
    description?: string;
    formatTemplate: string;
    sequenceWidth: number;
    scopeLegalEntity: boolean;
    scopeSite: boolean;
    requiresPeriod: boolean;
    stamp: AuditStamp;
  }): Promise<void> {
    await this.transaction
      .insertInto("core.identifier_series")
      .values({
        id: input.id,
        organisation_id: input.organisationId,
        series_key: input.seriesKey,
        description: input.description ?? null,
        format_template: input.formatTemplate,
        sequence_width: input.sequenceWidth,
        scope_legal_entity: input.scopeLegalEntity,
        scope_site: input.scopeSite,
        requires_period: input.requiresPeriod,
        status: "ACTIVE",
        version: 0,
        created_at: input.stamp.at,
        created_actor_type: input.stamp.actor.actorType,
        created_actor_id: actorId(input.stamp.actor),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .executeTakeFirstOrThrow();
  }

  async findSeries(
    organisationId: InternalId,
    seriesKey: string,
  ): Promise<IdentifierSeries | undefined> {
    const row = await this.transaction
      .selectFrom("core.identifier_series")
      .selectAll()
      .where("organisation_id", "=", organisationId)
      .where("series_key", "=", seriesKey)
      .executeTakeFirst();
    return row ? toSeries(row) : undefined;
  }

  async updateSeriesStatus(input: {
    id: InternalId;
    expectedVersion: AggregateVersion;
    status: OrganisationalStatus;
    stamp: AuditStamp;
  }): Promise<void> {
    const result = await this.transaction
      .updateTable("core.identifier_series")
      .set((expression) => ({
        status: input.status,
        version: expression("version", "+", 1),
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      }))
      .where("id", "=", input.id)
      .where("version", "=", input.expectedVersion)
      .executeTakeFirst();

    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "IdentifierSeries",
      aggregateId: input.id,
      expectedVersion: input.expectedVersion,
    });
  }

  async ensureSequence(input: {
    id: InternalId;
    series: IdentifierSeries;
    legalEntityId?: InternalId;
    siteId?: InternalId;
    period?: IdentifierPeriod;
    stamp: AuditStamp;
  }): Promise<InternalId> {
    await this.transaction
      .insertInto("core.identifier_sequence")
      .values({
        id: input.id,
        series_id: input.series.id,
        organisation_id: input.series.organisationId,
        legal_entity_id: input.legalEntityId ?? null,
        site_id: input.siteId ?? null,
        period_key: input.period?.key ?? null,
        period_token: input.period?.token ?? null,
        next_value: 1,
        version: 0,
        created_at: input.stamp.at,
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .onConflict((conflict) =>
        conflict
          .columns([
            "series_id",
            "organisation_id",
            "legal_entity_id",
            "site_id",
            "period_key",
          ])
          .doNothing(),
      )
      .execute();

    let query = this.transaction
      .selectFrom("core.identifier_sequence")
      .select("id")
      .where("series_id", "=", input.series.id)
      .where("organisation_id", "=", input.series.organisationId);

    query = input.legalEntityId
      ? query.where("legal_entity_id", "=", input.legalEntityId)
      : query.where("legal_entity_id", "is", null);
    query = input.siteId
      ? query.where("site_id", "=", input.siteId)
      : query.where("site_id", "is", null);
    query = input.period
      ? query.where("period_key", "=", input.period.key)
      : query.where("period_key", "is", null);

    const row = await query.executeTakeFirstOrThrow();
    return parseInternalId(row.id);
  }

  async takeNextSequenceValue(input: {
    sequenceId: InternalId;
    stamp: AuditStamp;
  }): Promise<number> {
    const row = await this.transaction
      .updateTable("core.identifier_sequence")
      .set({
        next_value: sql<number>`next_value + 1`,
        version: sql<number>`version + 1`,
        updated_at: input.stamp.at,
        updated_actor_type: input.stamp.actor.actorType,
        updated_actor_id: actorId(input.stamp.actor),
      })
      .where("id", "=", input.sequenceId)
      .returning("next_value")
      .executeTakeFirstOrThrow();

    return Number(row.next_value) - 1;
  }

  async insertAllocation(input: {
    id: InternalId;
    sequenceId: InternalId;
    series: IdentifierSeries;
    legalEntityId?: InternalId;
    siteId?: InternalId;
    period?: IdentifierPeriod;
    sequenceValue: number;
    identifier: string;
    allocatedAt: UtcTimestamp;
    actor: Readonly<ActorContext>;
    requestId: string;
    commandId: string;
    correlationId: string;
    causationId?: string;
  }): Promise<void> {
    await this.transaction
      .insertInto("core.identifier_allocation")
      .values({
        id: input.id,
        series_id: input.series.id,
        sequence_id: input.sequenceId,
        organisation_id: input.series.organisationId,
        legal_entity_id: input.legalEntityId ?? null,
        site_id: input.siteId ?? null,
        period_key: input.period?.key ?? null,
        period_token: input.period?.token ?? null,
        sequence_value: input.sequenceValue,
        identifier_value: input.identifier,
        allocated_at: input.allocatedAt,
        allocated_actor_type: input.actor.actorType,
        allocated_actor_id: actorId(input.actor),
        request_id: input.requestId,
        command_id: input.commandId,
        correlation_id: input.correlationId,
        causation_id: input.causationId ?? null,
      })
      .executeTakeFirstOrThrow();
  }

  async findAllocation(identifier: string): Promise<IdentifierAllocation | undefined> {
    const row = await this.transaction
      .selectFrom("core.identifier_allocation")
      .selectAll()
      .where("identifier_value", "=", identifier)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      id: parseInternalId(row.id),
      seriesId: parseInternalId(row.series_id),
      sequenceId: parseInternalId(row.sequence_id),
      organisationId: parseInternalId(row.organisation_id),
      legalEntityId: row.legal_entity_id ? parseInternalId(row.legal_entity_id) : undefined,
      siteId: row.site_id ? parseInternalId(row.site_id) : undefined,
      period:
        row.period_key && row.period_token
          ? { key: row.period_key, token: row.period_token }
          : undefined,
      sequenceValue: Number(row.sequence_value),
      identifier: row.identifier_value,
      allocatedAt: parseUtcTimestamp(new Date(row.allocated_at).toISOString()),
    };
  }
}

export const organisationRepository = (transaction: Transaction<DB>) =>
  new OrganisationRepository(transaction);

export const identifierRepository = (transaction: Transaction<DB>) =>
  new IdentifierRepository(transaction);
