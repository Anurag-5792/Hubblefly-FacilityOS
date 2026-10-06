import type { Transaction } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DB } from "../../../src/platform/db/kysely.types";
import {
  DatabaseForeignKeyViolationError,
  DatabaseUniqueViolationError,
} from "../../../src/platform/db/errors";
import {
  createPostgresPool,
} from "../../../src/platform/db/pool";
import { parseDatabaseRuntimeConfig } from "../../../src/platform/db/config";
import {
  createDatabaseRuntime,
  type DatabaseRuntime,
} from "../../../src/platform/db/runtime";
import {
  IdentifierService,
  OrganisationService,
} from "../../../src/domains/core/services";
import {
  identifierRepository,
  organisationRepository,
  OrganisationRepository,
} from "../../../src/domains/core/repository";
import {
  ConcurrencyConflictError,
  ConflictError,
  FixedClock,
  parseActorContext,
  parseAggregateVersion,
  parseCommandId,
  parseCorrelationId,
  parseInternalId,
  parseRequestId,
  createOperationContext,
} from "../../../src/platform/primitives";
import { SequentialUuidFactory } from "../../helpers/sequential-uuid-factory";

let runtime: DatabaseRuntime<DB>;
let ids: SequentialUuidFactory;
const clock = new FixedClock("2026-10-06T08:00:00.000Z");
const actor = parseActorContext({
  actorType: "HUMAN",
  actorId: "w0-05-test-human",
  requestId: "request-w0-05",
});

function operation(index: number) {
  const suffix = index.toString(16).padStart(12, "0");
  const uuid = `10000000-0000-4000-8000-${suffix}`;
  return createOperationContext({
    requestId: parseRequestId(`request-${index}`),
    commandId: parseCommandId(uuid),
    correlationId: parseCorrelationId(uuid),
  });
}

function services() {
  return {
    organisations: new OrganisationService(runtime.unitOfWork, clock, ids),
    identifiers: new IdentifierService(runtime.unitOfWork, clock, ids),
  };
}

beforeAll(async () => {
  const config = parseDatabaseRuntimeConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    FACILITYOS_DB_POOL_MAX: process.env.FACILITYOS_DB_POOL_MAX ?? "10",
    FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
    FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
    FACILITYOS_DB_APPLICATION_NAME: "facilityos-w0-05-tests",
  });
  runtime = createDatabaseRuntime<DB>(createPostgresPool(config));
});

beforeEach(async () => {
  await runtime.database.deleteFrom("core.identifier_allocation").execute();
  await runtime.database.deleteFrom("core.identifier_sequence").execute();
  await runtime.database.deleteFrom("core.identifier_series").execute();
  await runtime.database.deleteFrom("core.site_legal_entity").execute();
  await runtime.database.deleteFrom("core.site").execute();
  await runtime.database.deleteFrom("core.legal_entity").execute();
  await runtime.database.deleteFrom("core.organisation").execute();
  ids = new SequentialUuidFactory();
});

afterAll(async () => {
  await runtime.destroy();
});

