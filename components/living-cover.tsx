import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { classifyLivingCover, getLivingCoverRecipe } from "../lib/living-covers";

export function LivingCover(props: Readonly<{
  activity?: string;
  capturedAt?: string;
  genres?: string;
  mood?: string;
  showCopy?: boolean;
  style?: StyleProp<ViewStyle>;
  title: string;
}>) {
  const recipe = getLivingCoverRecipe(classifyLivingCover({
    activity: props.activity,
    capturedAt: props.capturedAt,
    genres: props.genres,
    mood: props.mood,
    name: props.title,
  }).templateId);
  return (
    <View style={[styles.cover, { backgroundColor: recipe.gradient[2] }, props.style]}>
      <View style={[styles.colorField, styles.colorFieldOne, { backgroundColor: recipe.gradient[0] }]} />
      <View style={[styles.colorField, styles.colorFieldTwo, { backgroundColor: recipe.gradient[1] }]} />
      <View style={styles.lightField} />
      {props.showCopy === false ? null : (
        <View style={styles.copy}>
          {props.activity ? <Text style={styles.activity}>{props.activity}</Text> : null}
          <Text numberOfLines={2} style={styles.title}>{props.title}</Text>
          {props.mood ? <Text style={styles.mood}>{props.mood}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { flex: 1, overflow: "hidden" },
  colorField: { position: "absolute", borderRadius: 999, opacity: 0.76 },
  colorFieldOne: { width: "112%", aspectRatio: 1, top: "-52%", right: "-35%" },
  colorFieldTwo: { width: "105%", aspectRatio: 1, bottom: "-55%", left: "-33%" },
  lightField: { position: "absolute", width: "78%", aspectRatio: 1, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", top: "8%", left: "28%" },
  copy: { flex: 1, justifyContent: "flex-end", padding: 24 },
  activity: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#FFFFFF", fontSize: 30, fontWeight: "800", letterSpacing: -1, marginTop: 6 },
  mood: { color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 6 },
});
