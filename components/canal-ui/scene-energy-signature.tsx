import { StyleSheet, Text, View } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";
import type { StoredScene } from "../../lib/scenes";

export function sceneEnergyBars(scene: Pick<StoredScene, "id" | "name" | "activity" | "energy">): number[] {
  const energy = (scene.energy ?? "medium").toLowerCase();
  const baseline = energy === "high" ? 0.7 : energy === "low" ? 0.32 : 0.52;
  const seed = `${scene.id}:${scene.name}:${scene.activity}:${energy}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: 9 }, (_, index) => {
    hash = Math.imul(hash ^ (index + 17), 2246822519);
    const variation = ((hash >>> 0) % 41) / 100 - 0.2;
    return Math.max(0.18, Math.min(1, baseline + variation));
  });
}

export function SceneEnergySignature(props: {
  scene: Pick<StoredScene, "id" | "name" | "activity" | "energy">;
  accent: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bars = sceneEnergyBars(props.scene);
  const energy = props.scene.energy?.trim() || "Medium";
  return (
    <View
      accessibilityLabel={`${energy} energy signature for ${props.scene.name}`}
      style={[styles.container, props.compact && styles.containerCompact, props.style]}
    >
      <View style={styles.bars}>
        {bars.map((height, index) => (
          <View
            key={`${props.scene.id}:energy:${index}`}
            style={[styles.bar, { backgroundColor: props.accent, height: `${Math.round(height * 100)}%` }]}
          />
        ))}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: props.accent }]}>{energy} energy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 40, minWidth: 88, justifyContent: "center", gap: 4 },
  containerCompact: { minWidth: 64, minHeight: 34 },
  bars: { height: 24, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  bar: { flex: 1, minWidth: 2, borderRadius: 3, opacity: 0.84 },
  label: { fontSize: 8, fontWeight: "900", letterSpacing: 0.45, textTransform: "uppercase" },
});
