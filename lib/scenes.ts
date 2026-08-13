import AsyncStorage from "@react-native-async-storage/async-storage";

import * as Linking from "expo-linking";

import {
  classifyAnalyticsFailure,
  recordAnalyticsEvent,
  recordAnalyticsFailure,
} from "./analytics";

import {
  normalizeSpotifyTrackLinks,
} from "./spotify-track-links";

import {
  sameSceneStudioScope,
} from "./scene-studio-scope";
import type {
  SceneStudioScope,
} from "./scene-studio-scope";

import {
  saveSceneToCloudForScope,
} from "./scene-cloud";

import {
  deleteSceneForCurrentOwner,
} from "./scene-sync";
import type { MusicProviderGenreEvidence } from "./music-provider-model";
import { canonicalMusicProviderUrl } from "./music-provider-links";

export type SceneVisibility =
  | "private"
  | "public";

export type SceneLibraryType =
  | "created"
  | "saved"
  | "collaborative";

export type SceneTrack = {
  id: string;
  title: string;
  artist: string;
  source?: string;
  spotifyUri?: string;
  spotifyUrl?: string;
  durationMs?: number;
  imageUrl?: string;
  intensity?: number;
  providerId?: "spotify" | "apple-music";
  providerTrackId?: string;
  providerUrl?: string;
  genreEvidence?: readonly MusicProviderGenreEvidence[];
};

export type SceneFeedbackSummary = {
  latestRating?: string;
  note?: string;
  updatedAt?: string;
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
  artistSelections?: string;
  songRequest: string;
  avoid: string;
  collaborators: string[];
  tracks: SceneTrack[];
  visibility: SceneVisibility;
  createdAt: string;
  updatedAt: string;
  libraryType: SceneLibraryType;
  favorite?: boolean;
  playCount?: number;
  lastPlayedAt?: string;
  feedback?: SceneFeedbackSummary;

  [key: string]: unknown;
};

export type SceneInput =
  Partial<StoredScene> & {
    name?: string;
  };

export type LiveStage = {
  id: string;
  name: string;
  createdAt: string;
  scene: StoredScene;
};

const SCENES_STORAGE_KEY =
  "@canal/scenes-v2";

const LEGACY_STORAGE_KEYS = [
  "@canal/scenes",
  "@canal/stored-scenes",
  "@canal/scene-library",
];

