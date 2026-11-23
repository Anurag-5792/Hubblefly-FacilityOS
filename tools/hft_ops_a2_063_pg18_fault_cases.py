#!/usr/bin/env python3
"""Compatibility entrypoint for OPS063-F01..F08 source diagnostics.

IMPORTANT: The original independent Chat 17 fixtures remain
HF17-PG-F01..F08. This module never aliases or overwrites them.
See hft_ops_a2_067_qualification_catalog.py for the exact NON-EQUIVALENCE
crosswalk. All PostgreSQL cases remain NOT_TESTED.
"""
import sys
from pathlib import Path
TOOLS=Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:sys.path.insert(0,str(TOOLS))
from hft_ops_a2_067_qualification_catalog import CASES,CROSSWALK,HF17_ORIGINAL,A2_ORIGINAL
from hft_ops_a2_067_pg18_harness import main as admitted_main

def main(argv=None):
 return admitted_main(sys.argv[1:] if argv is None else argv)

if __name__=="__main__":
 raise SystemExit(main())
