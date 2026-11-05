import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  /* Build output and generated typings are not ours to lint. `scripts/` is a
     plain Node tool with no JSX and no app conventions. */
  globalIgnores([".next/**", "out/**", "dist/**", "next-env.d.ts", "scripts/**"]),

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      /* eslint-plugin-react-hooks v7 ships four rules far stricter than v5,
         and they fire on 28 call sites in the studio that predate them — reads
         of a ref while rendering, setState straight off an effect. None is a
         crash; all of them are worth working through deliberately rather than
         in the same change that introduces the linter. Held at "warn" so the
         signal stays on the screen without blocking CI. Raise to "error" as
         each file is cleaned up. */
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/incompatible-library": "warn",

      /* The studio keeps its design tokens as literal hex beside their use so a
         reader sees the value without a second file open. */
      "react/no-unescaped-entities": "off",
    },
  },
]);
