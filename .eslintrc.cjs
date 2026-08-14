module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
  },
  overrides: [
    {
      // Scoped to the API: it is the only workspace with scheduled jobs, and a
      // global rule would be dead weight in mobile/web/shared.
      files: ['apps/api/src/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            // `@Cron('...')` and `@Cron(`...`)`. The member-expression form the
            // rule steers people towards is not matched.
            selector:
              "Decorator > CallExpression[callee.name='Cron'] > :matches(Literal, TemplateLiteral)",
            message:
              'Cron schedules must come from CRON_SCHEDULES in common/cron.constants.ts, ' +
              'so every scheduled job is discoverable in one place.',
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '.turbo', 'coverage'],
};
