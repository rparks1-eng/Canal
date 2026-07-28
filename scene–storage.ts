import AsyncStorage from "@react-native-async-storage/async-storage";

const SCENE_STORAGE_KEY = "@canal/scenes";

export type StoredTrack = {
  id: string;
  title: string;
  artist: string;
  source: string;
};

export type StoredScene = {
  id: string;
  name: string;
  activity: string;
  duration: string;
  emotions: string;
  genres: string;
  energy: string;
  familiarity: string;
  artists: string;
  songRequest: string;
  avoid: string;
  tracks: StoredTrack[];
  createdAt: string;
  updatedAt: string;
  libraryType: "created" | "saved" | "collaborative";
};

export async function getStoredScenes(): Promise<
  StoredScene[]
> {
  try {
    const storedValue = await AsyncStorage.getItem(
      SCENE_STORAGE_KEY,
    );

    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue as StoredScene[];
  } catch (error) {
    console.error(
      "Unable to load stored Scenes:",
      error,
    );

    return [];
  }
}

export async function saveStoredScene(
  scene: StoredScene,
): Promise<void> {
  const currentScenes =
    await getStoredScenes();

  const scenesWithoutDuplicate =
    currentScenes.filter(
      (currentScene) =>
        currentScene.id !== scene.id,
    );

  const updatedScenes = [
    scene,
    ...scenesWithoutDuplicate,
  ];

  await AsyncStorage.setItem(
    SCENE_STORAGE_KEY,
    JSON.stringify(updatedScenes),
  );
}

export async function deleteStoredScene(
  sceneId: string,
): Promise<void> {
  const currentScenes =
    await getStoredScenes();

  const updatedScenes =
    currentScenes.filter(
      (scene) => scene.id !== sceneId,
    );

  await AsyncStorage.setItem(
    SCENE_STORAGE_KEY,
    JSON.stringify(updatedScenes),
  );
}

export async function clearStoredScenes(): Promise<void> {
  await AsyncStorage.removeItem(
    SCENE_STORAGE_KEY,
  );
}