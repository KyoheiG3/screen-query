const esmPackages = ['@tanstack/react-query']

module.exports = {
  testEnvironment: 'jsdom',
  clearMocks: true,
  collectCoverage: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        verbatimModuleSyntax: false,
        jsx: 'react-jsx',
      },
      isolatedModules: false,
    }],
  },
  transformIgnorePatterns: [
    `node_modules/(?!(.pnpm/)?(${esmPackages.join('|')}))`,
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/index.ts',
    '!src/test-utils/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
}
