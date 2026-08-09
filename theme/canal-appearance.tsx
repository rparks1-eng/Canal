import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  use,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  Appearance,
  useColorScheme,
} from "react-native";

import {
  StatusBar,
} from "expo-status-bar";

import * as SystemUI from "expo-system-ui";

import {
  getCanalColors,
} from "./canal-colors";

import type {
  CanalColorScheme,
} from "./canal-colors";

export type CanalAppearanceMode = "light" | "dark" | "system";

const APPEARANCE_STORAGE_KEY = "@canal/appearance-mode:v1";

type CanalAppearanceValue = {
  mode: CanalAppearanceMode;
  resolvedScheme: CanalColorScheme;
  ready: boolean;
  setMode: (mode: CanalAppearanceMode) => Promise<void>;
};

const CanalAppearanceContext = createContext<CanalAppearanceValue>({
  mode: "system",
  resolvedScheme: "light",
  ready: false,
  setMode: async () => {},
});

function isMode(value: string | null): value is CanalAppearanceMode {
  return value === "light" || value === "dark" || value === "system";
}

function applyMode(mode: CanalAppearanceMode): void {
  Appearance.setColorScheme(mode === "system" ? null : mode);
}

export function CanalAppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setStoredMode] = useState<CanalAppearanceMode>("system");
  const [ready, setReady] = useState(false);
  const systemScheme = useColorScheme();
  const resolvedScheme: CanalColorScheme =
    mode === "system"
      ? systemScheme === "dark" ? "dark" : "light"
      : mode;

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        const nextMode = isMode(stored) ? stored : "system";
        applyMode(nextMode);
        setStoredMode(nextMode);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback(async (nextMode: CanalAppearanceMode) => {
    applyMode(nextMode);
    setStoredMode(nextMode);
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, nextMode);
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(
      getCanalColors(resolvedScheme).page,
    ).catch(() => {
      // The React tree still carries the correct adaptive canvas.
    });
  }, [resolvedScheme]);

  const value = useMemo(
    () => ({ mode, resolvedScheme, ready, setMode }),
    [mode, ready, resolvedScheme, setMode],
  );

  return (
    <CanalAppearanceContext.Provider value={value}>
      <StatusBar
        animated
        style={resolvedScheme === "dark" ? "light" : "dark"}
      />
      {children}
    </CanalAppearanceContext.Provider>
  );
}

export function useCanalAppearance(): CanalAppearanceValue {
  return use(CanalAppearanceContext);
}
