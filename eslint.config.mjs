// ESLint 9 (flat config). Da Next 16 `next lint` non esiste più: lo script
// `lint` lancia `eslint .` con le regole di Next (core-web-vitals).
import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  globalIgnores(['.next/**', 'node_modules/**', 'tests/carico/**']),
  {
    extends: [...nextCoreWebVitals],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
]);
