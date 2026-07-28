import {
  useEffect,
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
  isOnboardingRequired,
  ONBOARDING_METADATA_KEY,
  subscribeToOnboarding,
} from "../lib/onboarding";

type OnboardingState =
  | "checking"
  | "required"
  | "complete";

function CanalNavigator() {
  const segments =
    useSegments();

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

      return;
    }

    let active =
      true;

    setOnboardingState(
      "checking",
    );

    const unsubscribe =
      subscribeToOnboarding(
        userId,
        (required) => {
          if (active) {
            setOnboardingState(
              required
                ? "required"
                : "complete",
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
          if (active) {
            setOnboardingState(
              required
                ? "required"
                : "complete",
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
        onboardingState ===
          "checking"
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
      router.replace(
        "/(tabs)" as never,
      );
    }
  }, [
    loading,
    onboardingState,
    routeKey,
    segments,
    session,
  ]);

  if (
    loading ||
    (
      session &&
      onboardingState ===
        "checking"
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
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <AnalyticsProvider>
          <CanalNavigator />
        </AnalyticsProvider>
      </AuthProvider>
    </ConnectivityProvider>
  );
}

const styles =
  StyleSheet.create({
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
