"""Integration tests against the actual BOOTSTRAP-019 runner, never a live DB."""
import contextlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools import hft_neon_staging_bootstrap as runner
from tools import hft_neon_recovery_v2 as v2

HERE=Path(__file__).resolve().parent
S=importlib.util.spec_from_file_location('hft_v2_fixture',HERE/'test_hft_neon_recovery_v2.py')
F=importlib.util.module_from_spec(S)
S.loader.exec_module(F)

class RecoveryRunnerEnforcement(unittest.TestCase):
 def setUp(self):
  self.fixture=F.RecoveryV2Contract('test_positive_actual_test_signature')
  self.fixture.setUp()
  self.addCleanup(self.fixture.doCleanups)
  self.temporary=tempfile.TemporaryDirectory(prefix='hft026-runner-integration-')
  self.addCleanup(self.temporary.cleanup)
  self.root=Path(self.temporary.name)
  self.source_sha=runner.sha((runner.ROOT/'tools/hft_neon_recovery_v2.py').read_bytes())
  self.original_pin=runner.pin
 def materialize(self):
  r=self.fixture.e
  self.manifest=self.root/'recovery_manifest.json'
  self.manifest.write_bytes(v2.normalized(r))
  self.filemap=self.root/'filemap.json'
  self.filemap.write_bytes(v2.normalized(self.fixture.files))
  self.authorization={
   'authorization_id':'HFT-R1-MASTER-V3-SYNTHETIC-NOT-EXECUTABLE',
   'operator':'Test Operator Human','evidence_custodian':'Test Custodian Human',
   'independent_verifier':'Test Independent Human',
   'recovery_validator_s¶»§q«^