# HF094 retained Roles-only installer — review candidate, not installation authority

Application commit `4681edbfddfa960b4af9ad8597745a7d66b9c90e` / tree `f090740ac321d92e0663bcab48f5610de83caede` remains frozen. Its CI run 46033975835 is not SQL execution evidence. This installer-only branch leaves PR #20 and the existing Employee deployment untouched.

## Exact order and target

The manifest binds the existing retained target PG18.7/OID 16397 and all three candidate SQL files. The runner reads the original canonical manifest and helper, validates the exact six revision bytes and rejected provenance, and builds one SERIALIZABLE transaction under the existing migration advisory lock. No migration replay: a nonfresh target or preexisting role is a STOP, not a repair instruction. The bootstrap creates three disabled, nonprivileged roles only; canonical tables/functions are owned by NOLOGIN hft_engineering, role schema/tables/functions by NOLOGIN hft_r1_roles_owner. The executable app-role source preserves original table definitions, all nine ENABLE ALWAYS trigger definitions and three exact trigger bodies. Temporary SET/CREATE/REFERENCES/EXECUTE rights are closed before commit. Only the exact installer administrative edge (including provider-created ADMIN-only relationship) may remain, with no SET/INHERIT. Runtime gets four canonical master reads, four role-table reads, UPDATE(epoch), assignment INSERT/UPDATE and event INSERT; no stock reads/writes/helpers or master DML. NOLOGIN and PASSWORD NULL; no actor, scope, first Owner Admin, or business grant.

No hft_secret, crypto extension, protected Stage30, stock gateway, second ledger, provider system ACL change or fixture authority. Canonical 0001–0006 include canonical ledger relations by design, but no stock access or operational writer is installed. No synthetic identity is seeded.

## Execution mechanism

```sh
python3 tools/hft_roles_only_install_094.py --inspect
```

This command validates actual bytes, no connection. The production-shaped SQL guards require exact database/OID/PG version/session principal and run-local markers. Markers are **not signatures**; only the runner's separate admission verification authorizes assembly. Never execute individual SQL files manually, set these markers to bypass the runner, or replace the original STOP guard.

The guarded runner requires an independently enrolled authentic Ed25519 technical reviewer key SHA256 in source (initially empty; guaranteed STOP before TLS/SQL). Enrollment is a narrowly reviewed trust-pin update, not an arbitrary environment value. Freeze final release source and runner hash after this update, preserving the SQL digests. Chat11 finalizes the original owner order only once independently accepted pins are available. Technical admission signs exact order and signature digests, authenticated owner keyring/fingerprint, installer source commit/tree, all SQL and runner digests, target, actual appointed executor and independent review/restore evidence, signed exact scope/STOP/revocation/expiry and verify-full CA pin. The runner independently verifies detached OpenPGP owner signature and Ed25519 technical signature; the independent technical reviewer validates owner order semantics using Chat11's original schema. Neither this source nor a GitHub comment creates those approvals.

On the separately approved installer host, clean exact checkout with full git ancestry, no ambient DB URLs, provision the existing managed installer credential and CA privately. Required env: HFT_ENVIRONMENT=retained-stores-nonproduction, HFT_LIVE_POSTING_ENABLED=false, PGHOST exact target, PGPORT=5432, PGDATABASE exact target, PGUSER existing database installer, PGSSLMODE=verify-full, PGCHANNELBINDING=require, PGSSLROOTCERT absolute path, PGPASSWORD managed secret. No Vercel execution. Confirm authentic source/target/TLS/backup/restore/STOP status immediately before execution.

```sh
python3 tools/hft_roles_only_install_094.py --apply \
  --technical-record /restricted/technical-admission.json \
  --technical-signature /restricted/technical-admission.sig \
  --technical-key /restricted/technical-reviewer.pem \
  --owner-order /restricted/final-owner-order.json \
  --owner-signature /restricted/final-owner-order.sig \
  --owner-keyring /restricted/enrolled-owner.gpg
```

Paths are examples, not real evidence or secrets. Technical JSON field contract is the runner's mandatory checks. Use --postflight with the same admitted inputs for independent read-only catalog verification. In-transaction role-owner checks attest six exact revision rows and empty role state; after temporary access closure catalog postflight checks disabled roles, ownership, memberships, effective ACL and exact trigger semantics without retained installer table-data grants. Fresh connection postflight after commit. Any failure or ambiguous outcome STOP/no automatic retry; reconcile actual state and backup evidence before further action. Direct-wire runtime login and real role assignment/permission tests require separate authentic activation and admission. No provider system DB isolation claim. No real stock or role grants.

## Verification

The separate installer CI performs exact-byte/hash and unsigned-apply negative checks and runs a disposable network-disabled local PostgreSQL 18.7 fixture with only explicit fixture target/OID/provider-grantor substitution. No remote credentials or Neon connection. It tests SQL parsing, rollback, exact catalog, replay refusal and drift. It is not target-provider qualification. Actual retained installation, actual wire/TLS, corporate signatures, real actor enrollment, and final independent security acceptance remain separate.
