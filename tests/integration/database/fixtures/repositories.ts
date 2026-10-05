import type { Transaction } from "kysely";

import { assertSingleVersionedUpdate } from "../../../../src/platform/db/optimistic-concurrency";
import { TransactionalRepository } from "../../../../src/platform/db/repository";

export interface W003RecordTable {
  id: string;
  name: string;
  value: string;
  version: number;
}

export interface W003SideEffectTable {
  id: string;
  record_id: string;
  note: string;
}

export interface W003TestDatabase {
  w0_03_records: W003RecordTable;
  w0_03_side_effects: W003SideEffectTable;
}

export class RecordRepository extends TransactionalRepository<W003TestDatabase> {
  constructor(transaction: Transaction<W003TestDatabase>) {
    super(transaction);
  }

  async insert(record: W003RecordTable): Promise<void> {
    await this.transaction.insertInto("w0_03_records").values(record).executeTakeFirstOrThrow();
  }

  async updateValue(
    id: string,
    expectedVersion: number,
    value: string,
  ): Promise<void> {
    const result = await this.transaction
      .updateTable("w0_03_records")
      .set((expression) => ({
        value,
        version: expression("version", "+", 1),
      }))
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();

    assertSingleVersionedUpdate(result.numUpdatedRows, {
      aggregate: "W003Record",
      aggregateId: id,
      expectedVersion,
    });
  }

  async get(id: string): Promise<W003RecordTable | undefined> {
    return await this.transaction
      .selectFrom("w0_03_records")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }
}

export class SideEffectRepository extends TransactionalRepository<W003TestDatabase> {
  constructor(transaction: Transaction<W003TestDatabase>) {
    super(transaction);
  }

  async insert(sideEffect: W003SideEffectTable): Promise<void> {
    await this.transaction
      .insertInto("w0_03_side_effects")
      .values(sideEffect)
      .executeTakeFirstOrThrow();
  }
}
