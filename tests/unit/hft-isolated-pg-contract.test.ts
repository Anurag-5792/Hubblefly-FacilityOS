import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withIsolatedPgTransaction, CommitOutcomeUncertain, type PgQueryClient, type PgPool } from '../../lib/hft/persistence/isolated-pg-transaction.ts';

const env = {NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',PGHOST:'127.0.0.1'};
function fakePg(options: { identity?: string; fail?: string } = {}) {
  const statements: string[] = [];
  let releases = 0;
  const client: PgQueryClient = {
    async query<T extends Record<string, unknown>>(text: string) {
      statements.push(text);
      if (text === options.fail) throw new Error('SYNTHETIC_DB_FAILURE');
      const rows = text.startsWith('SELECT current_database()') ?
        [{db_name:options.identity ?? env.HFT_TEST_PG_DATABASE,db_role:'hft_engineering'}] : [];
      return { rows: rows as unknown as T[], rowCount: rows.length };
    },
    release() { releases++; },
  };
  const pool: PgPool = { async connect() { return client; } };
  return { pool, statements, releases:()=>releases };
}
test('requires explicitly isolated environment before acquiring connection', async () => {
  const pg = fakePg();
  await assert.rejects(withIsolatedPgTransaction(pg.pool, {...env,HFT_LIVE_POSTING_ENABLED:'true'},async()=>null), /LIVE_POSTING_PROHIBITED/);
  await assert.rejects(withIsolatedPgTransaction(pg.pool, {...env,NODE_ENV:'production'},async()=>null), /PRODUCTION_STARTUP_NOT_AUTHORIZED/);
  await assert.rejects(withIsolatedPgTransaction(pg.pool, {...env,HFT_TEST_PG_DATABASE:'production'},async()=>null), /DISPOSABLE_DATABASE/);
  await assert.rejects(withIsolatedPgTransaction(pg.pool, {...env,PGHOST:'db.example.com'},async()=>null), /LOCAL_POSTGRES_HOST_REQUIRED/);
  assert.equal(pg.statements.length,0);
});
test('starts serializable, attests database and commits exactly once', async () => {
  const pg=fakePg();
  const result=await withIsolatedPgTransaction(pg.pool,env,async(client)=>{await client.query('SELECT 1');return 'OK';});
  assert.equal(result,'OK');
  assert.deepEqual(pg.statements, ['BEGIN ISOLATION LEVEL SERIALIZABLE',
    "SET LOCAL lock_timeout = '2500ms'", "SET LOCAL statement_timeout = '15000ms'",
    'SELECT current_database() AS db_name, current_user AS db_role','SELECT 1','COMMIT']);
  assert.equal(pg.releases(),1);
});
test('callback failure rolls back and releases client',async()=>{
  const pg=fakePg();
  await assert.rejects(withIsolatedPgTransaction(pg.pool,env,async()=>{throw Error('ABORT_COMMAND')}),/ABORT_COMMAND/);
  assert.equal(pg.statements.at(-1),'ROLLBACK');
  assert.equal(pg.releases(),1);
});
test('connection with wrong database identity is rejected and rolled back',async()=>{
  const pg=fakePg({identity:'hft_production'});
  await assert.rejects(withIsolatedPgTransaction(pg.pool,env,async()=>{throw Error('UNREACHABLE')}),/DATABASE_IDENTITY_ATTESTATION_FAILED/);
  assert.equal(pg.statements.at(-1),'ROLLBACK');
});
test('failed COMMIT is treated as uncertain outcome, never guaranteed rollback',async()=>{
  const pg=fakePg({fail:'COMMIT'});
  await assert.rejects(withIsolatedPgTransaction(pg.pool,env,async()=>42),CommitOutcomeUncertain);
  assert.equal(pg.statements.at(-1),'COMMIT');
  assert.equal(pg.releases(),1);
});

test('lost BEGIN response still triggers rollback attempt',async()=>{
  const pg=fakePg({fail:'BEGIN ISOLATION LEVEL SERIALIZABLE'});
  await assert.rejects(withIsolatedPgTransaction(pg.pool,env,async()=>null),/SYNTHETIC_DB_FAILURE/);
  assert.equal(pg.statements.at(-1),'ROLLBACK');
  assert.equal(pg.releases(),1);
});