function createId(
  prefix = "scene",
): string {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

function readString(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function readOptionalString(
  value: unknown,
): string | undefined {
  return typeof value === "string"
    ? value
    : undefined;
}

function readNumber(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

const SCENE_TRACK_GENRE_PROVIDERS = ["apple-music", "spotify"] as const;

export function normalizeSceneTrackGenreEvidence(
  value: unknown,
): MusicProviderGenreEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const byProvider = new Map<"apple-music" | "spotify", Map<string, string>>();
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const provider = record.provider;
    if (provider !== "apple-music" && provider !== "spotify") continue;
    const genres = Array.isArray(record.genres) ? record.genres : [];
    const normalized = byProvider.get(provider) ?? new Map<string, string>();
    for (const candidate of genres) {
      if (typeof candidate !== "string") continue;
      const genre = candidate.replace(/\s+/gu, " ").trim();
      if (!genre || genre.length > 80 || /[\u0000-\u001F\u007F]/u.test(genre)) continue;
      const key = genre.normalize("NFKC").toLocaleLowerCase("en-US");
      if (!normalized.has(key) && normalized.size < 12) normalized.set(key, genre);
    }
    if (normalized.size > 0) byProvider.set(provider, normalized);
  }

  const result = SCENE_TRACK_GENRE_PROVIDERS.flatMap((provider) => {
    const genres = byProvider.get(provider);
    return genres?.size ? [{ provider, genres: [...genres.values()] }] : [];
  });
  return result.length ? result : undefined;
}

function normalizeVisibility(
  value: unknown,
): SceneVisibility {
  return value === "public"
    ? "public"
    : "private";
}

function normalizeLibraryType(
  value: unknown,
): SceneLibraryType {
  if (value === "saved") {
    return "saved";
  }

  if (value === "collaborative") {
    return "collaborative";
  }

  /*
   * Older versions temporarily used "recent"
   * as a library type.
   *
   * Recent status is now determined from
   * lastPlayedAt, so legacy "recent" Scenes
   * safely become created Scenes.
   */
  return "created";
}

function normalizeTrack(
  value: unknown,
  index: number,
): SceneTrack {
  const track =
    value &&
    typeof value === "object"
      ? (value as Record<
          string,
          unknown
        >)
      : {};

  const id =
    readString(
      track.id,
      `track-${index}`,
    );

  const title =
    readString(
      track.title,
      readString(
        track.name,
        "Unknown track",
      ),
    );

  const artist =
    readString(
      track.artist,
      "Unknown artist",
    );

  const spotifyLinks =
    normalizeSpotifyTrackLinks(
      readOptionalString(
        track.spotifyUri,
      ) ??
        readOptionalString(
          track.uri,
        ),
      readOptionalString(
        track.spotifyUrl,
      ) ??
        readOptionalString(
          track.spotify_url,
        ),
    );

  const durationMs =
    typeof track.durationMs ===
    "number"
      ? track.durationMs
      : typeof track.duration_ms ===
          "number"
        ? track.duration_ms
        : undefined;

  const imageUrl =
    readOptionalString(
      track.imageUrl,
    ) ??
    readOptionalString(
      track.image_url,
    );

  const intensity =
    typeof track.intensity ===
    "number"
      ? track.intensity
      : undefined;

  const providerId =
    track.providerId === "apple-music"
      ? "apple-music" as const
      : track.providerId === "spotify"
        ? "spotify" as const
        : undefined;

  const providerTrackId = readOptionalString(track.providerTrackId);
  const providerUrl = canonicalMusicProviderUrl(
    providerId,
    track.providerUrl,
    spotifyLinks.spotifyUri,
  ) ?? undefined;
  const genreEvidence = normalizeSceneTrackGenreEvidence(
    track.genreEvidence ?? track.genre_evidence,
  );

  return {
    id,
    title,
    artist,

    source:
      readOptionalString(
        track.source,
      ),

    ...spotifyLinks,
    durationMs,
    imageUrl,
    intensity,
    providerId,
    providerTrackId,
    providerUrl,
    genreEvidence,
  };
}

function normalizeFeedback(
  value: unknown,
): SceneFeedbackSummary | undefined {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return undefined;
  }

  const feedback =
    value as Record<
      string,
      unknown
    >;

  return {
    latestRating:
      readOptionalString(
        feedback.latestRating,
      ),

    note:
      readOptionalString(
        feedback.note,
      ),

    updatedAt:
      readOptionalString(
        feedback.updatedAt,
      ),
  };
}

