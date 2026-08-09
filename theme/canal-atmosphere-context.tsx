import {
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";

import type {
  PropsWithChildren,
} from "react";

export const CANAL_ATMOSPHERE_TRANSITION_MS =
  6_000;

export const CANAL_STUDIO_ATMOSPHERE_TRANSITION_MS =
  8_500;

export type CanalAtmosphereOverride = Readonly<{
  base: string;
  glowOne: string;
  glowTwo: string;
  glowThree: string;
  navigation: string;
  accent: string;
  accentText: string;
  selected: string;
  border: string;
  shadow: string;
  transitionMs?: number;
}>;

type CanalAtmosphereContextValue = Readonly<{
  override: CanalAtmosphereOverride | null;
  setOverride: (value: CanalAtmosphereOverride | null) => void;
}>;

const CanalAtmosphereContext =
  createContext<CanalAtmosphereContextValue>({
    override: null,
    setOverride: () => undefined,
  });

export function CanalAtmosphereProvider(
  props: PropsWithChildren,
) {
  const [override, setOverrideState] =
    useState<CanalAtmosphereOverride | null>(null);

  const setOverride = useCallback(
    (value: CanalAtmosphereOverride | null) => {
      setOverrideState(value);
    },
    [],
  );

  const value = useMemo(
    () => ({ override, setOverride }),
    [override, setOverride],
  );

  return (
    <CanalAtmosphereContext.Provider value={value}>
      {props.children}
    </CanalAtmosphereContext.Provider>
  );
}

export { CanalAtmosphereContext };
