import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$', '/node_modules/'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@acme/shared$': '<rootDir>/../../../packages/shared/src',
    '^@acme/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  testTimeout: 10000,
  silent: true,
  verbose: false,
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.ts'],
};

export default config;
