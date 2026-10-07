import { ApplicationError } from "../../platform/primitives";

export class GovernancePolicyError extends ApplicationError {
  constructor(message: string) {
    super({
      code: "GOVERNANCE_POLICY_DENIED",
      message,
      publicMessage: "This governed action is not permitted.",
    });
  }
}

export class GovernanceRecordNotFoundError extends ApplicationError {
  constructor(record: string) {
    super({
      code: "GOVERNANCE_RECORD_NOT_FOUND",
      message: `${record} was not found.`,
      publicMessage: "The governed record was not found.",
    });
  }
}

export class BlockingHoldError extends ApplicationError {
  constructor() {
    super({
      code: "BLOCKING_HOLD_ACTIVE",
      message: "The requested action is blocked by an active Hold.",
      publicMessage: "This action is blocked by an active Hold.",
    });
  }
}
