import {
  StyleSheet,
  View,
} from "react-native";

import type {
  StyleProp,
  ViewStyle,
} from "react-native";
import type { StoredScene } from "../../lib/scenes";
import {
  SceneSignature,
  type ScenePresentation,
} from "./scene-signature";

export function SceneCardBackdrop(props: Readonly<{
  presentation: ScenePresentation;
  scene?: Pick<StoredScene, "activity" | "energy" | "genres" | "id" | "name">;
}>) {
  const { presentation } = props;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={[styles.base, { backgroundColor: presentation.colors[2] }]} />
      <View style={[styles.glow, styles.glowOne, { backgroundColor: presentation.colors[0] }]} />
      <View style={[styles.glow, styles.glowTwo, { backgroundColor: presentation.colors[1] }]} />
      <View style={styles.readabilityWash} />
    </View>
  );
}

export function ScenePaletteMark(props: Readonly<{
  presentation: ScenePresentation;
  style?: StyleProp<ViewStyle>;
}>) {
  const { presentation } = props;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.mark,
        { backgroundColor: presentation.colors[1], borderColor: `${presentation.accent}66` },
        props.style,
      ]}
    >
      <View style={[styles.markGlow, { backgroundColor: presentation.colors[0] }]} />
      <SceneSignature
        color={presentation.accent}
        kind={presentation.kind}
        style={styles.markSignature}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.36,
  },
  glowOne: {
    width: "148%",
    aspectRatio: 1.8,
    right: "-58%",
    top: "-42%",
  },
  glowTwo: {
    width: "156%",
    aspectRatio: 1.9,
    left: "-62%",
    bottom: "-45%",
    opacity: 0.3,
  },
  readabilityWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 12, 28, 0.16)",
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  markGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    right: -22,
    top: -20,
    opacity: 0.78,
  },
  markSignature: {
    position: "absolute",
    left: 4,
    right: 4,
    top: 5,
    bottom: 5,
  },
});
