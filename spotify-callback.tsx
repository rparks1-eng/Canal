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

WebBrowser.maybeCompleteAuthSession();

export default function SpotifyCallbackScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(
        "/music-services",
      );
    }, 300);

    return () => {
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
    backgroundColor: "#FFF9F4",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  title: {
    color: "#181818",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 18,
    textAlign: "center",
  },

  message: {
    color: "#6C655F",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
});
