import "server-only";

import type { DB } from "../../platform/db/kysely.types";
import { OptimisticConcurrencyError } from "../../platform/db/optimistic-concurrency";
import type { UnitOfWork, UnitOfWorkManager } from "../../platform/db/unit-of-work";
import {
  ConcurrencyConflictError,
  ConflictError,
  type ActorContext,
  type AggregateVersion,
  type Clock,
  type InternalId,
  type InternalIdFactory,
  type OperationContext,
  NotFoundError,
  ValidationError,
  assertTransition,
  createTransitionPolicy,
  precondition,
} from "../../platform/primitives";
import {
  formatIdentifier,
  validateIdentifierPeriod,
  validateIdentifierTemplate,
} from "./identifier-format";
import type {
  IdentifierAllocation,
  IdentifierPeriod,
  OrganisationalStatus,
} from "./model";
import {
  identifierRepository,
  organisationRepository,
} from "./repository";

const statusPolicy = createTransitionPolicy<OrganisationalStatus>([
  { from: "ACTIVE", to: "INACTIVE" },
  { from: "INACTIVE", to: "ACTIVE" },
]);

function normaliseCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new ValidationError(
      "Code must be 2-32 uppercase letters, digits, underscore or hyphen and begin with a letter.",
    );
  }
  return code;
}

function requiredName(value: string, label: string): string {
  const name = value.trim();
  if (name.length < 2 || name.length > 200) {
    throw new ValidationError(`${label} must be 2-200 characters.`);
  }
  return name;
}

function stamp(clock: Clock, actor: Readonly<ActorContext>) {
  return { at: clock.nowUtc(), actor };
}

export class OrganisationService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async createOrganisation(
    input: { code: string; name: string },
    actor: Readonly<ActorContext>,
  ): Promise<InternalId> {
    return await this.unitOfWork.withTransaction(async (uow) => {
      const id = this.ids.next();
      await uow.repository(organisationRepository).insertOrganisation({
        id,
        code: normaliseCode(input.code),
        name: requiredName(input.name, "Organisation name"),
        stamp: stamp(this.clock, actor),
      });
      return id;
    });
  }

  async createLegalEntity(
    input: {
      organisationId: InternalId;
      code: string;
      legalName: string;
      displayName?: string;
      countryCode?: string;
    },
    actor: Readonly<ActorContext>,
  ): Promise<InternalId> {
    return await this.unitOfWork.withTransaction(async (uow) => {
      const repository = uow.repository(organisationRepository);
      if (!(await repository.findOrganisation(input.organisationId))) {
        throw new NotFoundError("Organisation");
      }

      const countryCode = input.countryCode?.trim().toUpperCase();
      if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
        throw new ValidationError("Country code must be a two-letter uppercase code.");
      }

      const id = this.ids.next();
      await repository.insertLegalEntity({
        id,
        organisationId: input.organisationId,
        code: normaliseCode(input.code),
        legalName: requiredName(input.legalName, "Legal name"),
        displayName: input.displayName?.trim() || undefined,
        countryCode,
        stamp: stamp(this.clock, actor),
      });
      return id;
    });
  }

  async createSite(
    input: {
      organisationId: InternalId;
      code: string;
      name: string;
      legalEntityIds: readonly InternalId[];
    },
    actor: Readonly<ActorContext>,
  ): Promise<InternalId> {
    precondition(
      input.legalEntityIds.length > 0,
      "Site must be associated with at least one Legal Entity.",
    );
    const distinctLegalEntityIds = [...new Set(input.legalEntityIds)];
    precondition(
      distinctLegalEntityIds.length === input.legalEntityIds.length,
      "Site Legal Entity associations must be unique.",
    );

    return await this.unitOfWork.withTransaction(async (uow) => {
      const repository = uow.repository(organisationRepository);
      if (!(await repository.findOrganisation(input.organisationId))) {
        throw new NotFoundError("Organisation");
      }

      for (const legalEntityId of distinctLegalEntityIds) {
        const legalEntity = await repository.findLegalEntity(legalEntityId);
        if (!legalEntity || legalEntity.organisationId !== input.organisationId) {
          throw new ValidationError(
            "Every Site Legal Entity must belong to the same Organisation as the Site.",
          );
        }
      }

      const id = this.ids.next();
      const relationIds = distinctLegalEntityIds.map(() => this.ids.next());
      await repository.insertSite({
        id,
        organisationId: input.organisationId,
        code: normaliseCode(input.code),
        name: requiredName(input.name, "Site name"),
        legalEntityIds: distinctLegalEntityIds,
        relationIds,
        stamp: stamp(this.clock, actor),
      });
      return id;
    });
  }

  async setOrganisationStatus(
    input: {
      organisationId: InternalId;
      expectedVersion: AggregateVersion;
      status: OrganisationalStatus;
    },
    actor: Readonly<ActorContext>,
  ): Promise<void> {
    try {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(organisationRepository);
        const current = await repository.findOrganisation(input.organisationId);
        if (!current) throw new NotFoundError("Organisation");
        if (current.version !== input.expectedVersion) {
          throw new ConcurrencyConflictError();
        }
        assertTransition(statusPolicy, current.status, input.status);
        await repository.updateOrganisationStatus({
          id: input.organisationId,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: stamp(this.clock, actor),
        });
      });
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new ConcurrencyConflictError();
      }
      throw error;
    }
  }
}

