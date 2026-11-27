#!/usr/bin/env python3
"""HF100 host qualification only. No SQL mutation, credential creation or admission.
Use a pre-existing private libpq passfile; never place passwords on the command line.
This probe is evidence for a future reviewed installer, not an installer or signer.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess

CLIENTS = ('psql', 'pg_dump', 'pg_restore')
LOCAL_PG = ('initdb', 'pg_ctl', 'postgres')
COMMON = ('git', 'gpg', 'gpgv', 'openssl')


def run(args, *, env=None, data=None, timeout=10):
    try:
        p = subprocess.run(args, input=data, text=True, capture_output=True,
                           env=env, timeout=timeout, check=False)
        return p.returncode, p.stdout, p.stderr
    except (OSError, subprocess.TimeoutExpired):
        return 125, '', ''


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def discover(name, extra):
    path = shutil.which(name, path=extra + ':' + os.environ.get('PATH', ''))
    if not path:
        return {'available': False}
    p = Path(path).resolve()
    rc, out, err = run([str(p), '--version'])
    first = (out or err).splitlines()
    version = first[0][:160] if first else ''
    try:
        return {'available': True, 'path': str(p), 'version': version,
                'version_exit': rc, 'sha256': digest(p),
                'owner_uid': p.stat().st_uid,
                'group_world_writable': bool(p.stat().st_mode & 0o022)}
    except OSError:
        return {'available': False, 'reason': 'READ_FAILED'}


def pg18(tool):
    return (tool.get('available') is True and tool.get('version_exit') == 0
            and bool(re.search(r'\b18\.\d+\b', tool.get('version', ''))))


def private_regular(path, uid):
    try:
        p = Path(path)
        s = p.lstat()
        return (p.is_absolute() and stat.S_ISREG(s.st_mode) and s.st_uid == uid
                and not (s.st_mode & 0o077))
    except (OSError, TypeError):
        return False


def hostname_valid(s):
    return bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{1,252}', s)) and '..' not in s


def target_identity_matches(row, args):
    return (row.get('database') == args.database and row.get('actor') == args.user
            and row.get('oid') == args.oid and row.get('pg') == 180007
            and row.get('in_recovery') is False)


def connect_probe(args, tools, uid):
    if not (args.connect and all(pg18(tools[n]) for n in CLIENTS) and uid != 0):
        return {'executed': False, 'reason': 'CLIENT_OR_NONROOT_GATE'}
    if not (args.ca and args.passfile and private_regular(args.passfile, uid)):
        return {'executed': False, 'reason': 'MANAGED_PRIVATE_PASSFILE_REQUIRED'}
    ca = Path(args.ca)
    if not ca.is_absolute() or not ca.is_file() or ca.is_symlink():
        return {'executed': False, 'reason': 'CA_REQUIRED'}
    if not args.ca_sha256 or digest(ca) != args.ca_sha256:
        return {'executed': False, 'reason': 'CA_PIN_MISMATCH'}
    # Rebuild libpq environment; no inherited PG*, service files, password, or shell interpolation.
    env = {'PATH': os.environ.get('PATH', ''), 'HOME': '/nonexistent', 'LANG': 'C',
           'PGPASSFILE': args.passfile, 'PGSSLMODE': 'verify-full',
           'PGSSLROOTCERT': str(ca), 'PGCHANNELBINDING': 'require',
           'PGCONNECT_TIMEOUT': '8', 'PGAPPNAME': 'hf100-read-only-host-probe',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=5000'}
    query = ("SELECT json_build_object('database',current_database(),'actor',current_user,"
             "'oid',(SELECT oid::int FROM pg_database WHERE datname=current_database()),"
             "'pg',current_setting('server_version_num')::int,'in_recovery',pg_is_in_recovery())::text;")
    cmd = [tools['psql']['path'], '-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
           '-h', args.host, '-p', str(args.port), '-U', args.user, '-d', args.database]
    rc, out, _ = run(cmd, env=env, data='\\conninfo\n' + query + '\n', timeout=20)
    if rc:
        return {'executed': True, 'pass': False, 'exit': rc, 'reason': 'STRICT_CONNECTION_FAILED'}
    lines = out.splitlines()
    # Do not echo arbitrary query output or stderr. Retain only selected identity fields.
    try:
        row = json.loads(next(l for l in lines if l.startswith('{')))
        ssl_reported = any('SSL connection' in l for l in lines)
        match = target_identity_matches(row, args)
    except (ValueError, StopIteration, TypeError):
        return {'executed': True, 'pass': False, 'reason': 'IDENTITY_OUTPUT_INVALID'}
    return {'executed': True, 'pass': bool(ssl_reported and match),
            'client_ssl_reported': ssl_reported, 'sslmode': 'verify-full',
            'channel_binding': 'require', 'identity_match': match,
            'server_version_num': row.get('pg'), 'database_oid': row.get('oid')}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--host', required=True); p.add_argument('--database', required=True)
    p.add_argument('--user', required=True); p.add_argument('--oid', type=int, required=True)
    p.add_argument('--port', type=int, default=5432)
    p.add_argument('--pg-bin', default='/usr/lib/postgresql/18/bin')
    p.add_argument('--connect', action='store_true')
    p.add_argument('--ca'); p.add_argument('--ca-sha256'); p.add_argument('--passfile')
    args = p.parse_args()
    if not hostname_valid(args.host) or not (1 <= args.port <= 65535 and args.oid > 0):
        p.error('invalid target')
    for value in (args.database, args.user):
        if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]{0,62}', value):
            p.error('database and user must be literal PostgreSQL identifiers')
    tools = {n: discover(n, args.pg_bin) for n in CLIENTS + LOCAL_PG + COMMON}
    uid = os.geteuid()
    try:
        socket.getaddrinfo(args.host, args.port, type=socket.SOCK_STREAM)
        dns = True
    except OSError:
        dns = False
    unshare = shutil.which('unshare')
    isolation = bool(unshare and run([unshare, '-Urn', 'true'])[0] == 0)
    recovery_tools = all(pg18(tools[n]) for n in LOCAL_PG)
    clients = all(pg18(tools[n]) for n in CLIENTS)
    connection = connect_probe(args, tools, uid) if dns else {'executed': False, 'reason': 'DNS_FAILED'}
    result = {'schema': 'HF100_HOST_CAPABILITY_PROBE_V1', 'nonroot': uid != 0,
              'dns_resolves': dns, 'postgres18_clients': clients,
              'postgres18_local_recovery_binaries': recovery_tools,
              'user_network_namespace_probe': isolation,
              'native_recovery_candidate': bool(uid != 0 and recovery_tools and isolation),
              'tools': tools, 'wire': connection,
              'actual_restore_executed': False, 'installation_authorized': False}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if (uid != 0 and clients and recovery_tools and isolation and connection.get('pass')) else 2


if __name__ == '__main__':
    raise SystemExit(main())
