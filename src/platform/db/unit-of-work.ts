import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type Kysely, type Transaction } from "kysely";

import { translateDatabaseError } from "./errors";
import type { RepositoryFactory } from "./repository";
import type { DatabaseSecurityContext } from "./security-context";

export class NestedTransactionError extends Error {
  constructor() {
    super(
      "Nested Unit-of-Work transactions are not permitted. Pass the existing UnitOfWork to dependent application services instead.",
    );
    this.name = "NestedTransactionError";
  }
}

export interface UnitOfWork<Database> {
  readonly transaction: Transaction<Database>;
  repository<Repository>(factory: RepositoryFactory<Database, Repository>): Repository;
}

class KyselyUnitOfWork<Database> implements UnitOfWork<Database> {
  constructor(readonly transaction: Transaction<Database>) {}

  repository<Repository>(factory: RepositoryFactory<Database, Repository>): Repository {
    return factory(this.transaction);
  }
}

export class UnitOfWorkManager<Database> {
  private readonly activeTransaction = new AsyncLocalStorage<Transaction<Database>>();

  constructor(private readonly database: Kysely<Database>) {}

  hasActiveTransaction(): boolean {
    return this.activeTransaction.getStore() !== undefined;
  }

  async withTransaction<Result>(
    operation: (unitOfWork: UnitOfWork<Database>) => Promise<Result>,
  ): Promise<Result> {
    if (this.hasActiveTransaction()) {
      throw new NestedTransactionError();
    }

    try {
      return await this.database.transaction().execute(async (transaction) => {
        return await this.activeTransaction.run(
          transaction,
          async () => await operation(new KyselyUnitOfWork(transaction)),
        );
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  async withSecurityAdminTransaction<Result>(
    operation: (unitOfWork: UnitOfWork<Database>) => Promise<Result>,
  ): Promise<Result> {
    if (this.hasActiveTransaction()) {
      throw new NestedTransactionError();
    }

    try {
      return await this.database.transaction().execute(async (transaction) => {
        // This path is reserved for separately provisioned non-user operational authority.
        // The database credential must be explicitly allowed to SET ROLE to this NOLOGIN/NOBYPASSRLS role.
        await sql`set local role facilityos_security_admin`.execute(transaction);
        await sql`set local row_security = on`.execute(transaction);

        return await this.activeTransaction.run(
          transaction,
          async () => await operation(new KyselyUnitOfWork(transaction)),
        );
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  async withRlsTransaction<Result>(
    context: Readonly<DatabaseSecurityContext>,
    operation: (unitOfWork: UnitOfWork<Database>) => Promise<Result>,
  ): Promise<Result> {
    if (this.hasActiveTransaction()) {
      throw new NestedTransactionError();
    }

    try {
      return await this.database.transaction().execute(async (transaction) => {
        // The role identifier is fixed application code, never request data.
        await sql`set local role facilityos_user_runtime`.execute(transaction);
        await sql`set local row_security = on`.execute(transaction);
        await sql`
          select facilityos_security.establish_authenticated_context(
            ${context.authUserId}::uuid,
            ${context.requestId},
            ${context.correlationId}::uuid
          )
        `.execute(transaction);

        return await this.activeTransaction.run(
          transaction,
          async () => await operation(new KyselyUnitOfWork(transaction)),
        );
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }
}
