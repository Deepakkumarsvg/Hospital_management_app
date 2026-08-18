// Lint config for the whole repository — backend (Node, ESM) and frontend
// (React) in one place, because they share conventions and a single `npm run
// lint` is the thing CI can actually enforce.
//
// The rule set is deliberately small. A brand-new config on a mature codebase
// that turns on everything produces thousands of findings, which get ignored,
// which makes the linter worse than useless. What is switched on here is the
// class of mistake that reaches production silently: an unused import that
// hides a bad refactor, a promise nobody awaited, a React hook with a stale
// dependency. Style is left to Prettier.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'frontend/public/sw.js', // generated service worker
    ],
  },

  js.configs.recommended,

  // ---- Backend: Node, ESM ---------------------------------------------------
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // An argument named `_something` is deliberately unused (Express error
      // handlers need four parameters whether or not they use them all).
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none', // `catch {}` with no binding is used throughout
      }],
      // A floating promise in a request handler is a request that returns
      // before its work is done.
      'no-async-promise-executor': 'error',
      'require-atomic-updates': 'off', // too noisy against the compensating-write patterns here
      'no-console': 'off',             // boot diagnostics and job logs are intentional
    },
  },

  // ---- Backend tests --------------------------------------------------------
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-unused-expressions': 'off',
    },
  },

  // ---- Repo scripts ---------------------------------------------------------
  // Standalone Node tools run with `node scripts/…` — same environment as the
  // backend, but outside backend/ so the block above does not reach them.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off', // these ARE a command-line interface
    },
  },

  // ---- Frontend: React ------------------------------------------------------
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // The new JSX transform means React need not be in scope.
      'react/react-in-jsx-scope': 'off',
      // Prop types are not used in this codebase; TypeScript would be the
      // answer to that question, not a second unenforced convention.
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // A stale dependency array is the most common source of "why is this
      // showing old data" — worth a warning rather than silence.
      'react-hooks/exhaustive-deps': 'warn',

      // --- Deliberately off ---------------------------------------------------
      //
      // Every screen fetches with useEffect + setState. This rule is right that
      // a data-fetching library would be better, and that is a tracked piece of
      // work (adopt React Query) rather than 93 inline suppressions — which is
      // what leaving it on would produce. Turning it back on is the checkpoint
      // for that migration being finished.
      'react-hooks/set-state-in-effect': 'off',
      // Apostrophes in ordinary English prose. The suggested fix makes the copy
      // harder to read than the "problem" it removes.
      'react/no-unescaped-entities': 'off',
    },
  },

  // Suppression comments left behind by earlier rules go stale silently, so
  // they are reported as problems in their own right.
  {
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
  },
];
