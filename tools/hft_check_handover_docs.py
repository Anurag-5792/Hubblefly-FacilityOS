"""Verify obvious internal source references do not enter recipient handover docs.

This check is a limited public-text backstop; human disclosure review is required.
It does not inspect or distribute private internal engineering dossiers.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HANDOVER = ROOT / "docs" / "handover"

FORBIDDEN = {
    "source hosting / version control": re.compile(
        r"github(?:\.com)?|gitlab(?:\.com)?|bitbucket(?:\.org)?|git@|\bgit\s+(?:clone|checkout|show|diff|log)\b",
        re.IGNORECASE,
    ),
    "developer source path": re.compile(
        r"(?:^|[\s`(])(?:src|lib|app|db|tools|tests|docs/(?:engineering|internal|adr))/[\w./-]+",
        re.IGNORECASE,
    ),
    "source revision reference": re.compile(
        r"\b(?:source\s+commit|repository\s+revision|developer\s+branch|upstream\s+commit|source\s+blob)\b",
        re.IGNORECASE,
    ),
    "commit-like identifier": re.compile(r"\b[0-9a-f]{40}\b", re.IGNORECASE),
    "source file reference": re.compile(
        r"(?:^|[\s`(])(?:[\w.-]+/)*[\w.-]+\.(?:tsx?|jsx?|py|sql|go|rs|java|cpp|hpp)(?:[\s`),.:]|$)",
        re.IGNORECASE,
    ),
    "source-code fenced block": re.compile(
        r"^\s*```\s*(?:typescript|javascript|tsx?|jsx?|python|sql|java|go|rust|cpp|c\+\+)(?:\s|$)",
        re.IGNORECASE,
    ),
}


def check_document(text: str, path: str = "<document>") -> list[str]:
    """Return only locations and categories, never leak matched source text."""
    issues: list[str] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        for category, regex in FORBIDDEN.items():
            if regex.search(line):
                issues.append(f"{path}:{line_no}: {category}")
    return issues


def main() -> int:
    if not HANDOVER.is_dir():
        print("HANDOVER_DOCS_MISSING", file=sys.stderr)
        return 1
    files = sorted(HANDOVER.rglob("*.md"))
    if not files:
        print("HANDOVER_DOCS_EMPTY", file=sys.stderr)
        return 1
    failures: list[str] = []
    for file in files:
        failures.extend(check_document(file.read_text(encoding="utf-8"), str(file.relative_to(ROOT))))
    for issue in failures:
        print(issue, file=sys.stderr)
    if failures:
        print(f"HANDOVER_BOUNDARY_FAIL ({len(failures)})", file=sys.stderr)
        return 1
    print(f"HANDOVER_BOUNDARY_PASS ({len(files)} documents; source-reference backstop only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
