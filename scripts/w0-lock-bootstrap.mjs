import { readFileSync } from "node:fs";

const markerStart = "=== W0_PNPM_LOCK_BEGIN ===";
const markerEnd = "=== W0_PNPM_LOCK_END ===";

process.stdout.write(`${markerStart}\n`);
process.stdout.write(readFileSync("pnpm-lock.yaml", "utf8"));
process.stdout.write(`\n${markerEnd}\n`);
