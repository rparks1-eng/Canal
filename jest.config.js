module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
  ],
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$":
      "<rootDir>/tests/helpers/async-storage-mock.ts",
    "^expo-secure-store$":
      "<rootDir>/tests/helpers/secure-store-mock.ts",
  },
  clearMocks: true,
  restoreMocks: true,
};
