import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Minimal correctness gate (Claude audit #1/#3).
 * Intentionally not: Prettier, import sorting, stylistic rules, complexity caps.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'brand/**',
      // Tooling / ad-hoc scripts — not part of the app correctness gate.
      'babel.config.js',
      'scripts/**',
      // Deno Edge Functions — separate toolchain (see tsconfig exclude).
      'supabase/functions/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Type-aware correctness (only the rules Claude called out + close cousins).
      '@typescript-eslint/no-floating-promises': 'error',
      // RN/Expo pass async handlers to onPress etc.; void-return checks on
      // JSX attributes create false positives without catching real bugs.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // TypeScript already enforces these; eslint recommended duplicates them.
      'no-undef': 'off',
      // Existing codebase uses these patterns; not the goal of this gate.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
