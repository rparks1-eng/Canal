import {
  jest,
} from "@jest/globals";

export const mockSecureValues =
  new Map<string, string>();

export const mockSecureStore = {
  getItemAsync: jest.fn(
    async (key: string) =>
      mockSecureValues.get(
        key,
      ) ??
      null,
  ),

  setItemAsync: jest.fn(
    async (
      key: string,
      value: string,
    ) => {
      mockSecureValues.set(
        key,
        value,
      );
    },
  ),

  deleteItemAsync: jest.fn(
    async (key: string) => {
      mockSecureValues.delete(
        key,
      );
    },
  ),
};

export const getItemAsync =
  mockSecureStore.getItemAsync;

export const setItemAsync =
  mockSecureStore.setItemAsync;

export const deleteItemAsync =
  mockSecureStore.deleteItemAsync;

export default
  mockSecureStore;
