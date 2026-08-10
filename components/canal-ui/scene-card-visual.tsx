import {
  StyleSheet,
  View,
} from "react-native";

import type {
  StyleProp,
  ViewStyle,
} from "react-native";
import type { StoredScene } from "../../lib/scenes";
import { sceneGenreSignals } from "./scene-genre-breakdown";

import {
  scenePresentation,
  SceneSignature,
  type ScenePresentation,
} from "./scene-signature";

export function SceneCardBackdrop(props: Readonly<{
  presentation: ScenePresentation;
  scene?: Pick<StoredScene, "activity" | "energy" | "genres" | "id" | "name">;
}>) {
  const { presentation, scene } = props;
  const atmosphere = scene ? sceneCardAtmosphere(scene) : null;

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
      {atmosphere ? (
        <>
          <View
            style={[
              styles.energyHalo,
              {
                backgroundColor: presentation.accent,
                left: atmosphere.haloLeft,
                opacity: atmosphere.haloOpacity,
                top: atmosphere.haloTop,
                transform: [{ rotate: `${atmosphere.rotation}deg` }, { scale: atmosphere.haloScale }],
              },
            ]}
          />
          {atmosphere.genreColors.map((color, index) => (
            <View
              key={`${color}-${index}`}
              style={[
                styles.genreRibbon,
                {
                  backgroundColor: color,
                  opacity: index === 0 ? 0.22 : 0.14,
                  right: `${-18 + index * 20}%`,
                  top: `${18 + index * 27}%`,
                  transform: [{ rotate: `${atmosphere.rotation + (index === 0 ? -8 : 10)}deg` }],
                },
              ]}
            />
          ))}
        </>
      ) : null}
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

export function sceneCardAtmosphere(
  scene: Pick<StoredScene, "activity" | "energy" | "genres" | "id" | "name">,
) {
  const seedText = `${scene.id}|${scene.name}|${scene.activity}`;
  const seed = Array.from(seedText).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 997, 17);
  const energy = scene.energy.trim().toLowerCase();
  const high = /high|peak|intense|energetic|maximum/u.test(energy);
  const low = /low|soft|calm|quiet|gentle/u.test(energy);
  const genres = sceneGenreSignals(scene.genres);
  const genreColors = genres.slice(0, 2).map((genre) => scenePresentation({
    name: "",
    activity: "",
    emotions: "",
    genres: genre,
    energy: "medium",
  }).accent);

  return {
    genreColors: genreColors.length > 0 ? genreColors : [scenePresentation({ ...scene, emotions: "" }).accent],
    haloLeft: `${-28 + (seed % 38)}%` as `${number}%`,
    haloOpacity: high ? 0.2 : low ? 0.09 : 0.14,
    haloScale: high ? 1.2 : low ? 0.82 : 1,
    haloTop: `${-30 + (seed % 42)}%` as `${number}%`,
    rotation: -18 + (seed % 37),
  };
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
  energyHalo: {
    position: "absolute",
    width: "86%",
    aspectRatio: 1,
    borderRadius: 999,
  },
  genreRibbon: {
    position: "absolute",
    width: "86%",
    height: "18%",
    borderRadius: 999,
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
