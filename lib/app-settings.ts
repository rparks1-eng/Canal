import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    STORAGE_KEYS,
} from "./storage-keys";

export type SceneVisibility =
  | "public"
  | "private";

export type CanalSettings = {
  defaultSceneVisibility:
    SceneVisibility;

  showListeningActivity:
    boolean;

  collaborationInvites:
    boolean;

  activityNotifications:
    boolean;

  autoplayPreviews:
    boolean;

  personalizedDiscover:
    boolean;
};

export const DEFAULT_CANAL_SETTINGS:
  CanalSettings = {
    defaultSceneVisibility:
      "private",

    showListeningActivity:
      true,

    collaborationInvites:
      true,

    activityNotifications:
      true,

    autoplayPreviews:
      false,

    personalizedDiscover:
      true,
  };

export async function readCanalSettings(): Promise<CanalSettings> {
  const storedValue =
    await AsyncStorage.getItem(
      STORAGE_KEYS.settings,
    );

  if (!storedValue) {
    return DEFAULT_CANAL_SETTINGS;
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    return normalizeCanalSettings(
      parsedValue,
    );
  } catch {
    return DEFAULT_CANAL_SETTINGS;
  }
}

export async function saveCanalSettings(
  settings: CanalSettings,
): Promise<CanalSettings> {
  const normalizedSettings =
    normalizeCanalSettings(
      settings,
    );

  await AsyncStorage.setItem(
    STORAGE_KEYS.settings,
    JSON.stringify(
      normalizedSettings,
    ),
  );

  return normalizedSettings;
}

export async function resetCanalSettings(): Promise<void> {
  await AsyncStorage.removeItem(
    STORAGE_KEYS.settings,
  );
}

export function normalizeCanalSettings(
  value: unknown,
): CanalSettings {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return DEFAULT_CANAL_SETTINGS;
  }

  const record =
    value as Partial<CanalSettings>;

  return {
    defaultSceneVisibility:
      record.defaultSceneVisibility ===
      "public"
        ? "public"
        : "private",

    showListeningActivity:
      typeof record.showListeningActivity ===
      "boolean"
        ? record.showListeningActivity
        : DEFAULT_CANAL_SETTINGS.showListeningActivity,

    collaborationInvites:
      typeof record.collaborationInvites ===
      "boolean"
        ? record.collaborationInvites
        : DEFAULT_CANAL_SETTINGS.collaborationInvites,

    activityNotifications:
      typeof record.activityNotifications ===
      "boolean"
        ? record.activityNotifications
        : DEFAULT_CANAL_SETTINGS.activityNotifications,

    autoplayPreviews:
      typeof record.autoplayPreviews ===
      "boolean"
        ? record.autoplayPreviews
        : DEFAULT_CANAL_SETTINGS.autoplayPreviews,

    personalizedDiscover:
      typeof record.personalizedDiscover ===
      "boolean"
        ? record.personalizedDiscover
        : DEFAULT_CANAL_SETTINGS.personalizedDiscover,
  };
}