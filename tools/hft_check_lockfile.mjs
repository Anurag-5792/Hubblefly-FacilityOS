/** Fail-closed dependency lock integrity preflight; no network or installation. */
import { readFileSync, existsSync } from 'node:fs';
const readJson = (name) => JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
function stop(code) { process.stderr.write('HFT_LOCK_GATE_STOP='+code+'\n'); process.exitCode=1; }
const lockPath = new URL('../package-lock.json',import.meta.url);
if (!existsSync(lockPath)) {
  stop('REVIEWED_PACKAGE_LOCK_REQUIRED');
} else {
  try {
    const pkg=readJson('package.json'), lock=readJson('package-lock.json');
    if (lock.lockfileVersion!==3 || !lock.packages || !lock.packages['']) throw Error('LOCKFILE_FORMAT_INVALID');
    const packages={...pkg.dependencies,...pkg.devDependencies};
    for (const [name,version] of Object.entries(packages)) {
      if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) throw Error('UNPINNED_DIRECT_DEPENDENCY:'+name);
      const path='node_modules/'+name;
      if (lock.packages[path]?.version!==version ||
          (lock.packages[''].dependencies?.[name] ?? lock.packages[''].devDependencies?.[name])!==version ||
          typeof lock.packages[path]?.integrity!=='string' || !lock.packages[path].integrity.startsWith('sha512-'))
        throw Error('MISSING_OR_MISMATCHED_LOCK_ENTRY:'+name);
    }
    for(const [name,entry] of Object.entries(lock.packages)) {
      if (!name || entry.link) continue;
      if (entry.resolved && (!entry.resolved.startsWith('https://') || !entry.integrity))
        throw Error('UNVERIFIABLE_TRANSITIVE_RESOLUTION:'+name);
    }
    process.stdout.write('HFT_LOCK_GATE=STRUCTURAL_CHECK_PASS; INSTALL_AND_AUDIT_STILL_REQUIRED\n');
  } catch(error) { stop(error instanceof Error?error.message:'LOCKFILE_PARSE_FAILED'); }
}
