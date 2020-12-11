module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  roots: ['<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/testing/setup.ts'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.ts?$',
  testTimeout: 30000,
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  testEnvironment: 'node'
};