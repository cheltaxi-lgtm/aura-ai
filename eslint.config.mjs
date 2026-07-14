import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**/*.mjs",
      "mobile/android/app/build/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // React Compiler rules — too strict for current codebase patterns (fetch in useEffect).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default eslintConfig;
