import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  consumeDeferredDestination,
  readDeferredDestination,
} from "./deferred-destination";

import type {
  PublicDestination,
} from "./public-linking";

export type PublicSceneReturnRoute = {
  pathname: "/public-scene";
  params: {
    ownerId: string;
    sceneId: string;
  };
};

const PUBLIC_SCENE_RETURN_KEY =
  "@canal/auth-return/public-scene";

function safeLookupKey(
  value: string,
): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(
      value,
    )
  );
}

export async function rememberPublicSceneReturn(
  ownerId: string,
  sceneId: string,
): Promise<void> {
  if (
    !safeLookupKey(ownerId) ||
    !safeLookupKey(sceneId)
  ) {
    await AsyncStorage.removeItem(
      PUBLIC_SCENE_RETURN_KEY,
    );

    return;
  }

  await AsyncStorage.setItem(
    PUBLIC_SCENE_RETURN_KEY,
    JSON.stringify({
      ownerId,
      sceneId,
    }),
  );
}

export async function consumePublicSceneReturn(): Promise<
  | PublicSceneReturnRoute
  | PublicDestination
  | null
> {
  const deferredDestination =
    await consumeDeferredDestination();

  if (deferredDestination) {
    return deferredDestination;
  }

  const stored =
    await AsyncStorage.getItem(
      PUBLIC_SCENE_RETURN_KEY,
    );

  await AsyncStorage.removeItem(
    PUBLIC_SCENE_RETURN_KEY,
  );

  if (!stored) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        stored,
      ) as {
        ownerId?: unknown;
        sceneId?: unknown;
      };

    if (
      typeof parsed.ownerId !==
        "string" ||
      typeof parsed.sceneId !==
        "string" ||
      !safeLookupKey(
        parsed.ownerId,
      ) ||
      !safeLookupKey(
        parsed.sceneId,
      )
    ) {
      return null;
    }

    return {
      pathname:
        "/public-scene",
      params: {
        ownerId:
          parsed.ownerId,
        sceneId:
          parsed.sceneId,
      },
    };
  } catch {
    return null;
  }
}

export async function readPublicSceneReturn(): Promise<
  | PublicSceneReturnRoute
  | PublicDestination
  | null
> {
  const deferredDestination = await readDeferredDestination();
  if (deferredDestination) return deferredDestination;

  const stored = await AsyncStorage.getItem(PUBLIC_SCENE_RETURN_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as {
      ownerId?: unknown;
      sceneId?: unknown;
    };
    if (
      typeof parsed.ownerId !== "string" ||
      typeof parsed.sceneId !== "string" ||
      !safeLookupKey(parsed.ownerId) ||
      !safeLookupKey(parsed.sceneId)
    ) return null;

    return {
      pathname: "/public-scene",
      params: { ownerId: parsed.ownerId, sceneId: parsed.sceneId },
    };
  } catch {
    return null;
  }
}
