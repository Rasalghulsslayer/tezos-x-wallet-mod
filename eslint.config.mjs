import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // Variables déclarées mais non utilisées
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
        argsIgnorePattern: '^_',   // _param autorisé comme convention "intentionnellement ignoré"
        varsIgnorePattern: '^_',
      }],

      // Interdit any sauf là où c'est explicitement justifié (eslint-disable-next-line)
      '@typescript-eslint/no-explicit-any': 'error',

      // Imports de type non utilisés
      '@typescript-eslint/no-unused-expressions': 'error',

      // Désactiver la règle JS de base au profit de la version TS
      'no-unused-vars': 'off',
    },
  },
];
