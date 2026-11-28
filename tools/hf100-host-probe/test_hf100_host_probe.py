import tempfile
import unittest
import os
from pathlib import Path
from types import SimpleNamespace
import hf100_host_probe as h

class HostProbeTests(unittest.TestCase):
    def test_pg18(self):
        self.assertTrue(h.pg18({'available': True, 'version_exit': 0, 'version': 'psql (PostgreSQL) 18.7'}))
    def test_pg17_denied(self):
        self.assertFalse(h.pg18({'available': True, 'version_exit': 0, 'version': 'psql (PostgreSQL) 17.9'}))
    def test_failed_version_denied(self):
        self.assertFalse(h.pg18({'available': True, 'version_exit': 1, 'version': '18.7'}))
    def test_bad_host_denied(self):
        for name in ('postgres://host', '-host', 'bad host', 'a..b'):
            self.assertFalse(h.hostname_valid(name))
    def test_exact_identity(self):
        a = SimpleNamespace(database='target', user='installer', oid=16397)
        row = {'database':'target','actor':'installer','oid':16397,'pg':180007,'in_recovery':False}
        self.assertTrue(h.target_identity_matches(row,a))
        for key, v in [('database','other'),('actor','other'),('oid',1),('pg',180006),('in_recovery',True)]:
            self.assertFalse(h.target_identity_matches(dict(row, **{key:v}),a))
    def test_passfile_mode_and_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'passfile'; p.write_text('placeholder\n'); p.chmod(0o600)
            self.assertTrue(h.private_regular(str(p),os.geteuid()))
            p.chmod(0o644); self.assertFalse(h.private_regular(str(p),os.geteuid()))
            p.chmod(0o600); s=Path(d)/'link'; s.symlink_to(p)
            self.assertFalse(h.private_regular(str(s),os.geteuid()))
    def test_root_denied_without_connection(self):
        a=SimpleNamespace(connect=True); tools={n:{'available': True,'version_exit':0,'version':'18.7'} for n in h.CLIENTS}
        self.assertFalse(h.connect_probe(a,tools,0)['executed'])
    def test_missing_tools_denied_without_connection(self):
        a=SimpleNamespace(connect=True); tools={n:{'available': False} for n in h.CLIENTS}
        self.assertFalse(h.connect_probe(a,tools,1000)['executed'])

if __name__=='__main__': unittest.main()
