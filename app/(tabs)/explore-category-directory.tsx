import { useMemo, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";
import { scenePresentation } from "../../components/canal-ui/scene-signature";
import { exploreCategoryIcon, isExploreCategoryKind } from "../../lib/explore-categories";
import { SCENE_ACTIVITY_OPTIONS, SCENE_GENRE_OPTIONS, SCENE_MOOD_OPTIONS } from "../../lib/scene-studio";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

type DirectoryItem = { value: string; label: string; description: string };

function directoryItems(kind: "activity" | "mood" | "genre"): DirectoryItem[] {
  if (kind === "activity") {
    return SCENE_ACTIVITY_OPTIONS.map((item) => ({ value: item.value, label: item.label, description: item.description }));
  }
  if (kind === "mood") {
    return SCENE_MOOD_OPTIONS.map((item) => ({ value: item.value, label: item.label, description: `Browse ${item.label.toLowerCase()} public Scenes.` }));
  }
  return SCENE_GENRE_OPTIONS.map((genre) => ({ value: genre, label: genre, description: `Browse public ${genre} Scenes.` }));
}

export default function ExploreCategoryDirectoryScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = isExploreCategoryKind(params.kind) ? params.kind : null;
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    if (!kind) return [];
    const needle = query.trim().toLowerCase();
    return directoryItems(kind).filter((item) => !needle || `${item.label} ${item.description}`.toLowerCase().includes(needle));
  }, [kind, query]);

  if (!kind) {
    router.replace({ pathname: "/(tabs)/explore", params: { content: "scenes" } });
    return null;
  }

  const heading = kind === "activity" ? "Activities" : kind === "mood" ? "Moods" : "Genres";
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <CanalAmbientBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Explore"
          accessibilityRole="button"
          onPress={() => router.navigate({ pathname: "/(tabs)/explore", params: { content: "scenes" } })}
          style={styles.backButton}
        >
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={22} />
        </Pressable>
        <Text style={styles.eyebrow}>CANAL CURATED</Text>
        <Text style={styles.title}>All {heading}</Text>
        <Text style={styles.subtitle}>Explore Canal’s complete {heading.toLowerCase()} catalog and open any category to find public Scenes.</Text>
        <TextInput
          accessibilityLabel={`Search all ${heading.toLowerCase()}`}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={`Search ${heading.toLowerCase()}`}
          placeholderTextColor={canalDynamicColors.muted}
          style={styles.search}
          value={query}
        />
        <Text accessibilityLiveRegion="polite" style={styles.count}>{items.length} curated {heading.toLowerCase()}</Text>
        <View style={styles.grid}>
          {items.map((item) => {
            const presentation = scenePresentation({
              name: "",
              activity: kind === "activity" ? item.value : "",
              emotions: kind === "mood" ? item.value : "",
              genres: kind === "genre" ? item.value : "",
              energy: "medium",
            });
            return (
              <Pressable
                key={`${kind}:${item.value}`}
                accessibilityLabel={`Open ${item.label} ${kind} Scenes`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/explore-category", params: { kind, value: item.value, label: item.label } })}
                style={({ pressed }) => [styles.card, { backgroundColor: presentation.colors[2], borderColor: `${presentation.accent}55` }, pressed && styles.pressed]}
              >
                <View style={[styles.orb, styles.orbOne, { backgroundColor: presentation.colors[0] }]} />
                <View style={[styles.orb, styles.orbTwo, { backgroundColor: presentation.colors[1] }]} />
                <Ionicons color={presentation.accent} name={exploreCategoryIcon(kind, item.value) as never} size={27} />
                <View style={styles.cardCopy}>
                  <Text numberOfLines={2} style={styles.cardTitle}>{item.label}</Text>
                  <Text numberOfLines={3} style={styles.cardText}>{item.description}</Text>
                  <Ionicons color={presentation.accent} name="arrow-forward" size={17} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 20, paddingBottom: 150 },
  backButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", marginLeft: -12 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginTop: 5 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 36, fontWeight: "500", letterSpacing: -0.8, marginTop: 5 },
  subtitle: { maxWidth: 330, color: canalDynamicColors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  search: { minHeight: 50, color: canalDynamicColors.text, backgroundColor: canalDynamicColors.elevated, borderRadius: 17, borderCurve: "continuous", paddingHorizontal: 16, fontSize: 14, marginTop: 18 },
  count: { color: canalDynamicColors.muted, fontSize: 11, marginTop: 12, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  card: { width: "48.6%", minHeight: 184, overflow: "hidden", justifyContent: "space-between", gap: 7, borderWidth: 1, borderRadius: 23, borderCurve: "continuous", padding: 13, boxShadow: "0 12px 30px rgba(2, 24, 43, 0.17)" },
  orb: { position: "absolute", borderRadius: 99 },
  orbOne: { width: 100, height: 100, right: -35, top: -42 },
  orbTwo: { width: 82, height: 82, left: -32, bottom: -31 },
  cardCopy: { gap: 6, borderRadius: 15, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface, padding: 10, marginHorizontal: -5, marginBottom: -5 },
  cardTitle: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 18, fontWeight: "600" },
  cardText: { minHeight: 42, color: canalDynamicColors.muted, fontSize: 10, lineHeight: 14 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
