import { useCallback, useMemo, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";

import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";
import { SceneCardBackdrop } from "../../components/canal-ui/scene-card-visual";
import { scenePresentation } from "../../components/canal-ui/scene-signature";
import { ProfileAvatar } from "../../components/profile-avatar";
import { VerifiedAccountBadge } from "../../components/verified-account-badge";
import {
  exploreCategoryIcon,
  filterExploreCategoryScenes,
  isExploreCategoryKind,
} from "../../lib/explore-categories";
import type { ExploreCategoryScope } from "../../lib/explore-categories";
import { loadExploreScenes } from "../../lib/social";
import type { PublicCanalScene } from "../../lib/social";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

function CategorySceneCard({ item }: { item: PublicCanalScene }) {
  const presentation = scenePresentation(item.scene);
  return (
    <Pressable
      accessibilityLabel={`Open ${item.scene.name}`}
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: "/public-scene",
        params: { ownerId: item.ownerId, sceneId: item.sceneId },
      })}
      style={({ pressed }) => [
        styles.sceneCard,
        { borderColor: `${presentation.accent}55`, backgroundColor: presentation.colors[2] },
        pressed && styles.pressed,
      ]}
    >
      <SceneCardBackdrop presentation={presentation} />
      <View style={styles.sceneHeader}>
        <Text numberOfLines={1} style={styles.sceneName}>{item.scene.name}</Text>
        <Text style={[styles.sceneCount, { color: presentation.accent }]}>{item.scene.tracks.length} tracks</Text>
      </View>
      <Text numberOfLines={1} style={styles.sceneMeta}>
        {item.scene.activity || "Any activity"} · {item.scene.emotions || "Open mood"}
      </Text>
      <View style={styles.creatorRow}>
        <ProfileAvatar avatarUrl={item.creator.avatarUrl} displayName={item.creator.displayName} size={32} />
        <Text numberOfLines={1} style={styles.creatorName}>{item.creator.displayName}</Text>
        {item.creator.isVerified || item.creator.isCanal ? <VerifiedAccountBadge size={15} /> : null}
        <Ionicons color={presentation.accent} name="chevron-forward" size={18} />
      </View>
    </Pressable>
  );
}

