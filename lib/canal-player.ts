import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  StoredScene,
} from "./scenes";

export type CanalPlayerSession = {
  id: string;
  sceneId: string;
  sceneName: string;
  currentIndex: number;
  isPlaying: boolean;
  elapsedSeconds: number;
  startedAt: string;
  updatedAt: string;
};

const PLAYER_KEY =
  "@canal/player-session";

function createId(): string {
  return (
    "player-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

export async function createPlayerSession(
  scene: StoredScene,
): Promise<CanalPlayerSession> {
  const now =
    new Date().toISOString();

  const session: CanalPlayerSession = {
    id:
      createId(),

    sceneId:
      scene.id,

    sceneName:
      scene.name,

    currentIndex: 0,

    isPlaying: false,

    elapsedSeconds: 0,

    startedAt: now,

    updatedAt: now,
  };

  await writePlayerSession(
    session,
  );

  return session;
}

export async function readPlayerSession(): Promise<
  CanalPlayerSession | null
> {
  const serialized =
    await AsyncStorage.getItem(
      PLAYER_KEY,
    );

  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(
      serialized,
    ) as CanalPlayerSession;
  } catch {
    return null;
  }
}

export async function writePlayerSession(
  session: CanalPlayerSession,
): Promise<void> {
  await AsyncStorage.setItem(
    PLAYER_KEY,
    JSON.stringify({
      ...session,

      updatedAt:
        new Date().toISOString(),
    }),
  );
}

export async function clearPlayerSession(): Promise<void> {
  await AsyncStorage.removeItem(
    PLAYER_KEY,
  );
}
