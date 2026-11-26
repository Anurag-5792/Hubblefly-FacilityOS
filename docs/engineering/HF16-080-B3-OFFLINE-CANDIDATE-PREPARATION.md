# HF16-080 — offline B3 candidate preparation

HOLD, source-only. No database, HTTP, credential, signing or stock writes. Run using the two actual private XLSX exports and independently observed live revision. Keep inputs and all outputs outside GitHub.

```sh
node tools/hft_b3_offline_stage.mjs --self-test
node tools/hft_b3_offline_stage.mjs --retained /private/retained.xlsx --live /private/live.xlsx --live-revision 4839 --output /private/hf16-b3-stage-080
```

The output parent must exist and the target directory must not. Python 3 standard library extracts cached effective values; the original exports remain the authoritative raw bytes. The generator preserves matrices and separate unapproved candidate records, global serial/alias duplicate checks, source-row linkage, retired identifiers, inspection, SFG design references and movement holds. JSON partitions are limited to 2,000 records. The SHA-256 manifest covers source and output files. Exit 0 means offline structural checks passed, never import authorization. Exit 2 preserves private output with structural or formula-cache holds. Exit 1 means extraction/contract/IO failure. Do not infer approval from a display-name checkbox. Missing UOM, scope, version, certified locations and identity remain unresolved; never fabricate them. No operational record is admitted. These JSON partitions are not the existing weekend-077 CSV contract and must not be posted to Live Masters, P3 or stock APIs. Reuse the existing compatible CSV validation utility only after mapping actual required references. Full original-workbook run, cache/value comparison, CSV conversion, import compatibility and independent database qualification are outstanding. This is an initial bounded staging adapter, not a database importer.