export class IdentifierService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async createSeries(
    input: {
      organisationId: InternalId;
      seriesKey: string;
      description?: string;
      formatTemplate: string;
      sequenceWidth: number;
      scopeLegalEntity?: boolean;
      scopeSite?: boolean;
      requiresPeriod?: boolean;
    },
    actor: Readonly<ActorContext>,
  ): Promise<InternalId> {
    validateIdentifierTemplate({
      formatTemplate: input.formatTemplate,
      sequenceWidth: input.sequenceWidth,
      requiresPeriod: input.requiresPeriod ?? false,
    });

    return await this.unitOfWork.withTransaction(async (uow) => {
      const organisation = await uow
        .repository(organisationRepository)
        .findOrganisation(input.organisationId);
      if (!organisation) throw new NotFoundError("Organisation");

      const seriesKey = input.seriesKey.trim();
      if (!/^[a-z][a-z0-9._-]{0,79}$/.test(seriesKey)) {
        throw new ValidationError("Identifier series key has an invalid format.");
      }

      const id = this.ids.next();
      await uow.repository(identifierRepository).insertSeries({
        id,
        organisationId: input.organisationId,
        seriesKey,
        description: input.description?.trim() || undefined,
        formatTemplate: input.formatTemplate,
        sequenceWidth: input.sequenceWidth,
        scopeLegalEntity: input.scopeLegalEntity ?? false,
        scopeSite: input.scopeSite ?? false,
        requiresPeriod: input.requiresPeriod ?? false,
        stamp: stamp(this.clock, actor),
      });
      return id;
    });
  }

  async setSeriesStatus(
    input: {
      organisationId: InternalId;
      seriesKey: string;
      expectedVersion: AggregateVersion;
      status: OrganisationalStatus;
    },
    actor: Readonly<ActorContext>,
  ): Promise<void> {
    try {
      await this.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(identifierRepository);
        const series = await repository.findSeries(
          input.organisationId,
          input.seriesKey,
        );
        if (!series) throw new NotFoundError("Identifier series");
        if (series.version !== input.expectedVersion) {
          throw new ConcurrencyConflictError();
        }
        assertTransition(statusPolicy, series.status, input.status);
        await repository.updateSeriesStatus({
          id: series.id,
          expectedVersion: input.expectedVersion,
          status: input.status,
          stamp: stamp(this.clock, actor),
        });
      });
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new ConcurrencyConflictError();
      }
      throw error;
    }
  }

  async allocateIdentifier(
    input: {
      organisationId: InternalId;
      seriesKey: string;
      legalEntityId?: InternalId;
      siteId?: InternalId;
      period?: IdentifierPeriod;
    },
    actor: Readonly<ActorContext>,
    operation: Readonly<OperationContext>,
  ): Promise<IdentifierAllocation> {
    return await this.unitOfWork.withTransaction(async (uow) =>
      await this.allocateIdentifierWithin(uow, input, actor, operation),
    );
  }

  async allocateIdentifierWithin(
    uow: UnitOfWork<DB>,
    input: {
      organisationId: InternalId;
      seriesKey: string;
      legalEntityId?: InternalId;
      siteId?: InternalId;
      period?: IdentifierPeriod;
    },
    actor: Readonly<ActorContext>,
    operation: Readonly<OperationContext>,
  ): Promise<IdentifierAllocation> {
    const identifiers = uow.repository(identifierRepository);
    const organisations = uow.repository(organisationRepository);
    const series = await identifiers.findSeries(
      input.organisationId,
      input.seriesKey,
    );
    if (!series) throw new NotFoundError("Identifier series");
    if (series.status !== "ACTIVE") {
      throw new ConflictError("Identifier series is inactive.");
    }

    if (series.scopeLegalEntity !== (input.legalEntityId !== undefined)) {
      throw new ValidationError(
        series.scopeLegalEntity
          ? "Legal Entity scope is required for this identifier series."
          : "Legal Entity scope is not allowed for this identifier series.",
      );
    }
    if (series.scopeSite !== (input.siteId !== undefined)) {
      throw new ValidationError(
        series.scopeSite
          ? "Site scope is required for this identifier series."
          : "Site scope is not allowed for this identifier series.",
      );
    }
    if (series.requiresPeriod !== (input.period !== undefined)) {
      throw new ValidationError(
        series.requiresPeriod
          ? "Period is required for this identifier series."
          : "Period is not allowed for this identifier series.",
      );
    }
    if (input.period) validateIdentifierPeriod(input.period);

    if (input.legalEntityId) {
      const legalEntity = await organisations.findLegalEntity(input.legalEntityId);
      if (!legalEntity || legalEntity.organisationId !== input.organisationId) {
        throw new ValidationError("Legal Entity scope is outside the identifier Organisation.");
      }
    }

    if (input.siteId) {
      const site = await organisations.findSite(input.siteId);
      if (!site || site.organisationId !== input.organisationId) {
        throw new ValidationError("Site scope is outside the identifier Organisation.");
      }
    }

    if (input.siteId && input.legalEntityId) {
      if (!(await organisations.siteHasLegalEntity(input.siteId, input.legalEntityId))) {
        throw new ValidationError(
          "The scoped Site is not associated with the scoped Legal Entity.",
        );
      }
    }

    const currentStamp = stamp(this.clock, actor);
    const sequenceId = await identifiers.ensureSequence({
      id: this.ids.next(),
      series,
      legalEntityId: input.legalEntityId,
      siteId: input.siteId,
      period: input.period,
      stamp: currentStamp,
    });

    const sequenceValue = await identifiers.takeNextSequenceValue({
      sequenceId,
      stamp: currentStamp,
    });
    const identifier = formatIdentifier(series, sequenceValue, input.period);
    const allocationId = this.ids.next();

    await identifiers.insertAllocation({
      id: allocationId,
      sequenceId,
      series,
      legalEntityId: input.legalEntityId,
      siteId: input.siteId,
      period: input.period,
      sequenceValue,
      identifier,
      allocatedAt: currentStamp.at,
      actor,
      requestId: operation.requestId,
      commandId: operation.commandId,
      correlationId: operation.correlationId,
      causationId: operation.causationId,
    });

    return {
      id: allocationId,
      seriesId: series.id,
      sequenceId,
      organisationId: series.organisationId,
      legalEntityId: input.legalEntityId,
      siteId: input.siteId,
      period: input.period,
      sequenceValue,
      identifier,
      allocatedAt: currentStamp.at,
    };
  }
}
