/** @type {import('jest').Config} */
const base = require('./jest.config.js');

module.exports = {
  ...base,
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.integration.test.ts', '**/*.api.test.ts', '**/*.security.test.ts'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
  setupFilesAfterFramework: ['<rootDir>/tests/setup/jest.setup.ts'],
  testTimeout: 30000,
};
