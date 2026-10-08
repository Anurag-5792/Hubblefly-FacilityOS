import type { Transaction } from "kysely";

export type RepositoryFactory<Database, Repository> = (
  transaction: Transaction<Database>,
) => Repository;

/**
 * A minimal base for repositories whose writes must participate in an
 * application-service-owned transaction.
 *
 * This class intentionally exposes no generic CRUD methods.
 */
export abstract class TransactionalRepository<Database> {
  protected constructor(protected readonly transaction: Transaction<Database>) {}
}
