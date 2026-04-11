/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@comvestec/contracts$": "<rootDir>/packages/contracts/src/index.ts",
    "^@comvestec/config$": "<rootDir>/packages/config/src/index.ts",
    "^@comvestec/platform$": "<rootDir>/packages/platform/src/index.ts",
    "^@comvestec/modules$": "<rootDir>/packages/modules/src/index.ts",
  },
};
