import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    clearSpotifyApiCache,
} from "./spotify-cache";
import {
    clearSpotifySession,
    SPOTIFY_ASYNC_STORAGE_KEY,
} from "./spotify-auth";
import {
    CANAL_STORAGE_PREFIX,
} from "./storage-keys";

export type CanalDataExport = {
  exportedAt: string;
  formatVersion: number;
  platform: "canal-prototype";
  values: Record<
    string,
    unknown
  >;
};

export async function exportCanalData(): Promise<string> {
  const allKeys =
    await AsyncStorage.getAllKeys();

  const canalKeys =
    allKeys.filter((key) =>
      key.startsWith(
        CANAL_STORAGE_PREFIX,
      ) &&
      key !==
        SPOTIFY_ASYNC_STORAGE_KEY,
    );

  const storedEntries =
    await AsyncStorage.multiGet(
      canalKeys,
    );

  const values: Record<
    string,
    unknown
  > = {};

  for (const [
    key,
    storedValue,
  ] of storedEntries) {
    if (storedValue === null) {
      continue;
    }

    try {
      values[key] =
        JSON.parse(storedValue);
    } catch {
      values[key] =
        storedValue;
    }
  }

  const exportValue:
    CanalDataExport = {
      exportedAt:
        new Date().toISOString(),

      formatVersion: 1,

      platform:
        "canal-prototype",

      values,
    };

  return JSON.stringify(
    exportValue,
    null,
    2,
  );
}

export async function getCanalStorageSummary(): Promise<{
  keyCount: number;
  estimatedCharacters: number;
}> {
  const allKeys =
    await AsyncStorage.getAllKeys();

  const canalKeys =
    allKeys.filter((key) =>
      key.startsWith(
        CANAL_STORAGE_PREFIX,
      ) &&
      key !==
        SPOTIFY_ASYNC_STORAGE_KEY,
    );

  const storedEntries =
    await AsyncStorage.multiGet(
      canalKeys,
    );

  const estimatedCharacters =
    storedEntries.reduce(
      (
        total,
        [, value],
      ) =>
        total +
        (value?.length ?? 0),
      0,
    );

  return {
    keyCount:
      canalKeys.length,

    estimatedCharacters,
  };
}

export async function clearAllCanalData(): Promise<void> {
  const allKeys =
    await AsyncStorage.getAllKeys();

  const canalKeys =
    allKeys.filter((key) =>
      key.startsWith(
        CANAL_STORAGE_PREFIX,
      ),
    );

  if (canalKeys.length > 0) {
    await AsyncStorage.multiRemove(
      canalKeys,
    );
  }

  await Promise.allSettled([
    clearSpotifySession(),
    clearSpotifyApiCache(),
  ]);
}
