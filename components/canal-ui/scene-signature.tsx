import {
  StyleSheet,
  View,
} from "react-native";

import type {
  StyleProp,
  ViewStyle,
} from "react-native";

import type {
  StoredScene,
} from "../../lib/scenes";

import {
  classifyLivingCover,
  getLivingCoverRecipe,
  type LivingCoverKey,
  type LivingCoverTemplateId,
} from "../../lib/living-covers";

import type {
  CanalAtmosphereOverride,
} from "../../theme/canal-atmosphere-context";

export type SceneSignatureKind =
  | "arc"
  | "constellation"
  | "drift"
  | "horizon"
  | "phase"
  | "tidal";

export type ScenePresentation = Readonly<{
  kind: SceneSignatureKind;
  colors: readonly [string, string, string];
  accent: string;
  accentText: string;
  navigation: string;
  templateId: LivingCoverTemplateId;
  templateKey: LivingCoverKey;
}>;

type ScenePaletteInput = Pick<StoredScene, "activity" | "emotions" | "energy" | "name"> & Partial<Pick<StoredScene, "createdAt">>;

const PRESENTATION_BY_KEY: Readonly<Record<LivingCoverKey, Readonly<{
  kind: SceneSignatureKind;
  accent: string;
  accentText: string;
  navigation: string;
}>>> = {
  solar: { kind: "horizon", accent: "#FFC4D1", accentText: "#592C3B", navigation: "rgba(100, 42, 62, 0.90)" },
  ember: { kind: "tidal", accent: "#FFC2B8", accentText: "#5B291F", navigation: "rgba(91, 28, 52, 0.90)" },
  verdant: { kind: "drift", accent: "#C9FFF0", accentText: "#16483E", navigation: "rgba(17, 61, 75, 0.90)" },
  tide: { kind: "tidal", accent: "#D2FFF7", accentText: "#1F5261", navigation: "rgba(35, 83, 125, 0.90)" },
  cobalt: { kind: "constellation", accent: "#D6DCFF", accentText: "#293568", navigation: "rgba(22, 31, 75, 0.92)" },
  violet: { kind: "arc", accent: "#F1D1FF", accentText: "#4C2867", navigation: "rgba(66, 35, 101, 0.90)" },
  rose: { kind: "phase", accent: "#FFD3E3", accentText: "#5C2948", navigation: "rgba(83, 34, 76, 0.90)" },
  copper: { kind: "horizon", accent: "#FFE0AE", accentText: "#594122", navigation: "rgba(73, 64, 47, 0.90)" },
  silver: { kind: "arc", accent: "#F5F0E7", accentText: "#3F5965", navigation: "rgba(74, 101, 116, 0.88)" },
  midnight: { kind: "constellation", accent: "#BFFCF1", accentText: "#173F51", navigation: "rgba(18, 23, 64, 0.94)" },
};

function canonicalActivity(value?: string): string | null {
  if (!value) return null;
  const activity = value.trim().toLowerCase();
  if (activity === "commute" || activity === "driving") return "drive";
  return ["focus", "workout", "unwind", "social", "party", "celebrate", "create", "cook", "morning"].includes(activity) ? activity : null;
}

function canonicalMood(value: string | undefined): string | null {
  const signals = (value ?? "").toLowerCase().split(/[,/|]+/u).map((signal) => signal.trim());
  const aliases: readonly [readonly string[], string][] = [
    [["happy", "euphoric", "playful"], "happy"],
    [["energized", "energetic", "restless"], "energetic"],
    [["steady", "grounded"], "steady"],
    [["calm"], "calm"],
    [["reflective", "nostalgic", "moody"], "reflective"],
    [["dreamy", "adventurous"], "dreamy"],
    [["romantic", "intimate"], "romantic"],
    [["cozy", "warm"], "cozy"],
    [["clear"], "clear"],
    [["intense", "confident"], "intense"],
  ];
  return aliases.find(([values]) => values.some((candidate) => signals.includes(candidate)))?.[1] ?? null;
}

function numericEnergy(value: string | undefined): number | null {
  const energy = (value ?? "").trim().toLowerCase();
  if (energy === "low") return 15;
  if (energy === "medium") return 50;
  if (energy === "high") return 90;
  return null;
}