function normalizeScene(
  value: unknown,
): StoredScene | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const scene =
    value as Record<
      string,
      unknown
    >;

  const now =
    new Date().toISOString();

  const rawTracks =
    Array.isArray(scene.tracks)
      ? scene.tracks
      : [];

  const rawCollaborators =
    Array.isArray(
      scene.collaborators,
    )
      ? scene.collaborators
      : [];

  const id =
    readString(
      scene.id,
    ).trim() ||
    createId();

  const name =
    readString(
      scene.name,
      "Untitled Scene",
    ).trim() ||
    "Untitled Scene";

  const createdAt =
    readString(
      scene.createdAt,
      now,
    );

  const updatedAt =
    readString(
      scene.updatedAt,
      createdAt,
    );

  return {
    ...scene,

    id,
    name,

    activity:
      readString(
        scene.activity,
        "Personal",
      ),

    duration:
      readString(
        scene.duration,
        "30 minutes",
      ),

    emotions:
      readString(
        scene.emotions,
      ),

    genres:
      readString(
        scene.genres,
      ),

    energy:
      readString(
        scene.energy,
        "medium",
      ),

    familiarity:
      readString(
        scene.familiarity,
        "balanced",
      ),

    artists:
      readString(
        scene.artists,
      ),

    artistSelections:
      readString(
        scene.artistSelections,
        readString(
          scene.artists,
        ),
      ),

    songRequest:
      readString(
        scene.songRequest,
      ),

    avoid:
      readString(
        scene.avoid,
      ),

    collaborators:
      rawCollaborators.filter(
        (
          collaborator,
        ): collaborator is string =>
          typeof collaborator ===
          "string",
      ),

    tracks:
      rawTracks.map(
        normalizeTrack,
      ),

    visibility:
      normalizeVisibility(
        scene.visibility,
      ),

    createdAt,
    updatedAt,

    libraryType:
      normalizeLibraryType(
        scene.libraryType,
      ),

    favorite:
      Boolean(
        scene.favorite,
      ),

    playCount:
      readNumber(
        scene.playCount,
        0,
      ),

    lastPlayedAt:
      readOptionalString(
        scene.lastPlayedAt,
      ),

    feedback:
      normalizeFeedback(
        scene.feedback,
      ),
  };
}

export function normalizeStoredScene(
  value: unknown,
): StoredScene | null {
  return normalizeScene(
    value,
  );
}

async function readArrayFromKey(
  key: string,
): Promise<StoredScene[]> {
  const serialized =
    await AsyncStorage.getItem(
      key,
    );

  if (!serialized) {
    return [];
  }

  try {
    const parsed: unknown =
      JSON.parse(serialized);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeScene)
      .filter(
        (
          scene,
        ): scene is StoredScene =>
          scene !== null,
      );
  } catch {
    return [];
  }
}

function sortScenes(
  scenes: StoredScene[],
): StoredScene[] {
  return [...scenes].sort(
    (first, second) =>
      new Date(
        second.updatedAt,
      ).getTime() -
      new Date(
        first.updatedAt,
      ).getTime(),
  );
}

export async function writeScenes(
  scenes: StoredScene[],
): Promise<void> {
  const normalized =
    scenes
      .map(normalizeScene)
      .filter(
        (
          scene,
        ): scene is StoredScene =>
          scene !== null,
      );

  await AsyncStorage.setItem(
    SCENES_STORAGE_KEY,
    JSON.stringify(
      normalized,
    ),
  );
}

export const saveScenes =
  writeScenes;

export async function readScenes(): Promise<
  StoredScene[]
> {
  const currentScenes =
    await readArrayFromKey(
      SCENES_STORAGE_KEY,
    );

  if (
    currentScenes.length > 0
  ) {
    return sortScenes(
      currentScenes,
    );
  }

  for (
    const key of
      LEGACY_STORAGE_KEYS
  ) {
    const legacyScenes =
      await readArrayFromKey(
        key,
      );

    if (
      legacyScenes.length > 0
    ) {
      await writeScenes(
        legacyScenes,
      );

      return sortScenes(
        legacyScenes,
      );
    }
  }

  return [];
}

export const getAllScenes =
  readScenes;

export const loadScenes =
  readScenes;

export async function getSceneById(
  sceneId: string,
): Promise<StoredScene | null> {
  const scenes =
    await readScenes();

  return (
    scenes.find(
      (scene) =>
        scene.id === sceneId,
    ) ?? null
  );
}

export const readScene =
  getSceneById;

export async function upsertScene(
  input: StoredScene,
): Promise<StoredScene> {
  const normalized =
    normalizeScene(input);

  if (!normalized) {
    throw new Error(
      "Canal could not save an invalid Scene.",
    );
  }

  const scenes =
    await readScenes();

  const nextScene: StoredScene = {
    ...normalized,

    updatedAt:
      new Date().toISOString(),
  };

  const existingIndex =
    scenes.findIndex(
      (scene) =>
        scene.id ===
        nextScene.id,
    );

  if (existingIndex >= 0) {
    scenes[existingIndex] =
      nextScene;
  } else {
    scenes.unshift(
      nextScene,
    );
  }

  await writeScenes(
    scenes,
  );

  const {
    saveSceneToCloud,
  } = await import(
    "./scene-cloud"
  );

  await saveSceneToCloud(
    nextScene,
  );

  return nextScene;
}

