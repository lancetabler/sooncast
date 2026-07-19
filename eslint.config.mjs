import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // External API payloads are legitimately untyped; we normalize them at the boundary.
      "@typescript-eslint/no-explicit-any": "off",
      // Team/series logos come from remote hosts; next/image isn't worth it for tiny badges.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "legacy/**",
  ]),
]);

export default eslintConfig;
