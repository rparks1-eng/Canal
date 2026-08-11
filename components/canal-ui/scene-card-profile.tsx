import { StyleSheet, Text, View } from "react-native";

import type { StoredScene } from "../../lib/scenes";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { SceneEnergySignature } from "./scene-energy-signature";

export type SceneCardProfileVariant = "list" | "grid" | "compact";

function signals(value: string, limit: number): string[] {
  return value
    .split(/[,/|\u2022]+/u)
    .map((signal) => signal.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function sceneCardDescriptors(scene: Pick<StoredScene, "emotions" | "genres">): {
  moods: string[];
  genre: string | null;
} {
  return {
    moods: signals(scene.emotions, 3),
    genre: signals(scene.genres, 1)[0] ?? null,
  };
}

export function SceneCardProfile(props: {
  accent: string;
  metadata: string;
  scene: StoredScene;
  secondary?: string;
  variant?: SceneCardProfileVariant;
}) {
  const variant = props.variant ?? "list";
  const grid = variant === "grid";
  const descriptors = sceneCardDescriptors(props.scene);
  const descriptorLabel = [...descriptors.moods, descriptors.genre].filter(Boolean).join(", ");
  return (
    <View style={[styles.container, grid && styles.containerGrid, variant === "compact" && styles.containerCompact]}>
      <View style={styles.identity}>
        <Text numberOfLines={1} style={[styles.title, grid && styles.titleGrid]}>{props.scene.name}</Text>
        <Text numberOfLines={1} style={[styles.metadata, { color: `${props.accent}CC` }]}>{props.metadata}</Text>
        {props.secondary && !grid ? <Text numberOfLines={1} style={styles.secondary}>{props.secondary}</Text> : null}
      </View>
      <SceneEnergySignature accent={props.accent} compact={variant !== "list"} scene={props.scene} style={styles.energy} />
      {descriptorLabel ? (
        <View accessibilityLabel={`Categories: ${descriptorLabel}`} style={styles.descriptors}>
          {descriptors.moods.length > 0 ? <Text numberOfLines={1} style={styles.descriptorText}>{descriptors.moods.join("  ")}</Text> : null}
          {descriptors.moods.length > 0 && descriptors.genre ? <Text style={styles.descriptorDot}>·</Text> : null}
          {descriptors.genre ? <Text numberOfLines={1} style={styles.descriptorText}>{descriptors.genre}</Text> : null}
        </View>
      ) : null}
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
  descriptors: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 7, overflow: "hidden" },
  descriptorText: { flexShrink: 1, color: canalDynamicColors.text, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  descriptorDot: { color: canalDynamicColors.text, fontSize: 13, lineHeight: 14, fontWeight: "900" },
});
