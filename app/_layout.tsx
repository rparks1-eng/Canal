import {
  useEffect,
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

  useEffect(() => {
    if (loading) {
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
        "login"
    ) {
      router.replace(
        "/(tabs)" as never,
      );
    }
  }, [
    loading,
    routeKey,
    segments,
    session,
  ]);

  if (loading) {
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
    <AuthProvider>
      <CanalNavigator />
    </AuthProvider>
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
