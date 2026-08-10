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
  const center = energy === "high" ? 0.66 : energy === "low" ? 0.36 : 0.52;
  const amplitude = energy === "high" ? 0.34 : energy === "low" ? 0.22 : 0.3;
  const count = 33;

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    let value = center;
    if (shape === "build") {
      value = center - (amplitude * 0.8) + (amplitude * 1.6 * progress)
        + Math.sin(progress * Math.PI * 3) * amplitude * 0.18;
    }
    else if (shape === "waves") value = center + Math.sin(progress * Math.PI * 4) * amplitude;
    else value = center + Math.sin(progress * Math.PI * 2) * amplitude * 0.55;
    return Math.max(0.06, Math.min(0.94, value));
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
          const pointTop = (1 - point) * 32 + 1;
          const nextTop = (1 - next) * 32 + 1;
          const midpoint = (pointTop + nextTop) / 2;
          const angle = Math.atan2(nextTop - pointTop, 8) * (180 / Math.PI);
          return (
            <View key={`${props.scene.id}:arc:${index}`} style={styles.lineCell}>
              <View
                style={[
                  styles.lineGlow,
                  {
                    backgroundColor: props.accent,
                    top: midpoint,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
              <View
                style={[
                  styles.lineStroke,
                  {
                    backgroundColor: props.accent,
                    top: midpoint + 1,
                    transform: [{ rotate: `${angle}deg` }],
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
  lineCanvas: { height: 36, flexDirection: "row", overflow: "hidden" },
  lineCell: { flex: 1, position: "relative" },
  lineGlow: { position: "absolute", left: "-18%", width: "136%", height: 6, borderRadius: 6, opacity: 0.2 },
  lineStroke: { position: "absolute", left: "-14%", width: "128%", height: 2.5, borderRadius: 3, opacity: 0.96 },
  label: { fontSize: 8, fontWeight: "900", letterSpacing: 0.45, textTransform: "uppercase" },
});
