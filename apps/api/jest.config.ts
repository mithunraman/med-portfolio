import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  // Allow ts-jest to transform ESM-only packages (nanoid, @langchain, etc.)
  // Default ignores all node_modules; we let everything through.
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@acme/shared$': '<rootDir>/../../../packages/shared/src',
    '^@acme/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  // Integration tests may be slow (real DB, real graph)
  testTimeout: 30000,
};

export default config;
