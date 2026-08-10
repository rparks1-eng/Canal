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
  highlightedExploreCategoryScenes,
  isExploreCategoryKind,
  popularExploreCategoryScenes,
} from "../../lib/explore-categories";
import { readLiveStages } from "../../lib/live-stages";
import type { LiveStage } from "../../lib/live-stages";
import { loadExploreScenes } from "../../lib/social";
import type { PublicCanalScene } from "../../lib/social";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

function CategorySceneCard({ item, showPlays = false }: { item: PublicCanalScene; showPlays?: boolean }) {
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
        <Text style={[styles.sceneCount, { color: presentation.accent }]}>
          {showPlays ? `${item.scene.playCount ?? 0} plays` : `${item.scene.tracks.length} tracks`}
        </Text>
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

function CategoryStageCard({ stage }: { stage: LiveStage }) {
  return (
    <Pressable
      accessibilityLabel={`Open ${stage.name} live Stage`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/live-stage/[stageId]", params: { stageId: stage.id } })}
      style={({ pressed }) => [styles.stageCard, pressed && styles.pressed]}
    >
      <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
      <View style={styles.stageCopy}>
        <Text numberOfLines={1} style={styles.stageName}>{stage.name}</Text>
        <Text numberOfLines={1} style={styles.stageMeta}>{stage.hostName} · {stage.listenerCount} listening</Text>
      </View>
      <Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

export default function ExploreCategoryScreen() {
  const params = useLocalSearchParams<{ kind?: string; value?: string }>();
  const kind = isExploreCategoryKind(params.kind) ? params.kind : null;
  const value = typeof params.value === "string" ? params.value.trim() : "";
  const [query, setQuery] = useState("");
  const [scenes, setScenes] = useState<PublicCanalScene[]>([]);
  const [stages, setStages] = useState<LiveStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const goBack = useCallback(() => {
    router.navigate({
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
      const [nextScenes, nextStages] = await Promise.all([
        loadExploreScenes({ force: refresh }),
        readLiveStages(),
      ]);
      setScenes(nextScenes);
      setStages(nextStages);
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
    () => kind ? filterExploreCategoryScenes(scenes, { kind, value, query }) : [],
    [kind, query, scenes, value],
  );
  const highlighted = useMemo(() => highlightedExploreCategoryScenes(results), [results]);
  const popularScenes = useMemo(() => popularExploreCategoryScenes(results), [results]);
  const popularStages = useMemo(() => {
    if (!kind) return [];
    const category = value.toLowerCase();
    return stages
      .filter((stage) => {
        if (stage.visibility !== "public" || stage.status !== "live") return false;
        const matches = kind === "activity"
          ? stage.activity.toLowerCase() === category
          : (stage.atmosphereSignals ?? []).some((signal) => signal.toLowerCase() === category);
        const matchesQuery = !query.trim() || [
          stage.name,
          stage.hostName,
          stage.hostUsername,
          stage.activity,
          ...(stage.atmosphereSignals ?? []),
        ].join(" ").toLowerCase().includes(query.trim().toLowerCase());
        return matches && matchesQuery && stage.listenerCount > 0;
      })
      .sort((left, right) => right.listenerCount - left.listenerCount)
      .slice(0, 4);
  }, [kind, query, stages, value]);

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
            <Text style={styles.emptyText}>Try another search or return to Explore for a different category.</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeading}><VerifiedAccountBadge size={17} /><Text style={styles.sectionTitle}>Highlighted Scenes</Text></View>
              <Text style={styles.sectionSubtitle}>Selected from verified creators in this category.</Text>
              {highlighted.length > 0 ? (
                <View style={styles.results}>{highlighted.map((item) => <CategorySceneCard item={item} key={`highlight:${item.ownerId}:${item.sceneId}`} />)}</View>
              ) : (
                <View style={styles.sectionEmpty}><Text style={styles.sectionEmptyText}>No verified Scenes are featured here yet.</Text></View>
              )}
            </View>
            <View style={styles.section}>
              <View style={styles.sectionHeading}><Ionicons color={accent} name="trending-up-outline" size={19} /><Text style={styles.sectionTitle}>Popular Now</Text></View>
              <Text style={styles.sectionSubtitle}>The most-played Scenes and most-listened-to live Stages here.</Text>
              {popularScenes.length > 0 || popularStages.length > 0 ? (
                <View style={styles.results}>
                  {popularScenes.map((item) => <CategorySceneCard item={item} key={`popular:${item.ownerId}:${item.sceneId}`} showPlays />)}
                  {popularStages.map((stage) => <CategoryStageCard key={`stage:${stage.id}`} stage={stage} />)}
                </View>
              ) : (
                <View style={styles.sectionEmpty}><Text style={styles.sectionEmptyText}>Popularity appears after matching Scenes or Stages have listening activity.</Text></View>
              )}
            </View>
            <View style={styles.section}>
              <View style={styles.sectionHeading}><Ionicons color={accent} name="albums-outline" size={19} /><Text style={styles.sectionTitle}>All Scenes</Text></View>
              <Text style={styles.sectionSubtitle}>Every public Scene in this category.</Text>
              <View style={styles.results}>
                {results.map((item, index) => (
                  <Animated.View entering={FadeInUp.duration(260).delay(Math.min(index, 8) * 35)} key={`${item.ownerId}:${item.sceneId}`}>
                    <CategorySceneCard item={item} />
                  </Animated.View>
                ))}
              </View>
            </View>
          </>
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
  searchInput: { minHeight: 50, color: canalDynamicColors.text, backgroundColor: canalDynamicColors.elevated, borderRadius: 17, borderCurve: "continuous", paddingHorizontal: 16, fontSize: 14 },
  section: { gap: 9, marginTop: 4 },
  sectionHeading: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: canalDynamicColors.text, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: canalDynamicColors.muted, fontSize: 11, lineHeight: 16 },
  sectionEmpty: { minHeight: 58, justifyContent: "center", borderRadius: 17, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface, paddingHorizontal: 15 },
  sectionEmptyText: { color: canalDynamicColors.muted, fontSize: 11, lineHeight: 16 },
  results: { gap: 10 },
  sceneCard: { minHeight: 132, overflow: "hidden", gap: 10, borderRadius: 23, borderCurve: "continuous", borderWidth: 1, padding: 16, boxShadow: "0 12px 30px rgba(2, 28, 47, 0.16)" },
  sceneHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sceneName: { flex: 1, color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 22, fontWeight: "500" },
  sceneCount: { fontSize: 10, fontWeight: "900" },
  sceneMeta: { color: canalDynamicColors.muted, fontSize: 11 },
  creatorRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 },
  creatorName: { flex: 1, color: canalDynamicColors.text, fontSize: 12, fontWeight: "800" },
  stageCard: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: canalDynamicColors.line, backgroundColor: canalDynamicColors.surface, paddingHorizontal: 14 },
  livePill: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 14, backgroundColor: canalDynamicColors.dangerSurface, paddingHorizontal: 9 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: canalDynamicColors.danger },
  liveText: { color: canalDynamicColors.danger, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  stageCopy: { flex: 1, minWidth: 0 },
  stageName: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "900" },
  stageMeta: { color: canalDynamicColors.muted, fontSize: 10, marginTop: 3 },
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
