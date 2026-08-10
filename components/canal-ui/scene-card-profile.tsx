import { StyleSheet, Text, View } from "react-native";

import type { StoredScene } from "../../lib/scenes";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { SceneEnergySignature } from "./scene-energy-signature";
import { SceneGenreBreakdown } from "./scene-genre-breakdown";
import { SceneMoodBreakdown } from "./scene-mood-breakdown";

export type SceneCardProfileVariant = "list" | "grid" | "compact";

export function SceneCardProfile(props: {
  accent: string;
  metadata: string;
  scene: StoredScene;
  secondary?: string;
  variant?: SceneCardProfileVariant;
}) {
  const variant = props.variant ?? "list";
  const grid = variant === "grid";
  return (
    <View style={[styles.container, grid && styles.containerGrid, variant === "compact" && styles.containerCompact]}>
      <View style={styles.identity}>
        <Text numberOfLines={1} style={[styles.title, grid && styles.titleGrid]}>{props.scene.name}</Text>
        <Text numberOfLines={1} style={[styles.metadata, { color: `${props.accent}CC` }]}>{props.metadata}</Text>
        {props.secondary && !grid ? <Text numberOfLines={1} style={styles.secondary}>{props.secondary}</Text> : null}
      </View>
      <SceneEnergySignature accent={props.accent} compact={variant !== "list"} scene={props.scene} style={styles.energy} />
      <View style={[styles.breakdowns, grid && styles.breakdownsGrid]}>
        <SceneMoodBreakdown compact reserveSpace={grid} scene={props.scene} style={styles.breakdown} />
        <SceneGenreBreakdown compact reserveSpace={grid} scene={props.scene} style={styles.breakdown} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, gap: 7 },
  containerGrid: { minHeight: 174, justifyContent: "space-between" },
  containerCompact: { gap: 5 },
  identity: { minWidth: 0, paddingRight: 30 },
  title: { minHeight: 20, color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 17, fontWeight: "600" },
  titleGrid: { fontSize: 15, lineHeight: 18 },
  metadata: { minHeight: 12, fontSize: 9, lineHeight: 12, fontWeight: "800" },
  secondary: { color: canalDynamicColors.muted, fontSize: 9, lineHeight: 12 },
  energy: { width: "100%" },
  breakdowns: { flexDirection: "row", gap: 10, minHeight: 17 },
  breakdownsGrid: { height: 40, flexDirection: "column", gap: 6 },
  breakdown: { flex: 1, minWidth: 0 },
});
