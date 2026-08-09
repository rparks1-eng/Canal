import {
  StyleSheet,
  View,
} from "react-native";

import type {
  StyleProp,
  ViewStyle,
} from "react-native";

import {
  SceneSignature,
  type ScenePresentation,
} from "./scene-signature";

export function SceneCardBackdrop(props: Readonly<{
  presentation: ScenePresentation;
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
      <View style={[styles.softLight, { backgroundColor: presentation.accent }]} />
      <SceneSignature
        color={`${presentation.accent}52`}
        kind={presentation.kind}
        style={styles.signature}
      />
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
    borderRadius: 90,
    opacity: 0.46,
  },
  glowOne: {
    width: "132%",
    height: "58%",
    right: "-38%",
    top: "-24%",
    transform: [{ rotate: "-8deg" }],
  },
  glowTwo: {
    width: "124%",
    height: "52%",
    left: "-34%",
    bottom: "-28%",
    opacity: 0.38,
    transform: [{ rotate: "7deg" }],
  },
  softLight: {
    position: "absolute",
    width: "118%",
    height: "34%",
    right: "-26%",
    top: "35%",
    borderRadius: 80,
    opacity: 0.07,
    transform: [{ rotate: "-5deg" }],
  },
  signature: {
    position: "absolute",
    width: "68%",
    height: "78%",
    right: "-4%",
    top: "3%",
    opacity: 0.82,
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
