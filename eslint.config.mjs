import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const sharedRules = {
  // No `any`. Explicit opt-out required via eslint-disable-next-line.
  '@typescript-eslint/no-explicit-any': 'error',

  // No unused variables / functions / imports.
  // Prefix with `_` to intentionally mark something as ignored.
  '@typescript-eslint/no-unused-vars': ['error', {
    vars:               'all',
    args:               'after-used',
    ignoreRestSiblings: false,
    argsIgnorePattern:  '^_',
    varsIgnorePattern:  '^_',
    caughtErrorsIgnorePattern: '^_',
  }],

  '@typescript-eslint/no-unused-expressions': 'error',

  // Turn off the base JS rule in favor of the TS-aware one.
  'no-unused-vars': 'off',
};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
  {
    files: ['extension/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './extension/tsconfig.json',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
];
