import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const cli = process.platform === "win32"
  ? "node_modules/.bin/supabase.cmd"
  : "node_modules/.bin/supabase";

const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
if (version.status !== 0) {
  process.stderr.write(version.stderr || "Unable to read Supabase CLI version\n");
  process.exit(version.status ?? 1);
}

if (!existsSync("supabase/config.toml")) {
  const init = spawnSync(cli, ["init"], { encoding: "utf8" });
  process.stdout.write(init.stdout || "");
  process.stderr.write(init.stderr || "");
  if (init.status !== 0) process.exit(init.status ?? 1);
}

process.stdout.write("=== W0_02_SUPABASE_VERSION_BEGIN ===\n");
process.stdout.write(version.stdout.trim() + "\n");
process.stdout.write("=== W0_02_SUPABASE_VERSION_END ===\n");
process.stdout.write("=== W0_02_CONFIG_BEGIN ===\n");
process.stdout.write(readFileSync("supabase/config.toml", "utf8"));
process.stdout.write("\n=== W0_02_CONFIG_END ===\n");
process.stdout.write("=== W0_02_PNPM_LOCK_BEGIN ===\n");
process.stdout.write(readFileSync("pnpm-lock.yaml", "utf8"));
process.stdout.write("\n=== W0_02_PNPM_LOCK_END ===\n");
