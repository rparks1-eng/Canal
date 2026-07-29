import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import {
  Stack,
  router,
  useGlobalSearchParams,
  useSegments,
} from "expo-router";

import {
  AuthProvider,
  useAuth,
} from "../providers/auth-provider";

import {
  ConnectivityProvider,
} from "../providers/connectivity-provider";

import {
  AnalyticsProvider,
} from "../providers/analytics-provider";

import {
  ConnectivityBanner,
} from "../components/connectivity-banner";

import {
  isOnboardingRequired,
  ONBOARDING_METADATA_KEY,
  readPendingOnboardingDestination,
  subscribeToOnboarding,
} from "../lib/onboarding";

import type {
  OnboardingDestination,
} from "../lib/onboarding";

import {
  consumePublicSceneReturn,
  rememberPublicSceneReturn,
} from "../lib/auth-return";

type OnboardingState =
  | "checking"
  | "required"
  | "complete";

function CanalNavigator() {
  const segments =
    useSegments();

  const routeParams =
    useGlobalSearchParams<{
      ownerId?: string;
      sceneId?: string;
    }>();

  const {
    session,
    loading,
  } =
    useAuth();

  const routeKey =
    segments.join("/");

  const userId =
    session?.user.id ??
    null;

  const userEmail =
    session?.user.email ??
    null;

  const userCreatedAt =
    session?.user.created_at ??
    null;

  const completedOnboardingVersion =
    session?.user.user_metadata?.[
      ONBOARDING_METADATA_KEY
    ];

  const [
    onboardingState,
    setOnboardingState,
  ] =
    useState<OnboardingState>(
      "checking",
    );

  const [
    onboardingDestination,
    setOnboardingDestination,
  ] =
    useState<
      OnboardingDestination | null
    >(
      null,
    );

  const [
    onboardingCheckedUserId,
    setOnboardingCheckedUserId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const activeUserIdRef =
    useRef<
      string | null
    >(
      userId,
    );

  activeUserIdRef.current =
    userId;

  const authNavigationUserId =
    useRef<
      string | null
    >(
      null,
    );

  useEffect(() => {
    if (loading) {
      return;
    }

    if (
      !userId
    ) {
      setOnboardingState(
        "complete",
      );
      setOnboardingCheckedUserId(
        null,
      );

      return;
    }

    let active =
      true;
    let completionPublished =
      false;

    setOnboardingState(
      "checking",
    );
    setOnboardingDestination(
      null,
    );
    setOnboardingCheckedUserId(
      null,
    );

    const unsubscribe =
      subscribeToOnboarding(
        userId,
        (update) => {
          if (active) {
            if (
              !update.required
            ) {
              completionPublished =
                true;
            }

            setOnboardingState(
              update.required
                ? "required"
                : "complete",
            );

            setOnboardingDestination(
              update.destination,
            );
            setOnboardingCheckedUserId(
              userId,
            );
          }
        },
      );

    isOnboardingRequired(
      userId,
      userEmail,
      userCreatedAt,
      completedOnboardingVersion,
    )
      .then(
        (required) => {
          if (
            active &&
            !completionPublished &&
            readPendingOnboardingDestination(
              userId,
            ) === null
          ) {
            setOnboardingState(
              required
                ? "required"
                : "complete",
            );
            setOnboardingDestination(
              (current) =>
                required
                  ? null
                  : current,
            );
            setOnboardingCheckedUserId(
              userId,
            );
          }
        },
      )
      .catch(
        (error: unknown) => {
          console.warn(
            "Canal could not read the first-run onboarding state:",
            error,
          );

          /*
           * Storage failure must not trap an existing
           * user behind onboarding on every launch.
           */
          if (active) {
            setOnboardingState(
              "complete",
            );
            setOnboardingCheckedUserId(
              userId,
            );
          }
        },
      );

    return () => {
      active =
        false;

      unsubscribe();
    };
  }, [
    loading,
    completedOnboardingVersion,
    userCreatedAt,
    userEmail,
    userId,
  ]);

  useEffect(() => {
    if (
      loading ||
      (
        session &&
        (
          onboardingState ===
            "checking" ||
          onboardingCheckedUserId !==
            userId
        )
      )
    ) {
      return;
    }

    const rootSegment =
      segments[0];

    const isAccountRoute =
      rootSegment ===
        "login" ||
      rootSegment ===
        "auth";

    if (
      !session &&
      !isAccountRoute
    ) {
      if (
        rootSegment ===
          "public-scene" &&
        typeof routeParams.ownerId ===
          "string" &&
        typeof routeParams.sceneId ===
          "string"
      ) {
        void rememberPublicSceneReturn(
          routeParams.ownerId,
          routeParams.sceneId,
        ).finally(
          () => {
            if (
              activeUserIdRef.current ===
                null
            ) {
              router.replace(
                "/login" as never,
              );
            }
          },
        );

        return;
      }

      router.replace(
        "/login" as never,
      );

      return;
    }

    if (
      session &&
      rootSegment ===
        "auth"
    ) {
      return;
    }

    const isOnboardingRoute =
      rootSegment ===
        "onboarding" ||
      rootSegment ===
        "connect-music" ||
      rootSegment ===
        "spotify-callback";

    if (
      session &&
      onboardingState ===
        "required" &&
      !isOnboardingRoute
    ) {
      router.replace(
        "/onboarding" as never,
      );

      return;
    }

    if (
      session &&
      onboardingState ===
        "complete" &&
      (
        rootSegment ===
          "login" ||
        rootSegment ===
          "onboarding"
      )
    ) {
      if (
        authNavigationUserId.current ===
          userId
      ) {
        return;
      }

      const expectedUserId =
        userId;

      authNavigationUserId.current =
        expectedUserId;

      const fallbackDestination =
        rootSegment ===
          "onboarding"
          ? onboardingDestination ??
            "/(tabs)"
          : "/(tabs)";

      void consumePublicSceneReturn()
        .then(
          (returnDestination) => {
            if (
              activeUserIdRef.current !==
                expectedUserId
            ) {
              return;
            }

            setOnboardingDestination(
              null,
            );

            router.replace(
              (
                returnDestination ??
                fallbackDestination
              ) as never,
            );
          },
        )
        .catch(
          () => {
            if (
              activeUserIdRef.current !==
                expectedUserId
            ) {
              return;
            }

            setOnboardingDestination(
              null,
            );

            router.replace(
              fallbackDestination as never,
            );
          },
        )
        .finally(
          () => {
            if (
              authNavigationUserId.current ===
                expectedUserId
            ) {
              authNavigationUserId.current =
                null;
            }
          },
        );
    }
  }, [
    loading,
    onboardingCheckedUserId,
    onboardingDestination,
    onboardingState,
    routeParams.ownerId,
    routeParams.sceneId,
    routeKey,
    segments,
    session,
    userId,
  ]);

  if (
    loading ||
    (
      session &&
      (
        onboardingState ===
          "checking" ||
        onboardingCheckedUserId !==
          userId
      )
    )
  ) {
    return (
      <View
        style={
          styles.loading
        }
      >
        <ActivityIndicator
          size="large"
        />
      </View>
    );
  }

  return (
    <Stack
      key={
        userId ??
        "signed-out"
      }
      screenOptions={{
        headerShown:
          false,

        animation:
          "slide_from_right",

        contentStyle: {
          backgroundColor:
            "#FFF9F4",
        },
      }}
    >
      <Stack.Screen
        name="login"
      />

      <Stack.Screen
        name="onboarding"
      />

      <Stack.Screen
        name="connect-music"
      />

      <Stack.Screen
        name="auth/callback"
      />

      <Stack.Screen
        name="auth/forgot-password"
      />

      <Stack.Screen
        name="auth/reset-password"
      />

      <Stack.Screen
        name="(tabs)"
      />

      <Stack.Screen
        name="settings"
      />

      <Stack.Screen
        name="music-services"
      />

      <Stack.Screen
        name="spotify-callback"
      />

      <Stack.Screen
        name="spotify-library"
      />

      <Stack.Screen
        name="scene-studio"
      />

      <Stack.Screen
        name="scene-collaboration"
      />

      <Stack.Screen
        name="collections/new"
      />

      <Stack.Screen
        name="collections/[collectionId]"
      />

      <Stack.Screen
        name="event-run-sheet"
      />

      <Stack.Screen
        name="scene-preview"
      />

      <Stack.Screen
        name="scenes/[sceneId]"
      />

      <Stack.Screen
        name="now-playing"
      />

      <Stack.Screen
        name="scene-feedback"
      />

      <Stack.Screen
        name="scene-snapshot"
      />

      <Stack.Screen
        name="snapshot-templates"
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ConnectivityProvider>
      <View
        style={
          styles.root
        }
      >
        <ConnectivityBanner />

        <AuthProvider>
          <AnalyticsProvider>
            <CanalNavigator />
          </AnalyticsProvider>
        </AuthProvider>
      </View>
    </ConnectivityProvider>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
    },

    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF9F4",
    },
  });
