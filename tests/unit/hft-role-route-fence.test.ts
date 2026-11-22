/** Executes real route handlers in a separate mock-module-enabled process.
 * The eight deterministic scenarios model two sessions; no PostgreSQL runs.
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
test('ROLE077 actual-route offline revocation campaign (8 deterministic cases)',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=execFileSync(process.execPath,['--experimental-strip-types',
  '--experimental-test-module-mocks','--test',
  fileURLToPath(new URL('../support/role077-route-worker.ts',import.meta.url))],
  {env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.match(result,/# pass 8\b/);assert.match(result,/# fail 0\b/);
});