export function scenePresentation(
  scene: ScenePaletteInput,
): ScenePresentation {
  const classification = classifyLivingCover({
    activity: canonicalActivity(scene.activity),
    mood: canonicalMood(scene.emotions),
    energy: numericEnergy(scene.energy),
    capturedAt: scene.createdAt,
  });
  const recipe = getLivingCoverRecipe(classification.templateId);
  const presentation = PRESENTATION_BY_KEY[recipe.key];
  return {
    ...presentation,
    colors: recipe.gradient,
    templateId: recipe.templateId,
    templateKey: recipe.key,
  };
}

export function sceneAtmosphere(
  scene: ScenePaletteInput,
): CanalAtmosphereOverride {
  const presentation = scenePresentation(scene);
  return {
    base: presentation.colors[2],
    glowOne: `${presentation.colors[0]}CC`,
    glowTwo: `${presentation.colors[1]}B8`,
    glowThree: `${presentation.accent}52`,
    navigation: presentation.navigation,
    accent: presentation.accent,
    accentText: presentation.accentText,
    selected: presentation.accent,
    border: `${presentation.accent}57`,
    shadow: `0 15px 42px ${presentation.colors[2]}99`,
  };
}

export function stageAtmosphere(stage: Readonly<{
  name: string;
  activity: string;
  atmosphereSignals?: readonly string[];
}>): CanalAtmosphereOverride {
  return sceneAtmosphere({
    name: stage.name,
    activity: stage.activity,
    emotions: (stage.atmosphereSignals ?? []).join(", "),
    energy: (stage.atmosphereSignals ?? []).join(" "),
  });
}

export function SceneSignature(props: Readonly<{
  kind: SceneSignatureKind;
  color?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const color = props.color ?? "rgba(255,255,255,0.82)";
  const lines = props.kind === "constellation" ? 2 : 3;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.signature, props.style]}
    >
      {props.kind === "constellation" ? (
        <>
          <View style={[styles.starLine, styles.starLineOne, { borderColor: color }]} />
          <View style={[styles.starLine, styles.starLineTwo, { borderColor: color }]} />
          {[styles.starOne, styles.starTwo, styles.starThree, styles.starFour].map((starStyle, index) => (
            <View key={index} style={[styles.star, starStyle, { backgroundColor: color }]} />
          ))}
        </>
      ) : Array.from({ length: lines }, (_, index) => (
        <View
          key={index}
          style={[
            styles.line,
            props.kind === "drift" && styles.driftLine,
            props.kind === "horizon" && styles.horizonLine,
            props.kind === "tidal" && styles.tidalLine,
            props.kind === "phase" && styles.phaseLine,
            props.kind === "arc" && styles.arcLine,
            index === 0 && styles.lineOne,
            index === 1 && styles.lineTwo,
            index === 2 && styles.lineThree,
            { borderColor: color },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  signature: { position: "relative", width: "100%", height: "100%", overflow: "hidden" },
  line: { position: "absolute", left: "8%", width: "84%", height: "54%", borderTopWidth: 1.5, borderRadius: 999 },
  lineOne: { top: "16%", opacity: 0.88 },
  lineTwo: { top: "34%", opacity: 0.56 },
  lineThree: { top: "52%", opacity: 0.3 },
  driftLine: { transform: [{ rotate: "-4deg" }, { skewX: "-18deg" }] },
  horizonLine: { width: "96%", left: "2%", transform: [{ rotate: "-10deg" }] },
  tidalLine: { height: "76%", transform: [{ rotate: "8deg" }] },
  phaseLine: { width: "70%", left: "15%", transform: [{ skewX: "28deg" }] },
  arcLine: { height: "90%", top: "32%", transform: [{ rotate: "-4deg" }] },
  starLine: { position: "absolute", height: 1, borderTopWidth: 1, opacity: 0.45 },
  starLineOne: { width: "60%", left: "18%", top: "45%", transform: [{ rotate: "18deg" }] },
  starLineTwo: { width: "46%", left: "33%", top: "49%", transform: [{ rotate: "-31deg" }] },
  star: { position: "absolute", width: 5, height: 5, borderRadius: 3 },
  starOne: { left: "17%", top: "55%" },
  starTwo: { left: "39%", top: "25%" },
  starThree: { left: "64%", top: "51%" },
  starFour: { right: "14%", top: "19%" },
});
