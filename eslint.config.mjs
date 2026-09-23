import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const legacyRuntimeCompatibility = {
  files: [
    "app/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "middleware.ts"
  ],
  rules: {
    // Existing prototype behavior is intentionally preserved during W0-01.
    // These findings remain visible as warnings and must be removed module-by-module
    // when the corresponding legacy/runtime code is migrated to the target architecture.
    "@next/next/no-html-link-for-pages": "warn",
    "react-hooks/rules-of-hooks": "warn",
    "react-hooks/set-state-in-effect": "warn"
  }
};

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  legacyRuntimeCompatibility,
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "frappe_app/**",
    "next-env.d.ts",
    "src/platform/db/database.types.ts",
    "src/platform/db/kysely.types.ts"
  ])
]);
