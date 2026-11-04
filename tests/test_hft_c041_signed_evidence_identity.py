"""C041 signed-envelope and Ed25519 cryptographic-identity source tests.

Every predecessor variant is re-signed with independently generated TEST-ONLY
keys. Never signs a corporate identity or queries a PostgreSQL/Neon database.
The production historical verifier and runner history gate remain unmocked.
"""
from __future__ import annotations

import contextlib
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import hft_c028_catalog as catalog
from tools import hft_c039_history as history
from tools import hft_neon_staging_bootstrap as runner

spec=importlib.util.spec_from_file_location(
 'c041_c039_fixture',Path(__file__).with_name(
  'test_hft_c039_authenticated_history.py'))
fixture_module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_module)


class C041EvidenceIdentity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  fixture_module.SignedHistory.setUpClass()
  cls.fx=fixture_module.SignedHistory(
   'test_valid_corporate_pinned_ed25519_chain_s0_s5')

 @classmethod
 def tearDownClass(cls):
  fixture_module.SignedHistory.tearDownClass()

 def variant(self,root,change_artifact=None):
  return self.fx.signed_baseline_variant(root,
   change_artifact=change_artifact)

 def assert_rejected_by_history_and_real_runner(self,mp,ms,fmap,root_sha,
     expected='ORIGINAL_TRANSPORT_'):
  with self.assertRaisesRegex(ValueError,expected):
   self.fx.validate('S0',manifest_path=mp,manifest_sha=ms,
    file_map_path=fmap,baseline_sha=root_sha)
  # The real production main() stops through authenticated_history_gate()
  # before it can even call the synthetic PostgreSQL transport.
  with tempfile.TemporaryDirectory(prefix='c041-runner-') as t:
   d=Path(t)
   proof=d/'continuity.json'
   fixture_module.save_json(proof,self.fx.proofs['S0'])
   for name in ('auth.json','recovery.json','filemap.json'):
    (d/name).write_text('{"synthetic":true}')
   auth=self.fx.auth('S0')
   auth['historical_manifest_sha256']=ms
   auth['historical_root_collection_sha256']=root_sha
   argv=['source-test-only','prepare-security',
    '--journal',str(d/'journal.jsonl'),
    '--role-continuity-evidence',str(proof),
    '--historical-manifest',str(mp),
    '--historical-file-map',str(fmap),
    '--authorization-artifact',str(d/'auth.json'),
    '--recovery-evidence',str(d/'recovery.json'),
    '--snapshot-detail-readback',str(d/'filemap.json')]
   with contextlib.ExitStack() as stack:
    stack.enter_context(patch.object(sys,'argv',argv))
    stack.enter_context(patch.object(catalog,'STAGE_PATHS',self.fx.refs))
    stack.enter_context(patch.object(runner,'pin',side_effect=self.fx.pin))
    stack.enter_context(patch.object(runner,'clean_worktree'))
    stack.enter_context(patch.object(runner,'control_plane_live',
     return_value={'captured_at_utc':'SYNTHETIC_TEST'}))
    stack.enter_context(patch.object(runner,'auth_artifact',
     return_value=auth))
    db=stack.enter_context(patch.object(runner,'psql',
     side_effect=AssertionError('MUTATING_SQL_REACHED')))
    with self.assertRaisesRegex(runner.Stop,
        'HISTORICAL_PREDECESSOR_NOT_AUTHENTICATED'):
     runner.main()
    db.assert_not_called()

 def key_variant(self,folder,purpose,pem):
  d=Path(folder)
  trust=copy.deepcopy(self.fx.trust[purpose]['record'])
  trust['public_key_pem']=pem
  trustfile=d/(purpose+'-trust.json')
  pin=fixture_module.save_json(trustfile,trust)
  manifest=json.loads(self.fx.manifests['S0'][0].read_bytes())
  manifest[purpose+'_trust_sha256']=pin
  mp=d/'manifest.json'
  ms=fixture_module.save_json(mp,manifest)
  locations=json.loads(self.fx.maps['S0'].read_bytes())
  locations[purpose+'_trust']=str(trustfile)
  fm=d/'locations.json'
  fixture_module.save_json(fm,locations)
  return mp,ms,fm,pin

 def test_valid_distinct_ed25519_and_original_signed_chain(self):
  collector=self.fx.trust['collector']['record']['public_key_pem']
  witness=self.fx.trust['witness']['record']['public_key_pem']
  self.assertNotEqual(history.ed25519_public_key_identity(collector),
   history.ed25519_public_key_identity(witness))
  self.assertEqual(self.fx.validate('S0')['stage'],'S0')
  original=self.fx.artifacts[0]
  history.verify_signature(collector,
   original['collection_path'].read_bytes(),
   original['collector_signature_path'].read_bytes())
  history.verify_signature(witness,
   original['witness_path'].read_bytes(),
   original['witness_signature_path'].read_bytes())
  for stage in catalog.STAGES:
   with self.subTest(stage=stage):
    self.assertEqual(self.fx.validate(stage)['stage'],stage)

 def test_original_envelope_all_fields_reconstructed_and_canonical(self):
  original=json.loads(self.fx.artifacts[0]['collection_path'].read_bytes())
  from_transport={}
  observed,phase,revisions=catalog.collect(
   lambda sql:original['transport_jsonl'],include_phase=True,
   expected_identity=(runner.DB,runner.OWNER,runner.PGNUM),
   evidence_out=from_transport,branch_id=runner.BRANCH)
  self.assertEqual(observed,original['catalog'])
  self.assertEqual(phase,original['phase'])
  self.assertEqual(revisions,original['revisions'])
  self.assertEqual({key:from_transport[key]
   for key in history.ENVELOPE_FIELDS},original['collection_envelope'])
  self.assertEqual(original['collection_id'],
   catalog.sha(catalog.canonical(original['collection_envelope'])))

 def test_resigned_backend_pid_snapshot_with_recomputed_id_fails_before_sql(self):
  for kind in ('backend_pid','snapshot'):
   for recompute_id in (False,True):
    with self.subTest(kind=kind,recomputed_id=recompute_id):
     with tempfile.TemporaryDirectory(prefix='c041-identity-') as t:
      def alter(obj):
       envelope=obj['collection_envelope']
       if kind=='backend_pid':envelope['backend_pid']+=12345
       else:envelope['snapshot']='9988:9988:'
       if recompute_id:
        obj['collection_id']=catalog.sha(catalog.canonical(envelope))
      mp,ms,fmap,root=self.variant(t,alter)
      self.assert_rejected_by_history_and_real_runner(
       mp,ms,fmap,root,'ORIGINAL_TRANSPORT_ENVELOPE_IDENTITY_MISMATCH')

 def test_resigned_db_session_version_and_digest_claims_fail_before_sql(self):
  mutations={
   'db_user':lambda e:e.update(db_user='forged_login'),
   'session_user':lambda e:e.update(session_user='forged_session'),
   'server_version':lambda e:e.update(server_version='170000'),
   'transport_sha256':lambda e:e.update(transport_sha256='a'*64),
   'phase_sha256':lambda e:e.update(phase_sha256='b'*64),
   'revision_sha256':lambda e:e.update(revision_sha256='c'*64)
  }
  for name,mutate in mutations.items():
   with self.subTest(claim=name),tempfile.TemporaryDirectory(
       prefix='c041-claimed-') as t:
    def alter(obj):
     mutate(obj['collection_envelope'])
     obj['collection_id']=catalog.sha(catalog.canonical(
      obj['collection_envelope']))
    mp,ms,fmap,root=self.variant(t,alter)
    self.assert_rejected_by_history_and_real_runner(mp,ms,fmap,root,
     'COLLECTION_ORIGINAL_IDENTITY|ORIGINAL_TRANSPORT_')

 def test_same_ed25519_under_different_pem_serializations_rejected(self):
  collector=self.fx.trust['collector']['record']['public_key_pem']
  base64data=''.join(line for line in collector.splitlines()
   if not line.startswith('-----'))
  variants=(collector,'\n'+collector.strip()+'\n\n',
   '-----BEGIN PUBLIC KEY-----\n'+
    '\n'.join(base64data[i:i+18] for i in range(0,len(base64data),18))+
    '\n-----END PUBLIC KEY-----\n')
  for index,variant in enumerate(variants):
   with self.subTest(serialization=index),tempfile.TemporaryDirectory() as t:
    self.assertEqual(history.ed25519_public_key_identity(collector),
     history.ed25519_public_key_identity(variant))
    mp,ms,fmap,pin=self.key_variant(t,'witness',variant)
    with self.assertRaisesRegex(ValueError,
      'COLLECTOR_WITNESS_KEY_NOT_INDEPENDENT'):
     self.fx.validate('S0',manifest_path=mp,manifest_sha=ms,
      file_map_path=fmap,witness_pin=pin)

 def test_non_ed25519_malformed_truncated_and_invalid_pem_denied(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t)
   private=d/'rsa-private-test-only.pem'
   public=d/'rsa-public-test-only.pem'
   fixture_module.command(['openssl','genpkey','-algorithm','RSA',
    '-pkeyopt','rsa_keygen_bits:2048','-out',str(private)])
   fixture_module.command(['openssl','pkey','-in',str(private),
    '-pubout','-out',str(public)])
   witness=self.fx.trust['witness']['record']['public_key_pem']
   for label,pem,expected in (
    ('rsa',public.read_text(),'CORPORATE_KEY_NOT_ED25519'),
    ('truncated',witness[:44]+'\n-----END PUBLIC KEY-----\n',
     'CORPORATE_PUBLIC_KEY_PARSE_FAILED'),
    ('malformed','-----BEGIN PUBLIC KEY-----\nnot_base64!\n-----END PUBLIC KEY-----\n',
     'CORPORATE_PUBLIC_KEY_PARSE_FAILED'),
    ('missing_header','malformed PEM text','CORPORATE_PUBLIC_KEY_FORMAT')):
    with self.subTest(case=label),tempfile.TemporaryDirectory() as folder:
     mp,ms,fmap,pin=self.key_variant(folder,'witness',pem)
     with self.assertRaisesRegex(ValueError,expected):
      self.fx.validate('S0',manifest_path=mp,manifest_sha=ms,
       file_map_path=fmap,witness_pin=pin)

 def test_two_valid_signatures_under_same_key_still_not_independent(self):
  # Original collector signature is valid. Sign the real witness bytes with
  # the collector key; both signatures verify, but crypto key identity is one.
  with tempfile.TemporaryDirectory() as t:
   d=Path(t)
   baseline=self.fx.artifacts[0]
   collector_pem=self.fx.trust['collector']['record']['public_key_pem']
   new_signature=self.fx.sign('collector',baseline['witness_path'],
    d/'shared-witness.sig')
   history.verify_signature(collector_pem,
    baseline['collection_path'].read_bytes(),
    baseline['collector_signature_path'].read_bytes())
   history.verify_signature(collector_pem,
    baseline['witness_path'].read_bytes(),new_signature.read_bytes())
   witness=copy.deepcopy(self.fx.trust['witness']['record'])
   witness['public_key_pem']='\n'+collector_pem.strip()+'\n'
   trustfile=d/'same-key-witness-trust.json'
   pin=fixture_module.save_json(trustfile,witness)
   manifest=json.loads(self.fx.manifests['S0'][0].read_bytes())
   manifest['witness_trust_sha256']=pin
   manifest['records'][0]['witness_signature_sha256']=catalog.sha(
    new_signature.read_bytes())
   mp=d/'manifest.json'
   ms=fixture_module.save_json(mp,manifest)
   locations=json.loads(self.fx.maps['S0'].read_bytes())
   locations['witness_trust']=str(trustfile)
   locations['records'][0]['witness_signature']=str(new_signature)
   fmap=d/'locations.json'
   fixture_module.save_json(fmap,locations)
   with self.assertRaisesRegex(ValueError,
       'COLLECTOR_WITNESS_KEY_NOT_INDEPENDENT'):
    self.fx.validate('S0',manifest_path=mp,manifest_sha=ms,
     file_map_path=fmap,witness_pin=pin)

 def test_incorrect_ed25519_signature_rejected_after_key_parsing(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t)
   sig=d/'false-witness-signature'
   sig.write_bytes(bytes(64))
   manifest=json.loads(self.fx.manifests['S0'][0].read_bytes())
   manifest['records'][0]['witness_signature_sha256']=catalog.sha(
    sig.read_bytes())
   mp=d/'manifest.json'
   ms=fixture_module.save_json(mp,manifest)
   locations=json.loads(self.fx.maps['S0'].read_bytes())
   locations['records'][0]['witness_signature']=str(sig)
   fmap=d/'filemap.json'
   fixture_module.save_json(fmap,locations)
   with self.assertRaisesRegex(ValueError,'SIGNATURE_INVALID'):
    self.fx.validate('S0',manifest_path=mp,manifest_sha=ms,
     file_map_path=fmap)

if __name__=='__main__':
 unittest.main()
