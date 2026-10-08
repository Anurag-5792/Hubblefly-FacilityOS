import type {
  AggregateVersion,
  InternalId,
  UtcTimestamp,
} from "../../platform/primitives";

export const authorizationStatuses = ["ACTIVE", "INACTIVE"] as const;
export type AuthorizationStatus = (typeof authorizationStatuses)[number];

export const authorizationKinds = ["SYSTEM", "CUSTOM"] as const;
export type AuthorizationKind = (typeof authorizationKinds)[number];

export const authorizationScopeLevels = [
  "ORGANISATION",
  "LEGAL_ENTITY",
  "SITE",
] as const;
export type AuthorizationScopeLevel = (typeof authorizationScopeLevels)[number];

export const SUPERUSER_CAPABILITY = "platform.superuser" as const;

export type CapabilityCode = string & { readonly __brand: "CapabilityCode" };
export type RoleCode = string & { readonly __brand: "RoleCode" };

export function parseCapabilityCode(value: string): CapabilityCode {
  const code = value.trim();
  if (
    code.length > 160 ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(code)
  ) {
    throw new TypeError("Capability code has an invalid format.");
  }
  return code as CapabilityCode;
}

export function parseRoleCode(value: string): RoleCode {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
    throw new TypeError("Role code has an invalid format.");
  }
  return code as RoleCode;
}

export interface Role {
  readonly id: InternalId;
  readonly code: RoleCode;
  readonly displayName: string;
  readonly description?: string;
  readonly kind: AuthorizationKind;
  readonly status: AuthorizationStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface Capability {
  readonly id: InternalId;
  readonly code: CapabilityCode;
  readonly displayName: string;
  readonly description?: string;
  readonly kind: AuthorizationKind;
  readonly status: AuthorizationStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface RoleCapability {
  readonly id: InternalId;
  readonly roleId: InternalId;
  readonly capabilityId: InternalId;
  readonly status: AuthorizationStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface RoleAssignment {
  readonly id: InternalId;
  readonly userProfileId: InternalId;
  readonly roleId: InternalId;
  readonly organisationId: InternalId;
  readonly legalEntityId?: InternalId;
  readonly siteId?: InternalId;
  readonly scopeLevel: AuthorizationScopeLevel;
  readonly validFrom: UtcTimestamp;
  readonly validUntil?: UtcTimestamp;
  readonly status: AuthorizationStatus;
  readonly version: AggregateVersion;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface AuthorizationScope {
  readonly organisationId: InternalId;
  readonly legalEntityId?: InternalId;
  readonly siteId?: InternalId;
}

export type AuthorizationDenialReason =
  | "UNAUTHENTICATED"
  | "USER_NOT_PROVISIONED"
  | "USER_INACTIVE"
  | "IDENTITY_MISMATCH"
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_INACTIVE"
  | "NO_ASSIGNMENT"
  | "ASSIGNMENT_INACTIVE"
  | "ASSIGNMENT_NOT_YET_VALID"
  | "ASSIGNMENT_EXPIRED"
  | "ROLE_INACTIVE"
  | "CAPABILITY_NOT_GRANTED"
  | "SCOPE_INVALID"
  | "SCOPE_MISMATCH"
  | "SEGREGATION_RULE"
  | "FUTURE_POLICY_DENY";

export interface AuthorizationDecision {
  readonly outcome: "ALLOW" | "DENY";
  readonly allowed: boolean;
  readonly requestedCapability: string;
  readonly evaluatedUserId?: InternalId;
  readonly requestedScope: Readonly<AuthorizationScope>;
  readonly matchingAssignmentIds: readonly InternalId[];
  readonly viaSuperuser: boolean;
  readonly denialReason?: AuthorizationDenialReason;
  readonly evaluatedAt: UtcTimestamp;
}

export function assignmentScopeLevel(scope: AuthorizationScope): AuthorizationScopeLevel {
  if (scope.siteId) return "SITE";
  if (scope.legalEntityId) return "LEGAL_ENTITY";
  return "ORGANISATION";
}

export function scopeMatches(
  assignment: RoleAssignment,
  requested: AuthorizationScope,
): boolean {
  if (assignment.organisationId !== requested.organisationId) return false;

  if (assignment.scopeLevel === "ORGANISATION") return true;

  if (assignment.scopeLevel === "LEGAL_ENTITY") {
    return (
      assignment.legalEntityId !== undefined &&
      requested.legalEntityId === assignment.legalEntityId
    );
  }

  if (requested.siteId !== assignment.siteId) return false;

  if (assignment.legalEntityId !== undefined) {
    return requested.legalEntityId === assignment.legalEntityId;
  }

  // A physical Site relationship alone never grants Legal Entity authority.
  return requested.legalEntityId === undefined;
}
