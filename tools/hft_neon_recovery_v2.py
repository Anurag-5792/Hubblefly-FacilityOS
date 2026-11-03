"""HFT_R1_NEON_PRECHANGE_RECOVERY_V2, bounded source-only qualification.

All provider records must be independently retrieved immediately before use.
Evidence hashes provide integrity, not provenance. A trusted, independently
registered human Ed25519 signature is required to establish the witness claim.
No Neon writes, backups or restores are executed by this module.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

PROJECT='red-silence-36758131'
STAGING='br-dawn-moon-azd9xzrp'
PRODUCTION_ID='br-bold-smoke-az9qmfaf'
DB='neondb'
SCHEMA='HFT_R1_NEON_PRECHANGE_RECOVERY_V2'
HEX=re.compile(r'^[a-f0-9]{64}$')
BRANCH=re.compile(r'^br-[a-z0-9-]{8,80}$')
LSN=re.compile(r'^[0-9A-F]+/[0-9A-F]+$')

def stop(code): raise ValueError('RECOVERY_V2_'+code)
def sha(data): return hashlib.sha256(data).hexdigest()
def normalized(data): return (json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
def instant(text):
 if not isinstance(text,str):stop('UTC_TIMESTAMP_REQUIRED')
 try:
  parsed=dt.datetime.fromisoformat(text.replace('Z','+00:00'))
  if parsed.tzinfo is None:stop('UTC_TIMESTAMP_REQUIRED')
  return parsed.astimezone(dt.timezone.utc)
 except (ValueError,TypeError,AttributeError):stop('UTC_TIMESTAMP_INVALID')
def fields(value,names):
 if not isinstance(value,dict) or set(value)!=set(names):stop('SCHEMA_KEYS')
 return value
def digest(value):
 i¶»§q«^