import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

export type PublicPreviewStatus = "loading" | "not-found" | "private" | "expired";

const COPY: Record<Exclude<PublicPreviewStatus, "loading">, { title: string; body: string }> = {
  "not-found": {
    title: "This link is unavailable",
    body: "It may have been removed, or the link may be incomplete.",
  },
  private: {
    title: "This is private",
    body: "Only people with access inside Canal can open it.",
  },
  expired: {
    title: "This Stage has ended",
    body: "The live room is no longer accepting listeners.",
  },
};

export function PublicPreviewState({ status }: { status: PublicPreviewStatus }) {
  if (status === "loading") {
    return (
      <View accessibilityLiveRegion="polite" style={styles.centered}>
        <ActivityIndicator color="#72D8C4" size="large" />
        <Text style={styles.body}>Opening this Canal link…</Text>
      </View>
    );
  }

  const copy = COPY[status];
  return (
    <View accessibilityRole="alert" style={styles.centered}>
      <Ionicons color="#D8FFF6" name="lock-closed-outline" size={28} />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace("/(tabs)/explore")} style={styles.button}>
        <Text style={styles.buttonText}>Explore Canal</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 28 },
  title: { color: canalDynamicColors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  body: { color: canalDynamicColors.muted, fontSize: 15, lineHeight: 22, maxWidth: 420, textAlign: "center" },
  button: { alignItems: "center", backgroundColor: "#DFFFF7", borderRadius: 16, justifyContent: "center", minHeight: 48, marginTop: 8, paddingHorizontal: 20 },
  buttonText: { color: "#153F50", fontSize: 15, fontWeight: "800" },
});
