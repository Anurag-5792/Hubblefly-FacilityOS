import type {
  AggregateVersion,
  InternalId,
  UtcTimestamp,
} from "../../platform/primitives";

export const organisationalStatuses = ["ACTIVE", "INACTIVE"] as const;
export type OrganisationalStatus = (typeof organisationalStatuses)[number];

export interface Organisation {
  readonly id: InternalId;
  readonly code: string;
  readonly name: string;
  readonly status: OrganisationalStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface LegalEntity {
  readonly id: InternalId;
  readonly organisationId: InternalId;
  readonly code: string;
  readonly legalName: string;
  readonly displayName?: string;
  readonly countryCode?: string;
  readonly status: OrganisationalStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface Site {
  readonly id: InternalId;
  readonly organisationId: InternalId;
  readonly code: string;
  readonly name: string;
  readonly status: OrganisationalStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface IdentifierSeries {
  readonly id: InternalId;
  readonly organisationId: InternalId;
  readonly seriesKey: string;
  readonly description?: string;
  readonly formatTemplate: string;
  readonly sequenceWidth: number;
  readonly scopeLegalEntity: boolean;
  readonly scopeSite: boolean;
  readonly requiresPeriod: boolean;
  readonly status: OrganisationalStatus;
  readonly version: AggregateVersion;
}

export interface IdentifierPeriod {
  readonly key: string;
  readonly token: string;
}

export interface IdentifierAllocation {
  readonly id: InternalId;
  readonly seriesId: InternalId;
  readonly sequenceId: InternalId;
  readonly organisationId: InternalId;
  readonly legalEntityId?: InternalId;
  readonly siteId?: InternalId;
  readonly period?: IdentifierPeriod;
  readonly sequenceValue: number;
  readonly identifier: string;
  readonly allocatedAt: UtcTimestamp;
}
