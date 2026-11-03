# HFT-R1 MASTER V3 â€” Recovery V2 Enforcement 026

Directive: HFT-R1-MASTER-V3-RECOVERY-V2-ENFORCE-026
Status: AUTHORIZED NONPRODUCTION SOURCE CORRECTION ONLY.
Neon/resource/database execution: HOLD.
Starting revision: 0ba7c6659e3b3ca9d321af3c66dd88eee0e60474.
Repository: Anurag-5792/Hubblefly-FacilityOS; existing branch and draft PR #11.

This contract supersedes 025's unwired phase check, synthetic retention
object and self-declared restore PASS. The historical 025 document is retained
for governance and provenance.

## Single implementation and exact source pins

- The authoritative staging runner is tools/hft_neon_staging_bootstrap.py.
- The validator is tools/hft_neon_recovery_v2.py, called directly by the runner.
- config/hft-recovery-v2-source.sha256 pins the validator's exact SHA-256.
- Gate A authorization requires recovery_validator_sha256 equal to that pinned
  source AND the actual validator bytes. Any change invalidates earlier pins.
- config/hft-recovery-v2-witness-trust.sha256 is deliberately HOLD pending
  independent human identity and corporate public-key custody review.
- config/hft-bootstrap019-review.sha256 and
  config/hft-bootstrap019-execution.sha256 remain HOLD.
- Local-only migration runner, canonical migrations 0001â€“0006, manifest,
  original ACL/security SQL and protected one-stock-ledger boundaries are intact.

## Actual Neon preservation retention, not a synthetic API object

The runner fetches the preservation branch from Neon's authenticated¶»§q«^