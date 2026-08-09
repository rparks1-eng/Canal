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
} from "react-native";

export type CanalAppearanceMode = "light" | "dark" | "system";

const APPEARANCE_STORAGE_KEY = "@canal/appearance-mode:v1";

type CanalAppearanceValue = {
  mode: CanalAppearanceMode;
  ready: boolean;
  setMode: (mode: CanalAppearanceMode) => Promise<void>;
};

const CanalAppearanceContext = createContext<CanalAppearanceValue>({
  mode: "system",
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

  const value = useMemo(() => ({ mode, ready, setMode }), [mode, ready, setMode]);

  return (
    <CanalAppearanceContext.Provider value={value}>
      {children}
    </CanalAppearanceContext.Provider>
  );
}

export function useCanalAppearance(): CanalAppearanceValue {
  return use(CanalAppearanceContext);
}
