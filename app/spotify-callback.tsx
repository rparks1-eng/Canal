import { useEffect } from "react";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  readSpotifyReturnRoute,
} from "../lib/spotify-auth-return";

WebBrowser.maybeCompleteAuthSession();

export default function SpotifyCallbackScreen() {
  useEffect(() => {
    let active =
      true;

    const timer = setTimeout(() => {
      void readSpotifyReturnRoute()
        .then((route) => {
          if (active) {
            router.replace(
              route as never,
            );
          }
        });
    }, 300);

    return () => {
      active =
        false;

      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <StatusBar style="dark" />

      <View style={styles.content}>
        <ActivityIndicator size="large" />

        <Text style={styles.title}>
          Returning to Canal
        </Text>

        <Text style={styles.message}>
          Finishing your Spotify
          connection...
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3EFE5",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  title: {
      fontFamily: "Georgia",
    color: "#191A18",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 18,
    textAlign: "center",
  },

  message: {
    color: "#6D6B64",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
});
