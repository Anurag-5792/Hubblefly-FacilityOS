import "server-only";

import { sql } from "kysely";

import type { DB } from "../../platform/db/kysely.types";
import type { UnitOfWork } from "../../platform/db/unit-of-work";
import type { AuthenticatedUser } from "./authenticated-user";
import type { AuthorizationScope } from "./authorization-model";

export async function databaseContextMatches(
  uow: UnitOfWork<DB>,
  user: Readonly<AuthenticatedUser>,
): Promise<boolean> {
  const result = await sql<{ matches: boolean }>`
    select facilityos_security.context_matches(
      ${user.authUserId}::uuid,
      ${user.facilityUserId}::uuid
    ) as matches
  `.execute(uow.transaction);

  return result.rows[0]?.matches === true;
}

export async function databaseScopeExistsActive(
  uow: UnitOfWork<DB>,
  scope: Readonly<AuthorizationScope>,
): Promise<boolean> {
  const result = await sql<{ valid: boolean }>`
    select facilityos_security.scope_exists_active(
      ${scope.organisationId}::uuid,
      ${scope.legalEntityId ?? null}::uuid,
      ${scope.siteId ?? null}::uuid
    ) as valid
  `.execute(uow.transaction);

  return result.rows[0]?.valid === true;
}
