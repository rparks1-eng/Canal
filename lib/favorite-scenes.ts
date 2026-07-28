import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    STORAGE_KEYS,
} from "./storage-keys";

export async function readFavoriteSceneIds(): Promise<
  string[]
> {
  const storedValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.favoriteScenes,
    );

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return Array.from(
      new Set(
        parsedValue
          .filter(
            (
              item,
            ): item is string =>
              typeof item ===
              "string",
          )
          .map((item) =>
            item.trim(),
          )
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

export async function addFavoriteScene(
  sceneId: string,
): Promise<string[]> {
  const favoriteIds =
    await readFavoriteSceneIds();

  const updatedIds =
    Array.from(
      new Set([
        ...favoriteIds,
        sceneId,
      ]),
    );

  await writeFavoriteSceneIds(
    updatedIds,
  );

  return updatedIds;
}

export async function removeFavoriteScene(
  sceneId: string,
): Promise<string[]> {
  const favoriteIds =
    await readFavoriteSceneIds();

  const updatedIds =
    favoriteIds.filter(
      (id) => id !== sceneId,
    );

  await writeFavoriteSceneIds(
    updatedIds,
  );

  return updatedIds;
}

export async function toggleFavoriteScene(
  sceneId: string,
): Promise<{
  favoriteIds: string[];
  isFavorite: boolean;
}> {
  const favoriteIds =
    await readFavoriteSceneIds();

  const isCurrentlyFavorite =
    favoriteIds.includes(
      sceneId,
    );

  const updatedIds =
    isCurrentlyFavorite
      ? favoriteIds.filter(
          (id) =>
            id !== sceneId,
        )
      : Array.from(
          new Set([
            ...favoriteIds,
            sceneId,
          ]),
        );

  await writeFavoriteSceneIds(
    updatedIds,
  );

  return {
    favoriteIds:
      updatedIds,

    isFavorite:
      !isCurrentlyFavorite,
  };
}

async function writeFavoriteSceneIds(
  sceneIds: string[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.favoriteScenes,
    JSON.stringify(sceneIds),
  );
}