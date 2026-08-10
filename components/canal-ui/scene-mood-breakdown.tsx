import { StyleSheet, Text, View } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";
import type { StoredScene } from "../../lib/scenes";
import { scenePresentation } from "./scene-signature";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

export function sceneMoodSignals(emotions: string | undefined): string[] {
  const seen = new Set<string>();
  return (emotions ?? "")
    .split(/[,•|/]/u)
    .map((mood) => mood.trim())
    .filter((mood) => {
      const key = mood.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export function SceneMoodBreakdown(props: {
  scene: Pick<StoredScene, "emotions" | "name">;
  compact?: boolean;
  reserveSpace?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const moods = sceneMoodSignals(props.scene.emotions);
  if (moods.length === 0) {
    return props.reserveSpace ? <View accessibilityElementsHidden style={[styles.container, styles.reserved, props.style]} /> : null;
  }
  return (
    <View
      accessibilityLabel={`Mood mix for ${props.scene.name}: ${moods.join(", ")}`}
      style={[styles.container, props.compact && styles.containerCompact, props.style]}
    >
      <View style={styles.spectrum}>
        {moods.map((mood) => {
          const presentation = scenePresentation({ name: "", activity: "", emotions: mood, genres: "", energy: "medium" });
          return <View key={mood.toLowerCase()} style={[styles.segment, { backgroundColor: presentation.colors[0] }]} />;
        })}
      </View>
      <View style={styles.copyRow}>
        <Text style={styles.kicker}>MOOD MIX</Text>
        <Text numberOfLines={1} style={styles.moods}>
          {moods.map((mood, index) => `${index === 0 ? "Lead " : ""}${mood}`).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minWidth: 110, gap: 4 },
  containerCompact: { minWidth: 82 },
  reserved: { minHeight: 17 },
  spectrum: { height: 5, overflow: "hidden", flexDirection: "row", gap: 2, borderRadius: 5 },
  segment: { flex: 1, minWidth: 8, borderRadius: 5 },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kicker: { color: canalDynamicColors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  moods: { flex: 1, color: canalDynamicColors.text, fontSize: 8, fontWeight: "700", textTransform: "capitalize" },
});
