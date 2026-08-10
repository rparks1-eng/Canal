import { StyleSheet, Text, View } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";
import type { StoredScene } from "../../lib/scenes";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { scenePresentation } from "./scene-signature";

export function sceneGenreSignals(genres: string | undefined): string[] {
  const seen = new Set<string>();
  return (genres ?? "")
    .split(/[,•|/]/u)
    .map((genre) => genre.trim())
    .filter((genre) => {
      const key = genre.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export function SceneGenreBreakdown(props: {
  scene: Pick<StoredScene, "genres" | "name">;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const genres = sceneGenreSignals(props.scene.genres);
  if (genres.length === 0) return null;

  return (
    <View
      accessibilityLabel={`Genre mix for ${props.scene.name}: ${genres.join(", ")}`}
      style={[styles.container, props.compact && styles.containerCompact, props.style]}
    >
      <View style={styles.spectrum}>
        {genres.map((genre) => {
          const presentation = scenePresentation({
            name: "",
            activity: "",
            emotions: "",
            genres: genre,
            energy: "medium",
          });
          return <View key={genre.toLowerCase()} style={[styles.segment, { backgroundColor: presentation.accent }]} />;
        })}
      </View>
      <View style={styles.copyRow}>
        <Text style={styles.kicker}>GENRE DNA</Text>
        <Text numberOfLines={1} style={styles.genres}>{genres.join(" · ")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minWidth: 110, gap: 4 },
  containerCompact: { minWidth: 82 },
  spectrum: { height: 5, overflow: "hidden", flexDirection: "row", gap: 2, borderRadius: 5 },
  segment: { flex: 1, minWidth: 8, borderRadius: 5 },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kicker: { color: canalDynamicColors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  genres: { flex: 1, color: canalDynamicColors.text, fontSize: 8, fontWeight: "700", textTransform: "capitalize" },
});
