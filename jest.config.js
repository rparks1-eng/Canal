module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
    "<rootDir>/tests/living-cover.test.tsx",
  ],
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$":
      "<rootDir>/tests/helpers/async-storage-mock.ts",
    "^expo-secure-store$":
      "<rootDir>/tests/helpers/secure-store-mock.ts",
    "^expo-video$":
      "<rootDir>/tests/helpers/expo-video-mock.ts",
  },
  clearMocks: true,
  restoreMocks: true,
};