function sameSceneVersion(
  left: StoredScene,
  right: StoredScene,
): boolean {
  return left.id === right.id && left.updatedAt === right.updatedAt;
}

async function rollbackScopedLocalScene(
  committedScene: StoredScene,
  previousScene: StoredScene | null,
): Promise<void> {
  const currentScenes = await readScenes();
  const currentIndex = currentScenes.findIndex(
    (scene) => sameSceneVersion(scene, committedScene),
  );
  if (currentIndex < 0) return;

  const repairedScenes = [...currentScenes];
  if (previousScene) repairedScenes[currentIndex] = previousScene;
  else repairedScenes.splice(currentIndex, 1);
  await writeScenes(repairedScenes);
}

export async function upsertSceneForScope(
  input: StoredScene,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<StoredScene> {
  const canCommit = (): boolean =>
    sameSceneStudioScope(scope, currentScope());

  if (!canCommit()) {
    throw new Error("Canal stopped the Scene save because the active account changed.");
  }

  const normalized = normalizeScene(input);
  if (!normalized) {
    throw new Error("Canal could not save an invalid Scene.");
  }

  const nextScene: StoredScene = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  if (!canCommit()) {
    throw new Error("Canal stopped the Scene save because the active account changed.");
  }
  const cloudScene =
    await saveSceneToCloudForScope(nextScene, scope, currentScope) ?? nextScene;

  // Cloud success belongs permanently to the captured owner. If the account
  // changed while the request was in flight, leave the shared device cache
  // untouched; that owner's next sync will hydrate the committed Scene.
  if (!canCommit()) return cloudScene;

  const previousScenes = await readScenes();
  if (!canCommit()) return cloudScene;
  const previousScene = previousScenes.find(
    (scene) => scene.id === cloudScene.id,
  ) ?? null;
  const nextScenes = previousScenes.filter(
    (scene) => scene.id !== cloudScene.id,
  );
  nextScenes.unshift(cloudScene);

  if (!canCommit()) return cloudScene;
  await writeScenes(nextScenes);
  if (!canCommit()) {
    await rollbackScopedLocalScene(cloudScene, previousScene);
  }

  return cloudScene;
}

export const updateScene =
  upsertScene;

export const saveScene =
  upsertScene;

export async function createScene(
  input: SceneInput = {},
): Promise<StoredScene> {
  const now =
    new Date().toISOString();

  const scene: StoredScene = {
    id:
      readString(
        input.id,
      ) ||
      createId(),

    name:
      readString(
        input.name,
        "Untitled Scene",
      ).trim() ||
      "Untitled Scene",

    activity:
      readString(
        input.activity,
        "Personal",
      ),

    duration:
      readString(
        input.duration,
        "30 minutes",
      ),

    emotions:
      readString(
        input.emotions,
      ),

    genres:
      readString(
        input.genres,
      ),

    energy:
      readString(
        input.energy,
        "medium",
      ),

    familiarity:
      readString(
        input.familiarity,
        "balanced",
      ),

    artists:
      readString(
        input.artists,
      ),

    artistSelections:
      readString(
        input.artistSelections,
        readString(
          input.artists,
        ),
      ),

    songRequest:
      readString(
        input.songRequest,
      ),

    avoid:
      readString(
        input.avoid,
      ),

    collaborators:
      Array.isArray(
        input.collaborators,
      )
        ? input.collaborators.filter(
            (
              collaborator,
            ): collaborator is string =>
              typeof collaborator ===
              "string",
          )
        : [],

    tracks:
      Array.isArray(
        input.tracks,
      )
        ? input.tracks.map(
            normalizeTrack,
          )
        : [],

    visibility:
      normalizeVisibility(
        input.visibility,
      ),

    createdAt:
      readString(
        input.createdAt,
        now,
      ),

    updatedAt: now,

    libraryType:
      normalizeLibraryType(
        input.libraryType,
      ),

    favorite:
      Boolean(
        input.favorite,
      ),

    playCount:
      readNumber(
        input.playCount,
        0,
      ),

    lastPlayedAt:
      readOptionalString(
        input.lastPlayedAt,
      ),

    feedback:
      normalizeFeedback(
        input.feedback,
      ),
  };

  try {
    const createdScene =
      await upsertScene(
        scene,
      );

    void recordAnalyticsEvent({
      name:
        "first_scene_created",
    });

    return createdScene;
  } catch (error) {
    void recordAnalyticsFailure(
      "scene_create",
      classifyAnalyticsFailure(
        error,
      ),
    );

    throw error;
  }
}

export async function deleteScene(
  sceneId: string,
): Promise<void> {
  await deleteSceneForCurrentOwner(
    sceneId,
  );
}

/*
 * Compatibility exports for older Canal
 * routes that use different function names.
 */
export const deleteSceneById =
  deleteScene;

export const removeScene =
  deleteScene;

export async function updateSceneVisibility(
  sceneId: string,
  visibility: SceneVisibility,
): Promise<StoredScene> {
  const scene =
    await getSceneById(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      "Scene not found.",
    );
  }

  return upsertScene({
    ...scene,

    visibility:
      normalizeVisibility(
        visibility,
      ),
  });
}