describe("W0-05 Organisation / Legal Entity / Site", () => {
  it("persists an Organisation with immutable UUID identity and active lifecycle", async () => {
    const { organisations } = services();
    const id = await organisations.createOrganisation(
      { code: "HF", name: "Hubblefly Group Context" },
      actor,
    );

    await runtime.unitOfWork.withTransaction(async (uow) => {
      const row = await uow.repository(organisationRepository).findOrganisation(id);
      expect(row).toMatchObject({
        id,
        code: "HF",
        name: "Hubblefly Group Context",
        status: "ACTIVE",
        version: 0,
      });
    });
  });

  it("enforces scoped uniqueness and required organisation FK in PostgreSQL", async () => {
    const { organisations } = services();
    const orgId = await organisations.createOrganisation(
      { code: "HF", name: "Hubblefly Group Context" },
      actor,
    );

    await expect(
      organisations.createOrganisation(
        { code: "HF", name: "Another Group" },
        actor,
      ),
    ).rejects.toBeInstanceOf(DatabaseUniqueViolationError);

    const missingOrg = parseInternalId("00000000-0000-4000-8000-ffffffffffff");
    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        await uow.repository(organisationRepository).insertLegalEntity({
          id: ids.next(),
          organisationId: missingOrg,
          code: "BAD",
          legalName: "Invalid Parent Limited",
          stamp: { at: clock.nowUtc(), actor },
        });
      }),
    ).rejects.toBeInstanceOf(DatabaseForeignKeyViolationError);

    expect(orgId).toBeDefined();
  });

  it("supports one shared Site associated with multiple Legal Entities in one Organisation", async () => {
    const { organisations } = services();
    const orgId = await organisations.createOrganisation(
      { code: "HF", name: "Hubblefly Group Context" },
      actor,
    );
    const htl = await organisations.createLegalEntity(
      {
        organisationId: orgId,
        code: "HTL",
        legalName: "Hubblefly Technologies Limited",
        countryCode: "IN",
      },
      actor,
    );
    const ddl = await organisations.createLegalEntity(
      {
        organisationId: orgId,
        code: "DDL",
        legalName: "Drone Destination Limited",
        countryCode: "IN",
      },
      actor,
    );
    const siteId = await organisations.createSite(
      {
        organisationId: orgId,
        code: "MANESAR",
        name: "Manesar Operations Site",
        legalEntityIds: [htl, ddl],
      },
      actor,
    );

    await runtime.unitOfWork.withTransaction(async (uow) => {
      expect(
        await uow.repository(organisationRepository).countLegalEntitiesForSite(siteId),
      ).toBe(2);
    });
  });

  it("rejects cross-Organisation Site-to-Legal-Entity association", async () => {
    const { organisations } = services();
    const orgA = await organisations.createOrganisation(
      { code: "ORG_A", name: "Organisation Alpha" },
      actor,
    );
    const orgB = await organisations.createOrganisation(
      { code: "ORG_B", name: "Organisation Beta" },
      actor,
    );
    const legalB = await organisations.createLegalEntity(
      {
        organisationId: orgB,
        code: "LEGAL_B",
        legalName: "Legal Entity Beta",
      },
      actor,
    );

    await expect(
      organisations.createSite(
        {
          organisationId: orgA,
          code: "SHARED",
          name: "Invalid Cross Scope Site",
          legalEntityIds: [legalB],
        },
        actor,
      ),
    ).rejects.toThrow("same Organisation");
  });

  it("rejects stale Organisation lifecycle updates", async () => {
    const { organisations } = services();
    const orgId = await organisations.createOrganisation(
      { code: "HF", name: "Hubblefly Group Context" },
      actor,
    );

    await organisations.setOrganisationStatus(
      {
        organisationId: orgId,
        expectedVersion: parseAggregateVersion(0),
        status: "INACTIVE",
      },
      actor,
    );

    await expect(
      organisations.setOrganisationStatus(
        {
          organisationId: orgId,
          expectedVersion: parseAggregateVersion(0),
          status: "ACTIVE",
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });
});

describe("W0-05 concurrency-safe identifier allocation", () => {
  async function setupSeries(options?: {
    seriesKey?: string;
    formatTemplate?: string;
    scopeLegalEntity?: boolean;
    scopeSite?: boolean;
    requiresPeriod?: boolean;
  }) {
    const { organisations, identifiers } = services();
    const orgId = await organisations.createOrganisation(
      { code: "HF", name: "Hubblefly Group Context" },
      actor,
    );
    const legalId = await organisations.createLegalEntity(
      {
        organisationId: orgId,
        code: "HTL",
        legalName: "Hubblefly Technologies Limited",
      },
      actor,
    );
    const siteA = await organisations.createSite(
      {
        organisationId: orgId,
        code: "SITE_A",
        name: "Site Alpha",
        legalEntityIds: [legalId],
      },
      actor,
    );
    const siteB = await organisations.createSite(
      {
        organisationId: orgId,
        code: "SITE_B",
        name: "Site Beta",
        legalEntityIds: [legalId],
      },
      actor,
    );

    const seriesKey = options?.seriesKey ?? "sales_requirement";
    await identifiers.createSeries(
      {
        organisationId: orgId,
        seriesKey,
        formatTemplate:
          options?.formatTemplate ?? "HF-SR-{period}-{sequence}",
        sequenceWidth: 4,
        scopeLegalEntity: options?.scopeLegalEntity ?? false,
        scopeSite: options?.scopeSite ?? false,
        requiresPeriod: options?.requiresPeriod ?? true,
      },
      actor,
    );
    return { orgId, legalId, siteA, siteB, seriesKey };
  }

  it("allocates sequential deterministic identifiers", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    const first = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(1),
    );
    const second = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(2),
    );

    expect(first.identifier).toBe("HF-SR-26-0001");
    expect(second.identifier).toBe("HF-SR-26-0002");
  });

  it("prevents duplicates under parallel PostgreSQL allocation", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    const allocations = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        identifiers.allocateIdentifier(
          {
            organisationId: orgId,
            seriesKey,
            period: { key: "2026", token: "26" },
          },
          actor,
          operation(index + 10),
        ),
      ),
    );

    const values = allocations.map((allocation) => allocation.identifier);
    expect(new Set(values).size).toBe(24);
    expect(values.sort()).toEqual(
      Array.from(
        { length: 24 },
        (_, index) => `HF-SR-26-${String(index + 1).padStart(4, "0")}`,
      ),
    );
  });

  it("keeps different series independent", async () => {
    const { identifiers } = services();
    const { orgId } = await setupSeries();
    await identifiers.createSeries(
      {
        organisationId: orgId,
        seriesKey: "manufacturing_job",
        formatTemplate: "HF-MFG-{period}-{sequence}",
        sequenceWidth: 4,
        requiresPeriod: true,
      },
      actor,
    );

    const sr = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey: "sales_requirement",
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(50),
    );
    const job = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey: "manufacturing_job",
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(51),
    );

    expect(sr.identifier).toBe("HF-SR-26-0001");
    expect(job.identifier).toBe("HF-MFG-26-0001");
  });

  it("keeps explicit Site scopes independent", async () => {
    const { identifiers } = services();
    const { orgId, siteA, siteB } = await setupSeries({
      seriesKey: "site_demo",
      formatTemplate: "SITE-{sequence}",
      scopeSite: true,
      requiresPeriod: false,
    });

    const a = await identifiers.allocateIdentifier(
      { organisationId: orgId, seriesKey: "site_demo", siteId: siteA },
      actor,
      operation(60),
    );
    const b = await identifiers.allocateIdentifier(
      { organisationId: orgId, seriesKey: "site_demo", siteId: siteB },
      actor,
      operation(61),
    );

    expect(a.identifier).toBe("SITE-0001");
    expect(b.identifier).toBe("SITE-0001");
  });

  it("keeps explicitly supplied periods independent without defining calendar/fiscal semantics", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    const period26 = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "PERIOD-26", token: "26" },
      },
      actor,
      operation(70),
    );
    const period27 = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "PERIOD-27", token: "27" },
      },
      actor,
      operation(71),
    );

    expect(period26.identifier).toBe("HF-SR-26-0001");
    expect(period27.identifier).toBe("HF-SR-27-0001");
  });

  it("rejects unknown and inactive series", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    await expect(
      identifiers.allocateIdentifier(
        {
          organisationId: orgId,
          seriesKey: "missing_series",
          period: { key: "2026", token: "26" },
        },
        actor,
        operation(80),
      ),
    ).rejects.toThrow("not found");

    await identifiers.setSeriesStatus(
      {
        organisationId: orgId,
        seriesKey,
        expectedVersion: parseAggregateVersion(0),
        status: "INACTIVE",
      },
      actor,
    );

    await expect(
      identifiers.allocateIdentifier(
        {
          organisationId: orgId,
          seriesKey,
          period: { key: "2026", token: "26" },
        },
        actor,
        operation(81),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rolls back an uncommitted allocation so the number is not formally consumed", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        await identifiers.allocateIdentifierWithin(
          uow,
          {
            organisationId: orgId,
            seriesKey,
            period: { key: "2026", token: "26" },
          },
          actor,
          operation(90),
        );
        throw new Error("rollback-after-allocation");
      }),
    ).rejects.toThrow("rollback-after-allocation");

    const committed = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(91),
    );

    expect(committed.identifier).toBe("HF-SR-26-0001");
  });

  it("makes committed identifier allocations immutable at the database layer", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();

    const allocation = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(100),
    );

    await expect(
      runtime.database
        .updateTable("core.identifier_allocation")
        .set({ identifier_value: "FORGED-0001" })
        .where("id", "=", allocation.id)
        .execute(),
    ).rejects.toThrow("immutable");

    await expect(
      runtime.database
        .deleteFrom("core.identifier_allocation")
        .where("id", "=", allocation.id)
        .execute(),
    ).rejects.toThrow("immutable");
  });

  it("enforces allocation uniqueness independently of application code", async () => {
    const { identifiers } = services();
    const { orgId, seriesKey } = await setupSeries();
    const allocation = await identifiers.allocateIdentifier(
      {
        organisationId: orgId,
        seriesKey,
        period: { key: "2026", token: "26" },
      },
      actor,
      operation(110),
    );

    await expect(
      runtime.unitOfWork.withTransaction(async (uow) => {
        const repository = uow.repository(identifierRepository);
        const series = await repository.findSeries(orgId, seriesKey);
        if (!series) throw new Error("missing test series");
        await repository.insertAllocation({
          id: ids.next(),
          sequenceId: allocation.sequenceId,
          series,
          period: { key: "2026", token: "26" },
          sequenceValue: allocation.sequenceValue,
          identifier: allocation.identifier,
          allocatedAt: clock.nowUtc(),
          actor,
          requestId: "request-duplicate",
          commandId: operation(111).commandId,
          correlationId: operation(111).correlationId,
        });
      }),
    ).rejects.toBeInstanceOf(DatabaseUniqueViolationError);
  });
});
