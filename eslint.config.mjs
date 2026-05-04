import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', {
    vars:                      'all',
    args:                      'after-used',
    ignoreRestSiblings:        false,
    argsIgnorePattern:         '^_',
    varsIgnorePattern:         '^_',
    caughtErrorsIgnorePattern: '^_',
  }],
  '@typescript-eslint/no-unused-expressions': 'error',
  'no-unused-vars': 'off',
};

export default [
  {
    files: ['packages/relayer/src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './packages/relayer/tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
  {
    files: ['packages/relayer/extension/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './packages/relayer/extension/tsconfig.json',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
  {
    files: ['packages/wallet/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './packages/wallet/tsconfig.json',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      ...sharedRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['website/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
