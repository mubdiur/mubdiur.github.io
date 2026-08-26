import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['js/ide/vendor/**', 'wasm/**', 'fonts/**', 'build/*.js', 'test-ide.js'],
  },
  {
    files: ['js/**/*.js', 'build/*.js', 'test-ide.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        App: 'readonly',
        TOOLMANIFEST: 'readonly',
        TOOLCATEGORIES: 'readonly',
        TOOLS_BY_SLUG: 'readonly',
        ICONS: 'readonly',
        ICON_ALIASES: 'readonly',
        NewsSvg: 'readonly',
        Charts: 'readonly',
        Transforms: 'readonly',
        CryptoRand: 'readonly',
        MyersDiff: 'readonly',
        Core: 'readonly',
        loadWasm: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-imports': 'off',
      'eqeqeq': ['warn', 'smart'],
      'no-throw-literal': 'warn',
      'no-eval': 'off',
      'no-implied-eval': 'warn',
      'no-console': 'off',
      'no-debugger': 'error',
    },
  },
  {
    files: ['js/ide/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.worker,
        importScripts: 'readonly',
      },
    },
  },
  {
    files: ['js/ide/cache.js', 'js/ide/run.js', 'js/ide/*.js'],
    languageOptions: { sourceType: 'module' },
  },
];
