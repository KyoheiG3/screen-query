import importPlugin from 'eslint-plugin-import'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      '.git/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.log',
      '**/*.config.{ts,js,cjs}',
      'jest.config.base.js',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  // React/Import plugins and rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.ts',
          ],
        },
      },
    },
    rules: {
      // React/React Hooks recommended rules
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      // Import plugin recommended rules
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,

      // TypeScript basic rule adjustments
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],

      // React specific rules
      'react/prop-types': 'off', // Not needed with TypeScript type definitions
      'react/jsx-curly-brace-presence': ['error', {
        props: 'never',
        children: 'never',
      }],
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-no-useless-fragment': 'error',

      // import/order rule
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [
            {
              pattern: '~/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],

      // Additional Import plugin rules
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-default-export': 'error',
      'import/no-duplicates': 'error',
      'import/no-relative-parent-imports': ['error', { ignore: ['~'] }],
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import/newline-after-import': 'error',

      // Others
      'no-console': 'warn',
      'no-undef': 'off', // TypeScript handles this check
      'consistent-return': 'error', // Enforce functions to either always return a value or never
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
          noWarnOnMultipleProjects: true,
        },
      },
      'import/internal-regex': '^~/',
    },
  },
  // Rules for test code
  {
    files: ['**/*.test.{ts,tsx}', '**/test-utils/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
