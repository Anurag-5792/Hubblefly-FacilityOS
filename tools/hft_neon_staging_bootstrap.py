#!/usr/bin/env python3
"""HFT R1 Neon staging bootstrap runner. Source preparation only until review/execution pins are populated."""
from __future__ import annotations
try:
 from tools.hft_neon_recovery_v2 import validate_v2,validate_phase,PRODUCTION_ID,normalized as v2_normalized
except ModuleNotFoundError:
 from hft_neon_recovery_v2 import validate_v2,validate_phase,PRODUCTION_ID,normalized as v2_normalized
import argparse, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, ssl, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; SQL_DIR=ROOT/'db'/'migrations'; MANIFEST=SQL_DIR/'manifest.v1.json'
PROJECT='red-silence-36758131'; BRANCH='br-dawn-moon-azd9xzrp'; BRANCH_NAME='vercel-dev'; DB='neondb'
PGNUM='180006'; BASE='59fc9b758b28692103bb7bcc99fa8173cee478b5'
ENDPOINT='ep-lingering-tooth-azvv1jmr'; HOST='ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech'; OWNER='neondb_owner'
MIG='hft_staging_migration_owner'; RG='hft_r1_app_runtime'; RLOGIN='hft_staging_app_runtime'; AG='hft_r1_audit_verify'; ALOGIN='hft_staging_audit_verify'
LOCK='HFT:R1:NEON:STAGING:MIGRATIONS'; MANIFEST_SHA='ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355'
REVIEW_PIN=ROOT/'config/hft-bootstrap019-review.sha256'; EXEC_PIN=ROOT/'config/hft-bootstrap019-execution.sha256'
RECOVERY_SOURCE_PIN=ROOT/'config/hft-recovery-v2-source.sha256'
RECOVERY_WITNESS_PIN=ROOT/'config/hft-recovery-v2-witness-trust.sha256'
ROLE_SQL='HFT-R1-BOOTSTRAP-019¶»§q«^