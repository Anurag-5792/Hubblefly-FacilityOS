import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "frappe_app/**",
    "next-env.d.ts"
  ])
]);