export async function toggleSceneFavorite(
  sceneId: string,
): Promise<StoredScene> {
  const scene =
    await getSceneById(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      "Scene not found.",
    );
  }

  return upsertScene({
    ...scene,

    favorite:
      !scene.favorite,
  });
}

export async function duplicateScene(
  sceneId: string,
): Promise<StoredScene> {
  const scene =
    await getSceneById(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      "Scene not found.",
    );
  }

  const now =
    new Date().toISOString();

  return upsertScene({
    ...scene,

    id:
      createId(),

    name:
      `${scene.name} Copy`,

    createdAt: now,
    updatedAt: now,

    playCount: 0,

    lastPlayedAt:
      undefined,

    favorite:
      false,
  });
}

export async function recordScenePlay(
  sceneId: string,
): Promise<StoredScene> {
  const scene =
    await getSceneById(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      "Scene not found.",
    );
  }

  return upsertScene({
    ...scene,

    playCount:
      (scene.playCount ?? 0) +
      1,

    lastPlayedAt:
      new Date().toISOString(),

    /*
     * Do not change libraryType to "recent".
     * Recent status is determined using
     * lastPlayedAt.
     */
    libraryType:
      scene.libraryType,
  });
}

export async function saveSceneFeedback(
  sceneId: string,
  latestRating: string,
  note = "",
): Promise<StoredScene> {
  const scene =
    await getSceneById(
      sceneId,
    );

  if (!scene) {
    throw new Error(
      "Scene not found.",
    );
  }

  return upsertScene({
    ...scene,

    feedback: {
      latestRating,
      note,

      updatedAt:
        new Date().toISOString(),
    },
  });
}

export async function getRecentScenes(
  limit = 10,
): Promise<StoredScene[]> {
  const scenes =
    await readScenes();

  return scenes
    .filter(
      (scene) =>
        Boolean(
          scene.lastPlayedAt,
        ),
    )
    .sort(
      (first, second) =>
        new Date(
          second.lastPlayedAt ??
            second.updatedAt,
        ).getTime() -
        new Date(
          first.lastPlayedAt ??
            first.updatedAt,
        ).getTime(),
    )
    .slice(
      0,
      Math.max(
        0,
        limit,
      ),
    );
}

export async function getFavoriteScenes(): Promise<
  StoredScene[]
