import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    STORAGE_KEYS,
} from "./storage-keys";
import { isSupabaseConfigured, supabase } from "./supabase";

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
  trueBlackPlayback: boolean;
  allowExplicitDefault: boolean;
  smoothTransitionsDefault: boolean;
  avoidRecentDefault: boolean;
  stageInviteNotifications: boolean;
  stageReminderNotifications: boolean;
  socialNotifications: boolean;
  collaborationNotifications: boolean;
  followReduceMotion: boolean;
  enhancedContrast: boolean;
  interfaceHaptics: boolean;
  smartSpotifySync: boolean;
  songLearningEnabled: boolean;
  dislikeWindowDays: 7 | 14 | 30 | 60;
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
    trueBlackPlayback: false,
    allowExplicitDefault: false,
    smoothTransitionsDefault: true,
    avoidRecentDefault: true,
    stageInviteNotifications: true,
    stageReminderNotifications: true,
    socialNotifications: true,
    collaborationNotifications: true,
    followReduceMotion: true,
    enhancedContrast: false,
    interfaceHaptics: true,
    smartSpotifySync: true,
    songLearningEnabled: true,
    dislikeWindowDays: 30,
  };

let runtimeCanalSettings = DEFAULT_CANAL_SETTINGS;

export function getRuntimeCanalSettings(): CanalSettings {
  return runtimeCanalSettings;
}

function accountSettingsKey(userId: string): string {
  return `${STORAGE_KEYS.settings}:v2:${encodeURIComponent(userId)}`;
}

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

export async function readAccountCanalSettings(userId: string): Promise<CanalSettings> {
  const localKey = accountSettingsKey(userId);
  let local = DEFAULT_CANAL_SETTINGS;
  try {
    local = normalizeCanalSettings(JSON.parse((await AsyncStorage.getItem(localKey)) ?? "null"));
  } catch {
    local = DEFAULT_CANAL_SETTINGS;
  }
  runtimeCanalSettings = local;
  if (!isSupabaseConfigured) return local;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id !== userId) return local;
    const { data, error } = await supabase.from("user_app_settings").select("user_id,settings").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (data?.user_id !== userId) return local;
    const cloud = normalizeCanalSettings(data.settings);
    await AsyncStorage.setItem(localKey, JSON.stringify(cloud));
    runtimeCanalSettings = cloud;
    return cloud;
  } catch {
    return local;
  }
}

export async function saveAccountCanalSettings(userId: string, settings: CanalSettings): Promise<CanalSettings> {
  const normalized = normalizeCanalSettings(settings);
  runtimeCanalSettings = normalized;
  await AsyncStorage.setItem(accountSettingsKey(userId), JSON.stringify(normalized));
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
  if (!isSupabaseConfigured) return normalized;
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id !== userId) throw new Error("The active Canal account changed.");
  const { error } = await supabase.from("user_app_settings").upsert({ user_id: userId, settings: normalized, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (currentUser?.id !== userId) throw new Error("The active Canal account changed.");
  return normalized;
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
    trueBlackPlayback: typeof record.trueBlackPlayback === "boolean" ? record.trueBlackPlayback : DEFAULT_CANAL_SETTINGS.trueBlackPlayback,
    allowExplicitDefault: typeof record.allowExplicitDefault === "boolean" ? record.allowExplicitDefault : DEFAULT_CANAL_SETTINGS.allowExplicitDefault,
    smoothTransitionsDefault: typeof record.smoothTransitionsDefault === "boolean" ? record.smoothTransitionsDefault : DEFAULT_CANAL_SETTINGS.smoothTransitionsDefault,
    avoidRecentDefault: typeof record.avoidRecentDefault === "boolean" ? record.avoidRecentDefault : DEFAULT_CANAL_SETTINGS.avoidRecentDefault,
    stageInviteNotifications: typeof record.stageInviteNotifications === "boolean" ? record.stageInviteNotifications : DEFAULT_CANAL_SETTINGS.stageInviteNotifications,
    stageReminderNotifications: typeof record.stageReminderNotifications === "boolean" ? record.stageReminderNotifications : DEFAULT_CANAL_SETTINGS.stageReminderNotifications,
    socialNotifications: typeof record.socialNotifications === "boolean" ? record.socialNotifications : DEFAULT_CANAL_SETTINGS.socialNotifications,
    collaborationNotifications: typeof record.collaborationNotifications === "boolean" ? record.collaborationNotifications : DEFAULT_CANAL_SETTINGS.collaborationNotifications,
    followReduceMotion: typeof record.followReduceMotion === "boolean" ? record.followReduceMotion : DEFAULT_CANAL_SETTINGS.followReduceMotion,
    enhancedContrast: typeof record.enhancedContrast === "boolean" ? record.enhancedContrast : DEFAULT_CANAL_SETTINGS.enhancedContrast,
    interfaceHaptics: typeof record.interfaceHaptics === "boolean" ? record.interfaceHaptics : DEFAULT_CANAL_SETTINGS.interfaceHaptics,
    smartSpotifySync: typeof record.smartSpotifySync === "boolean" ? record.smartSpotifySync : DEFAULT_CANAL_SETTINGS.smartSpotifySync,
    songLearningEnabled: typeof record.songLearningEnabled === "boolean" ? record.songLearningEnabled : DEFAULT_CANAL_SETTINGS.songLearningEnabled,
    dislikeWindowDays: [7, 14, 30, 60].includes(Number(record.dislikeWindowDays)) ? record.dislikeWindowDays as 7 | 14 | 30 | 60 : DEFAULT_CANAL_SETTINGS.dislikeWindowDays,
  };
}
