import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  AppState,
  Platform,
} from "react-native";

import {
  createClient,
  processLock,
} from "@supabase/supabase-js";

const supabaseUrl =
  process.env
    .EXPO_PUBLIC_SUPABASE_URL
    ?.trim() ?? "";

const supabasePublishableKey =
  process.env
    .EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?.trim() ?? "";

export const isSupabaseConfigured =
  supabaseUrl.startsWith(
    "https://",
  ) &&
  supabaseUrl.includes(
    ".supabase.co",
  ) &&
  (
    supabasePublishableKey.startsWith(
      "sb_publishable_",
    ) ||
    supabasePublishableKey.startsWith(
      "eyJ",
    )
  );

export const supabase =
  createClient(
    isSupabaseConfigured
      ? supabaseUrl
      : "https://placeholder.supabase.co",

    isSupabaseConfigured
      ? supabasePublishableKey
      : "sb_publishable_placeholder_for_local_compile",

    {
      auth: {
        storage:
          AsyncStorage,

        autoRefreshToken:
          true,

        persistSession:
          true,

        detectSessionInUrl:
          false,

        flowType:
          "pkce",

        lock:
          processLock,
      },
    },
  );

let listenerInstalled =
  false;

if (
  Platform.OS !== "web" &&
  isSupabaseConfigured &&
  !listenerInstalled
) {
  listenerInstalled =
    true;

  AppState.addEventListener(
    "change",
    (state) => {
      if (
        state === "active"
      ) {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    },
  );
}

export function requireSupabaseConfiguration(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add the EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY values to ~/canal/.env, save it, and restart Metro.",
    );
  }
}
