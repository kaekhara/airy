import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['public/upskill-app.js'],
    rules: {
      // This file is a vanilla browser script; similarly named local helpers are not React hooks.
      'react-hooks/rules-of-hooks': 'off',
      // Preserve the pre-existing inline script's lint baseline after moving it into a standalone asset.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
