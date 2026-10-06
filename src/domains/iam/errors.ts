import { ApplicationError } from "../../platform/primitives";

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
