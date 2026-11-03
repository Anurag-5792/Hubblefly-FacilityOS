# HFT-R1 NEON PRECHANGE RECOVERY V2 â€” SOURCE 025

Status: REVIEW REQUIRED; **no branch creation, snapshot, backup, role, DDL, or restore executed.**

Recovery V1 root-only manual snapshot assumption is superseded and prohibited for the staging child branch.

Gate R (independent future recovery authorization) enables only preservation branch from `br-dawn-moon-azd9xzrp`, PG18 custom-format direct-TLS dump, role/membership/schema/extension/object/ownership/ACL inventory, and two independently witnessed isolated restore exercises. Gate R is separate from later Gate A canonical bootstrap approval; Gate A binds an immutable SHA-256 of the complete Recovery V2 manifest and exact runner/source hashes. Gate R does not require final Gate A to exist.

Recovery V2 manifest schema is `HFT_R1_NEON_PRECHANGE_RECOVERY_V2`, with `project_id`, `source_branch_id`, `database`, `source_state_sha256`, `preservation`, `dump`, `inventory`, `restore_a`, `restore_b`, `independent_witness`, `evidence_created_at`, and `evidence_expires_at`. Preserve all accompanying evidence in restricted custody; the source tests use synthetic bytes only.

Provider preservation branch requires exact parent, parent LSN, parent timestamp if available, creation time, not default/primary, zero new endpoints, and independently confirmed finite expiry or actual indefinite provider evidence. A finite expiry can NEVER masquerade as indefinite. Provider evidence is canonically normalized and SHA-256 bound.

Dump requires dir¶»§q«^