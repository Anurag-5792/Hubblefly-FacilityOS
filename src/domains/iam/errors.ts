import { ApplicationError } from "../../platform/primitives";
import type { AuthorizationDenialReason } from "./authorization-model";

export class AuthenticationRequiredError extends ApplicationError {
  constructor() {
    super({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." });
  }
}

export class FacilityUserNotProvisionedError extends ApplicationError {
  constructor() {
    super({
      code: "FACILITY_USER_NOT_PROVISIONED",
      message: "Authenticated account is not provisioned for FacilityOS.",
    });
  }
}

export class FacilityUserInactiveError extends ApplicationError {
  constructor() {
    super({
      code: "FACILITY_USER_INACTIVE",
      message: "FacilityOS user profile is inactive.",
    });
  }
}


export class AuthorizationDeniedError extends ApplicationError {
  readonly denialReason?: AuthorizationDenialReason;

  constructor(denialReason?: AuthorizationDenialReason) {
    super({
      code: "AUTHORIZATION_DENIED",
      message: denialReason
        ? `Authorization denied: ${denialReason}.`
        : "Authorization denied.",
      publicMessage: "You are not authorized to perform this action.",
    });
    this.denialReason = denialReason;
  }
}
