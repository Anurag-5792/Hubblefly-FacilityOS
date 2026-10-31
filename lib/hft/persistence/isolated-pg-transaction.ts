/** Nonproduction-only PostgreSQL transaction envelope. This is NOT the stock posting service. */
import { assertSecureStartup } from '../security/authorization.ts';

export type QueryResult<Row> = Readonly<{ rows: readonly Row[]; rowCount: number | null }>;
export interface PgQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string, parameters?: readonly (string | number | bigint | boolean | null)[],
  ): Promise<QueryResult<Row>>;
  /** True destroys/discards this pooled connection after unverified cleanup. */
  release(destroy?: boolean): void;
}
export interface PgPool { connect(): Promise<PgQueryClient> }
export type IsolatedPgEnvironment = Readonly<Record<string, string | undefined>>;

export class CommitOutcomeUncertain extends Error {
  constructor(cause: unknown) {
    super('POSTGRES_COMMIT_OUTCOME_UNCERTAIN_VERIFY_IDEMPOTENCY_BEFORE_RETRY', { cause });
    this.name = 'CommitOutcomeUncertain';
  }
}

function assertIsolatedEnvironment(env: IsolatedPgEnvironment): string {
  assertSecureStartup(env);
  if (env.HFT_LIVE_POSTING_ENABLED !== 'false' || env.HFT_POSTING_RUN_MODE !== 'ISOLATED_DB_TEST') {
    throw new Error('ISOLATED_NONPRODUCTION_POSTING_GATE_REQUIRED');
  }
  const dbName = env.HFT_TEST_PG_DATABASE;
  if (!dbName || !/^hft_r1_disposable_[a-z0-9_]{6,40}$/.test(dbName)) {
    throw new Error('DISPOSABLE_DATABASE_NAME_REQUIRED');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(env.PGHOST ?? '')) {
    throw new Error('LOCAL_POSTGRES_HOST_REQUIRED');
  }
  return dbName;
}

/**
 * Infrastructure guard only: caller must independently validate business policy,
 * read server-persisted approvals/Holds and write balanced ledger, custody, and
 * immutable audit-outbox rows in this *same* transaction before commit.
 * A network loss on COMMIT is ambiguous, not a confirmed rollback.
 */
export async function withIsolatedPgTransaction<T>(
  pool: PgPool, env: IsolatedPgEnvironment,
  callback: (client: PgQueryClient) => Promise<T>,
): Promise<T> {
  const requiredDatabase = assertIsolatedEnvironment(env);
  const client = await pool.connect();
  let begun = false;
  let commitStarted = false;
  let discard = false;
  try {
    begun = true; // BEGIN response loss may leave a transaction open; attempt ROLLBACK.
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '2500ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const identity = await client.query<{db_name: string; db_role: string}>(
      'SELECT current_database() AS db_name, current_user AS db_role',
    );
    if (identity.rows.length !== 1 || identity.rows[0].db_name !== requiredDatabase ||
        identity.rows[0].db_role !== 'hft_engineering') {
      throw new Error('DATABASE_IDENTITY_ATTESTATION_FAILED');
    }
    const value = await callback(client);
    commitStarted = true;
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (begun && !commitStarted) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        discard = true;
        throw new AggregateError([error, rollbackError], 'POSTGRES_ROLLBACK_UNVERIFIED');
      }
    }
    if (commitStarted) {
      discard = true;
      throw new CommitOutcomeUncertain(error);
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
