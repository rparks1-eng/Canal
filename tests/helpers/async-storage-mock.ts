import {
  jest,
} from "@jest/globals";

export const mockStorage =
  new Map<string, string>();

export const mockAsyncStorage = {
  getItem: jest.fn(
    async (key: string) =>
      mockStorage.get(key) ??
      null,
  ),

  setItem: jest.fn(
    async (
      key: string,
      value: string,
    ) => {
      mockStorage.set(
        key,
        value,
      );
    },
  ),

  removeItem: jest.fn(
    async (key: string) => {
      mockStorage.delete(
        key,
      );
    },
  ),

  multiSet: jest.fn(
    async (
      entries:
        [string, string][],
    ) => {
      for (
        const [
          key,
          value,
        ] of entries
      ) {
        mockStorage.set(
          key,
          value,
        );
      }
    },
  ),

  getAllKeys: jest.fn(
    async () =>
      Array.from(
        mockStorage.keys(),
      ),
  ),

  multiGet: jest.fn(
    async (
      keys: string[],
    ) =>
      keys.map(
        (key) =>
          [
            key,
            mockStorage.get(
              key,
            ) ??
              null,
          ] as [
            string,
            string | null,
          ],
      ),
  ),

  multiRemove: jest.fn(
    async (
      keys: string[],
    ) => {
      for (const key of keys) {
        mockStorage.delete(
          key,
        );
      }
    },
  ),
};

export default
  mockAsyncStorage;
