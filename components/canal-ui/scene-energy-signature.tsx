import { StyleSheet, Text, View } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";
import type { StoredScene } from "../../lib/scenes";

type ArcScene = Pick<StoredScene, "id" | "name" | "activity" | "energy"> & { sceneArc?: unknown };

export type SceneArcShape = "steady" | "build" | "waves";

export function sceneArcShape(scene: ArcScene): SceneArcShape {
  const value = typeof scene.sceneArc === "string" ? scene.sceneArc.trim().toLowerCase() : "";
  if (value === "build") return "build";
  if (value === "waves" || value === "wave") return "waves";
  return "steady";
}

export function sceneEnergyArcPoints(scene: ArcScene): number[] {
  const energy = (scene.energy ?? "medium").toLowerCase();
  const shape = sceneArcShape(scene);
  const center = energy === "high" ? 0.72 : energy === "low" ? 0.3 : 0.52;
  const amplitude = energy === "high" ? 0.22 : energy === "low" ? 0.1 : 0.16;
  const count = 9;

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    let value = center;
    if (shape === "build") value = Math.max(0.12, center - amplitude) + (amplitude * 2 * progress);
    else if (shape === "waves") value = center + Math.sin(progress * Math.PI * 4) * amplitude;
    else value = center + Math.sin(progress * Math.PI * 2) * amplitude * 0.18;
    return Math.max(0.1, Math.min(0.94, value));
  });
}

export function SceneEnergySignature(props: {
  scene: ArcScene;
  accent: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const points = sceneEnergyArcPoints(props.scene);
  const energy = props.scene.energy?.trim() || "Medium";
  const arc = sceneArcShape(props.scene);
  const arcLabel = arc === "waves" ? "Waves" : arc === "build" ? "Build" : "Steady";

  return (
    <View
      accessibilityLabel={`${energy} energy, ${arcLabel} arc for ${props.scene.name}`}
      style={[styles.container, props.compact && styles.containerCompact, props.style]}
    >
      <View style={styles.lineCanvas}>
        {points.slice(0, -1).map((point, index) => {
          const next = points[index + 1];
          const pointTop = (1 - point) * 24;
          const nextTop = (1 - next) * 24;
          return (
            <View key={`${props.scene.id}:arc:${index}`} style={styles.lineCell}>
              <View style={[styles.horizontalLine, { backgroundColor: props.accent, top: pointTop }]} />
              <View
                style={[
                  styles.verticalLine,
                  {
                    backgroundColor: props.accent,
                    height: Math.max(2, Math.abs(nextTop - pointTop) + 2),
                    top: Math.min(pointTop, nextTop),
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: props.accent }]}>
        {energy} energy · {arcLabel} arc
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 40, minWidth: 88, justifyContent: "center", gap: 4 },
  containerCompact: { minWidth: 64, minHeight: 34 },
  lineCanvas: { height: 26, flexDirection: "row", overflow: "hidden" },
  lineCell: { flex: 1, position: "relative" },
  horizontalLine: { position: "absolute", left: 0, right: 0, height: 2, borderRadius: 2, opacity: 0.9 },
  verticalLine: { position: "absolute", right: -1, width: 2, borderRadius: 2, opacity: 0.9 },
  label: { fontSize: 8, fontWeight: "900", letterSpacing: 0.45, textTransform: "uppercase" },
});
