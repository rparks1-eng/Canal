import type {
  PropsWithChildren,
} from "react";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Session,
  User,
} from "@supabase/supabase-js";

import type {
  LocalProfile,
} from "../lib/canal-session";

import {
  ensureOwnCanalProfile,
  readOwnCanalProfile,
} from "../lib/canal-profile";

import {
  readCanalAccountSessionGeneration,
  recordCanalAccountSession,
} from "../lib/canal-auth";

import {
  prepareSceneLibraryForUser,
  syncScenesWithCloud,
} from "../lib/scene-sync";

import type {
  SceneSyncResult,
} from "../lib/scene-sync";

import {
  isSupabaseConfigured,
  supabase,
} from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  accountEpoch: number;
  profile: LocalProfile | null;
  loading: boolean;
  configured: boolean;
  syncingScenes: boolean;
  lastSceneSync: SceneSyncResult | null;
  refreshProfile: () => Promise<void>;
  syncScenesNow: () => Promise<SceneSyncResult>;
};

const AuthContext =
  createContext<
    AuthContextValue | undefined
  >(undefined);

export function AuthProvider(
  props: PropsWithChildren,
) {
  const [
    session,
    setSession,
  ] =
    useState<Session | null>(
      null,
    );

  const [
    profile,
    setProfile,
  ] =
    useState<LocalProfile | null>(
      null,
    );

  const [
    accountEpoch,
    setAccountEpoch,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    syncingScenes,
    setSyncingScenes,
  ] = useState(false);

  const [
    lastSceneSync,
    setLastSceneSync,
  ] =
    useState<SceneSyncResult | null>(
      null,
    );

  const hydrationVersion =
    useRef(
      0,
    );

  const preparedUserId =
    useRef<string | null>(
      null,
    );

  const syncScenesNow =
    useCallback(
      async (): Promise<SceneSyncResult> => {
        setSyncingScenes(
          true,
        );

        try {
          const result =
            await syncScenesWithCloud();

          setLastSceneSync(
            result,
          );

          return result;
        } finally {
          setSyncingScenes(
            false,
          );
        }
      },
      [],
    );

  const refreshProfile =
    useCallback(
      async (): Promise<void> => {
        const nextProfile =
          await readOwnCanalProfile();

        setProfile(
          nextProfile,
        );
      },
      [],
    );

  const hydrateSession =
    useCallback(
      async (
        nextSession:
          Session | null,
      ): Promise<void> => {
        const version =
          hydrationVersion.current +
          1;

        hydrationVersion.current =
          version;

        setSession(
          nextSession,
        );

        if (!nextSession) {
          preparedUserId.current =
            null;

          setProfile(
            null,
          );

          setLastSceneSync(
            null,
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );

        const userId =
          nextSession.user.id;

        try {
          if (
            preparedUserId.current !==
            userId
          ) {
            await prepareSceneLibraryForUser(
              userId,
            );

            preparedUserId.current =
              userId;
          }

          const nextProfile =
            await ensureOwnCanalProfile();

          if (
            hydrationVersion.current ===
            version
          ) {
            setProfile(
              nextProfile,
            );
          }
        } catch (error) {
          console.warn(
            "Canal could not prepare this account's profile and local Scene cache:",
            error,
          );
        }

        try {
          const result =
            await syncScenesNow();

          if (
            hydrationVersion.current ===
            version
          ) {
            setLastSceneSync(
              result,
            );
          }
        } catch (error) {
          console.warn(
            "Canal could not synchronize this account's Scenes:",
            error,
          );
        }

        if (
          hydrationVersion.current ===
          version
        ) {
          setLoading(
            false,
          );
        }
      },
      [
        syncScenesNow,
      ],
    );

  useEffect(() => {
    let mounted =
      true;

    const initialize =
      async (): Promise<void> => {
        if (
          !isSupabaseConfigured
        ) {
          if (mounted) {
            setLoading(
              false,
            );
          }

          return;
        }

        const {
          data,
          error,
        } =
          await supabase.auth.getSession();

        if (error) {
          console.warn(
            "Canal could not restore the account session:",
            error.message,
          );
        }

        if (mounted) {
          setAccountEpoch(
            recordCanalAccountSession(
              data.session?.user.id ??
                null,
              readCanalAccountSessionGeneration(
                data.session,
              ),
            ),
          );

          await hydrateSession(
            data.session,
          );
        }
      };

    void initialize();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          nextSession,
        ) => {
          if (!mounted) {
            return;
          }

          setAccountEpoch(
            recordCanalAccountSession(
              nextSession?.user.id ??
                null,
              readCanalAccountSessionGeneration(
                nextSession,
              ),
            ),
          );

          /*
           * TOKEN_REFRESHED does not represent an
           * account switch. Avoid clearing or
           * rehydrating the Library for that event.
           */
          if (
            event ===
              "TOKEN_REFRESHED" &&
            nextSession?.user.id ===
              preparedUserId.current
          ) {
            setSession(
              nextSession,
            );

            return;
          }

          setTimeout(
            () => {
              if (mounted) {
                void hydrateSession(
                  nextSession,
                );
              }
            },
            0,
          );
        },
      );

    return () => {
      mounted =
        false;

      subscription.unsubscribe();
    };
  }, [
    hydrateSession,
  ]);

  const value =
    useMemo<AuthContextValue>(
      () => ({
        session,

        user:
          session?.user ??
          null,

        accountEpoch,
        profile,
        loading,

        configured:
          isSupabaseConfigured,

        syncingScenes,
        lastSceneSync,
        refreshProfile,
        syncScenesNow,
      }),
      [
        session,
        accountEpoch,
        profile,
        loading,
        syncingScenes,
        lastSceneSync,
        refreshProfile,
        syncScenesNow,
      ],
    );

  return (
    <AuthContext.Provider
      value={
        value
      }
    >
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context =
    useContext(
      AuthContext,
    );

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider.",
    );
  }

  return context;
}
