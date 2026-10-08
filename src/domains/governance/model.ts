import type {
  InternalId,
  JsonObject,
  OperationContext,
  UtcTimestamp,
} from "../../platform/primitives";
import type { AuthorizationScope } from "../iam";

export const approvalStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

export const approvalDecisions = ["APPROVE", "REJECT"] as const;
export type ApprovalDecisionValue = (typeof approvalDecisions)[number];

export const holdStatuses = ["ACTIVE", "RELEASED"] as const;
export type HoldStatus = (typeof holdStatuses)[number];

export type GovernanceScope = AuthorizationScope;

export interface ResourceReference {
  readonly type: string;
  readonly id: InternalId;
}

export interface GovernanceMutationResult {
  readonly id: InternalId;
  readonly replayed: boolean;
  readonly status: string;
}

export interface ApprovalRequest {
  readonly id: InternalId;
  readonly resource: Readonly<ResourceReference>;
  readonly requestedAction: string;
  readonly policyCode: string;
  readonly requesterUserId: InternalId;
  readonly requestedAt: UtcTimestamp;
  readonly scope: Readonly<GovernanceScope>;
  readonly status: ApprovalStatus;
  readonly requiredApprovalCount: number;
  readonly requireDistinctHumans: boolean;
  readonly selfApprovalAllowed: boolean;
  readonly requiredCapabilityCodes: readonly string[];
  readonly requestCapabilityCode: string;
  readonly operation: Readonly<OperationContext>;
  readonly version: number;
}

export interface ApprovalDecision {
  readonly id: InternalId;
  readonly approvalRequestId: InternalId;
  readonly approverUserId: InternalId;
  readonly decision: ApprovalDecisionValue;
  readonly capabilityCode: string;
  readonly decidedAt: UtcTimestamp;
  readonly reason?: string;
  readonly scope: Readonly<GovernanceScope>;
  readonly operation: Readonly<OperationContext>;
}

export interface Hold {
  readonly id: InternalId;
  readonly resource: Readonly<ResourceReference>;
  readonly holdType: string;
  readonly blockedAction?: string;
  readonly reason: string;
  readonly placedByUserId: InternalId;
  readonly placedAt: UtcTimestamp;
  readonly scope: Readonly<GovernanceScope>;
  readonly status: HoldStatus;
  readonly releaseCapabilityCode: string;
  readonly releaseRequiresApproval: boolean;
  readonly placementCapabilityCode: string;
  readonly releasedByUserId?: InternalId;
  readonly releasedAt?: UtcTimestamp;
  readonly releaseReason?: string;
  readonly releaseApprovalRequestId?: InternalId;
  readonly version: number;
}

const resourceTypePattern = /^[a-z][a-z0-9._-]{0,79}$/;
const governanceCodePattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/;
const prohibitedKeyPattern =
  /(password|passwd|token|secret|cookie|credential|authorization|api[_-]?key|session[_-]?key)/i;
const bearerPattern = /^Bearer\s+[A-Za-z0-9._~+/-]+={0,2}$/i;
const jwtPattern = /^eyJ[A-Za-z0-9._-]{20,}$/;
const postgresUrlPattern = /^postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i;

export function parseResourceType(value: string): string {
  if (!resourceTypePattern.test(value)) {
    throw new TypeError("Resource type must be a 1-80 lowercase registered-style code.");
  }
  return value;
}

export function parseGovernanceCode(value: string, label = "Governance code"): string {
  if (!governanceCodePattern.test(value)) {
    throw new TypeError(`${label} must be a 1-160 safe identifier code.`);
  }
  return value;
}

export function createResourceReference(
  type: string,
  id: InternalId,
): Readonly<ResourceReference> {
  return Object.freeze({ type: parseResourceType(type), id });
}

function inspectMetadata(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      inspectMetadata(value[index], `${path}[${index}]`);
    }
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (prohibitedKeyPattern.test(key)) {
        throw new TypeError(`Audit metadata contains prohibited sensitive key at ${path}.${key}.`);
      }
      inspectMetadata(child, `${path}.${key}`);
    }
    return;
  }

  if (typeof value === "string") {
    if (
      bearerPattern.test(value) ||
      jwtPattern.test(value) ||
      postgresUrlPattern.test(value)
    ) {
      throw new TypeError(`Audit metadata contains prohibited credential-like data at ${path}.`);
    }
  }
}

export function assertSafeAuditMetadata(metadata: Readonly<JsonObject>): void {
  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, "utf8") > 32_768) {
    throw new TypeError("Audit metadata exceeds the 32 KiB canonical limit.");
  }
  inspectMetadata(metadata, "$");
}
