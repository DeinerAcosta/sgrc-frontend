// ESLint flat config — frontend (React 18 + Vite)
// Cubre los errores típicos de hooks (deps faltantes, llamadas condicionales)
// y compatibilidad con react-refresh (HMR de Vite).

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
    },
    settings: {
      react: { version: '18.3' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Bugs frecuentes
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // React — el modo nuevo de JSX no requiere import de React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // PropTypes no se usa en este proyecto
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'warn',
      'react/no-unescaped-entities': 'off',

      // Hooks — los más útiles
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Vite HMR
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Archivos de configuración (vite.config.js, postcss.config.js, etc.) corren en Node
  {
    files: ['*.config.{js,cjs,mjs}', 'vite.config.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]