export default function ExploreCategoryScreen() {
  const params = useLocalSearchParams<{ kind?: string; value?: string; scope?: string }>();
  const kind = isExploreCategoryKind(params.kind) ? params.kind : null;
  const value = typeof params.value === "string" ? params.value.trim() : "";
  const initialScope: ExploreCategoryScope = params.scope === "verified" ? "verified" : "public";
  const [scope, setScope] = useState<ExploreCategoryScope>(initialScope);
  const [query, setQuery] = useState("");
  const [scenes, setScenes] = useState<PublicCanalScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const goBack = useCallback(() => {
    router.replace({
      pathname: "/(tabs)/explore",
      params: { content: "scenes" },
    });
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (!kind || !value) {
      router.replace("/(tabs)/explore");
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage("");
    try {
      setScenes(await loadExploreScenes({ force: refresh }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Canal could not load this category.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind, value]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const results = useMemo(
    () => kind ? filterExploreCategoryScenes(scenes, { kind, value, scope, query }) : [],
    [kind, query, scenes, scope, value],
  );

  if (!kind || !value) return null;
  const accent = kind === "activity" ? "#7FE3CF" : kind === "mood" ? "#FFB7C4" : "#FFD37D";
  const icon = exploreCategoryIcon(kind, value);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <CanalAmbientBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(240)} style={styles.header}>
          <Pressable accessibilityLabel="Back to Explore" accessibilityRole="button" onPress={goBack} style={styles.backButton}>
            <Ionicons color={canalDynamicColors.text} name="chevron-back" size={22} />
          </Pressable>
          <View style={[styles.heroIcon, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
            <View style={[styles.heroOrb, { backgroundColor: `${accent}55` }]} />
            <Ionicons color={accent} name={icon as never} size={34} />
          </View>
          <Text style={styles.eyebrow}>{kind.toUpperCase()} SCENES</Text>
          <Text style={styles.title}>{value}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
            {results.length} public {results.length === 1 ? "Scene" : "Scenes"} in this category
          </Text>
        </Animated.View>

        <View accessibilityRole="radiogroup" style={styles.scopeSwitch}>
          {(["public", "verified"] as ExploreCategoryScope[]).map((option) => (
            <Pressable
              key={option}
              accessibilityLabel={option === "public" ? "Show all public Scenes" : "Show verified Scenes"}
              accessibilityRole="radio"
              accessibilityState={{ checked: scope === option }}
              onPress={() => {
                setScope(option);
                router.setParams({ scope: option });
              }}
              style={[styles.scopeButton, scope === option && { backgroundColor: `${accent}2B`, borderColor: `${accent}77` }]}
            >
              {option === "verified" ? <VerifiedAccountBadge size={15} /> : <Ionicons color={accent} name="globe-outline" size={17} />}
              <Text style={styles.scopeText}>{option === "public" ? "All public" : "Verified"}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          accessibilityLabel={`Search ${value} Scenes`}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={`Search ${value} Scenes`}
          placeholderTextColor={canalDynamicColors.muted}
          style={styles.searchInput}
          value={query}
        />

        {errorMessage ? (
          <View accessibilityRole="alert" style={styles.notice}>
            <Text style={styles.noticeText}>{errorMessage}</Text>
            <Pressable accessibilityLabel="Retry category" accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <View style={styles.loading}><ActivityIndicator color={accent} size="large" /></View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matching Scenes</Text>
            <Text style={styles.emptyText}>Try All public, another search, or return to Explore for a different category.</Text>
          </View>
        ) : (
          <View style={styles.results}>
            {results.map((item, index) => (
              <Animated.View entering={FadeInUp.duration(260).delay(Math.min(index, 8) * 35)} key={`${item.ownerId}:${item.sceneId}`}>
                <CategorySceneCard item={item} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  content: { gap: 15, paddingHorizontal: 20, paddingBottom: 150 },
  header: { alignItems: "flex-start", paddingTop: 6 },
  backButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", marginLeft: -12 },
  heroIcon: { width: 78, height: 78, overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: 25, borderCurve: "continuous", borderWidth: 1, marginTop: 5 },
  heroOrb: { position: "absolute", width: 56, height: 56, right: -19, bottom: -21, borderRadius: 40 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.7, marginTop: 14 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "500", letterSpacing: -0.8, marginTop: 3, textTransform: "capitalize" },
  subtitle: { color: canalDynamicColors.muted, fontSize: 13, marginTop: 5 },
  scopeSwitch: { flexDirection: "row", gap: 8 },
  scopeButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 17, borderCurve: "continuous", borderWidth: 1, borderColor: canalDynamicColors.line, backgroundColor: canalDynamicColors.surface },
  scopeText: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "900" },
  searchInput: { minHeight: 50, color: canalDynamicColors.text, backgroundColor: canalDynamicColors.elevated, borderRadius: 17, borderCurve: "continuous", paddingHorizontal: 16, fontSize: 14 },
  results: { gap: 10 },
  sceneCard: { minHeight: 132, overflow: "hidden", gap: 10, borderRadius: 23, borderCurve: "continuous", borderWidth: 1, padding: 16, boxShadow: "0 12px 30px rgba(2, 28, 47, 0.16)" },
  sceneHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sceneName: { flex: 1, color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 22, fontWeight: "500" },
  sceneCount: { fontSize: 10, fontWeight: "900" },
  sceneMeta: { color: canalDynamicColors.muted, fontSize: 11 },
  creatorRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 },
  creatorName: { flex: 1, color: canalDynamicColors.text, fontSize: 12, fontWeight: "800" },
  notice: { gap: 12, borderRadius: 18, padding: 16, backgroundColor: canalDynamicColors.warningSurface },
  noticeText: { color: canalDynamicColors.text, fontSize: 13 },
  retryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: canalDynamicColors.surface },
  retryText: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "900" },
  loading: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  empty: { gap: 8, borderRadius: 20, padding: 20, backgroundColor: canalDynamicColors.surface },
  emptyTitle: { color: canalDynamicColors.text, fontSize: 18, fontWeight: "900" },
  emptyText: { color: canalDynamicColors.muted, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
