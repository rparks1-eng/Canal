import { StyleSheet, Text, View } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";
import type { StoredScene } from "../../lib/scenes";
import { SceneEnergySignature } from "./scene-energy-signature";
import { SceneGenreBreakdown } from "./scene-genre-breakdown";
import { SceneMoodBreakdown } from "./scene-mood-breakdown";

type SceneDna = Pick<StoredScene, "activity" | "emotions" | "energy" | "genres" | "id" | "name">;

export function SceneDnaPanel(props: {
  accent: string;
  scene: SceneDna;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityLabel={`Scene DNA for ${props.scene.name}`}
      style={[styles.container, props.style]}
    >
      <View style={styles.headingRow}>
        <View style={[styles.headingLine, { backgroundColor: props.accent }]} />
        <Text style={[styles.heading, { color: props.accent }]}>SCENE DNA</Text>
        <View style={[styles.headingLine, { backgroundColor: props.accent }]} />
      </View>
      <SceneEnergySignature accent={props.accent} scene={props.scene} style={styles.energy} />
      <View style={styles.signalRow}>
        <SceneMoodBreakdown compact scene={props.scene} style={styles.signal} />
        <SceneGenreBreakdown compact scene={props.scene} style={styles.signal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: 10, marginTop: 17 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headingLine: { flex: 1, height: StyleSheet.hairlineWidth, opacity: 0.42 },
  heading: { fontSize: 8, fontWeight: "900", letterSpacing: 1.35 },
  energy: { width: "100%" },
  signalRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  signal: { flex: 1, minWidth: 0 },
});
