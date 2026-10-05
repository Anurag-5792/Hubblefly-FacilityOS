export class OptimisticConcurrencyError extends Error {
  readonly aggregate: string;
  readonly aggregateId: string;
  readonly expectedVersion: number;

  constructor(options: { aggregate: string; aggregateId: string; expectedVersion: number }) {
    super(
      `Concurrent update detected for ${options.aggregate} ${options.aggregateId}; expected version ${options.expectedVersion} is stale.`,
    );
    this.name = "OptimisticConcurrencyError";
    this.aggregate = options.aggregate;
    this.aggregateId = options.aggregateId;
    this.expectedVersion = options.expectedVersion;
  }
}

export class OptimisticConcurrencyInvariantError extends Error {
  constructor(updatedRows: bigint) {
    super(`A version-guarded update affected ${updatedRows.toString()} rows; expected exactly one.`);
    this.name = "OptimisticConcurrencyInvariantError";
  }
}

export function assertSingleVersionedUpdate(
  updatedRows: bigint | number | undefined,
  context: { aggregate: string; aggregateId: string; expectedVersion: number },
): void {
  const count = typeof updatedRows === "bigint" ? updatedRows : BigInt(updatedRows ?? 0);

  if (count === 0n) {
    throw new OptimisticConcurrencyError(context);
  }

  if (count !== 1n) {
    throw new OptimisticConcurrencyInvariantError(count);
  }
}