> {
  const scenes =
    await readScenes();

  return scenes.filter(
    (scene) =>
      Boolean(
        scene.favorite,
      ),
  );
}

export async function getCollaborativeScenes(): Promise<
  StoredScene[]
> {
  const scenes =
    await readScenes();

  return scenes.filter(
    (scene) =>
      scene.libraryType ===
      "collaborative",
  );
}

export async function clearScenes(): Promise<void> {
  await AsyncStorage.removeItem(
    SCENES_STORAGE_KEY,
  );
}

export async function createLiveStage(
  input: SceneInput = {},
): Promise<LiveStage> {
  const scene =
    await createScene(input);

  return {
    id:
      createId(
        "stage",
      ),

    name:
      `${scene.name} Live Stage`,

    createdAt:
      new Date().toISOString(),

    scene,
  };
}

export function sceneDurationMinutes(
  scene: StoredScene,
): number {
  const durationMatch =
    scene.duration.match(
      /(\d+)/,
    );

  if (durationMatch) {
    const parsed =
      Number(
        durationMatch[1],
      );

    if (
      Number.isFinite(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  const trackDurationMs =
    scene.tracks.reduce(
      (total, track) =>
        total +
        (track.durationMs ??
          210_000),
      0,
    );

  return Math.max(
    1,
    Math.round(
      trackDurationMs /
        60_000,
    ),
  );
}

export function sceneShareText(
  scene: StoredScene,
  returnUrl = "",
): string {
  const artists =
    scene.artists ||
    scene.tracks
      .slice(0, 4)
      .map(
        (track) =>
          track.artist,
      )
      .filter(Boolean)
      .join(", ");

  return [
    `Canal Scene: ${scene.name}`,

    `${scene.activity} • ${
      scene.emotions ||
      scene.energy
    }`,

    `${scene.tracks.length} tracks • ${scene.duration}`,

    artists
      ? `Artists: ${artists}`
      : "",

    returnUrl.trim(),

    "Created with Canal.",
  ]
    .filter(Boolean)
    .join("\n");
}

function publicSceneShareIdentifier(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > 200 ||
    /[\u0000-\u001F\u007F]/u.test(
      normalized,
    )
  ) {
    throw new Error(
      `This public Scene's ${label} is unavailable.`,
    );
  }

  return normalized;
}

function configuredCanalShareBaseUrl():
  | URL
  | null {
  const shareBaseUrl =
    process.env
      .EXPO_PUBLIC_CANAL_SHARE_BASE_URL
      ?.trim();
  const legacyWebUrl =
    process.env
      .EXPO_PUBLIC_CANAL_WEB_URL
      ?.trim();
  const configuredUrl =
    shareBaseUrl ||
    legacyWebUrl ||
    "";

  if (!configuredUrl) {
    return null;
  }

  try {
    const parsedUrl =
      new URL(
        configuredUrl,
      );

    if (
      parsedUrl.protocol !==
        "https:" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
}

export function publicSceneShareUrl(
  ownerId: string,
  sceneId: string,
): string {
  const queryParams = {
    ownerId:
      publicSceneShareIdentifier(
        ownerId,
        "creator address",
      ),

    sceneId:
      publicSceneShareIdentifier(
        sceneId,
        "address",
      ),
  };

  const webBaseUrl =
    configuredCanalShareBaseUrl();

  if (webBaseUrl) {
    const webUrl =
      new URL(
        webBaseUrl.toString(),
      );
    const basePath =
      webUrl.pathname.replace(
        /\/+$/,
        "",
      );

    webUrl.pathname =
      `${basePath}/public-scene`;

    webUrl.searchParams.set(
      "ownerId",
      queryParams.ownerId,
    );
    webUrl.searchParams.set(
      "sceneId",
      queryParams.sceneId,
    );

    return webUrl.toString();
  }

  return Linking.createURL(
    "public-scene",
    {
      queryParams,
    },
  );
}
