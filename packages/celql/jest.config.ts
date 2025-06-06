/* eslint-disable */
import { readFileSync } from 'fs';

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'));

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@protoutil/celql',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  transformIgnorePatterns: ['node_modules/(?!@bearclaw|@buf|@bufbuild)'],
  // Enable worker threads for assertion failures involving BigInt
  // See https://github.com/jestjs/jest/issues/11617#issuecomment-1458155552
  workerThreads: true,
  maxWorkers: 1,
};
