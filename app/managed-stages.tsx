import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { SceneCardBackdrop } from "../components/canal-ui/scene-card-visual";
import { stagePresentation } from "../components/canal-ui/scene-signature";
import { ProfileAvatar } from "../components/profile-avatar";
import {
  deleteLiveStage,
  endLiveStage,
  formatLiveStageElapsed,
  getCurrentLiveStageTrack,
  readHostedLiveStages,
  restartLiveStage,
} from "../lib/live-stages";
import type { LiveStage } from "../lib/live-stages";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

type StageFilter = "active" | "past";

export default function ManagedStagesScreen(): React.JSX.Element {
  const [stages, setStages] = useState<LiveStage[]>([]);
  const [filter, setFilter] = useState<StageFilter>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setStages(await readHostedLiveStages());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Canal could not load your Stages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const counts = useMemo(() => ({
    active: stages.filter((stage) => stage.status === "live").length,
    past: stages.filter((stage) => stage.status !== "live").length,
  }), [stages]);

  const visibleStages = useMemo(() => stages
    .filter((stage) => filter === "active" ? stage.status === "live" : stage.status !== "live")
    .sort((left, right) => new Date(right.startedAt ?? right.createdAt).getTime() - new Date(left.startedAt ?? left.createdAt).getTime()), [filter, stages]);

  const mutate = async (stage: LiveStage, action: "end" | "restart" | "delete"): Promise<void> => {
    if (busyId) return;
    setBusyId(stage.id);
    setError("");
    try {
      if (action === "delete") {
        await deleteLiveStage(stage.id);
        setStages((current) => current.filter((item) => item.id !== stage.id));
      } else {
        const next = action === "end" ? await endLiveStage(stage) : await restartLiveStage(stage);
        if (next) setStages((current) => current.map((item) => item.id === next.id ? next : item));
      }
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Canal could not update this Stage.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "My Stages", headerBackTitle: "Profile" }} />
      <CanalAmbientBackground />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={canalDynamicColors.mint} />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Back to Profile"
          accessibilityRole="button"
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
          <Text style={styles.backText}>Profile</Text>
        </Pressable>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>YOUR LIVE ROOMS</Text>
          <Text style={styles.title}>My Stages</Text>
          <Text style={styles.subtitle}>Manage what is live now, then revisit, restart, or remove the rooms you hosted before.</Text>
        </View>

        <View accessibilityLabel="Filter My Stages" accessibilityRole="tablist" style={styles.filterBar}>
          {(["active", "past"] as const).map((value) => {
            const selected = filter === value;
            return (
              <Pressable
                accessibilityLabel={`${value === "active" ? "Active" : "Past"} Stages, ${counts[value]}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={value}
                onPress={() => setFilter(value)}
                style={({ pressed }) => [styles.filterButton, selected && styles.filterButtonSelected, pressed && styles.pressed]}
              >
                <View style={styles.filterLabelRow}>
                  {value === "active" ? <View style={styles.activeDot} /> : null}
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{value === "active" ? "Active" : "Past"}</Text>
                </View>
                <Text style={[styles.filterCount, selected && styles.filterTextSelected]}>{counts[value]}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.errorCard}>
            <Text selectable style={styles.errorText}>{error}</Text>
            <Pressable accessibilityLabel="Retry loading My Stages" accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
              <Ionicons color={canalDynamicColors.text} name="refresh-outline" size={19} />
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={canalDynamicColors.mint} /><Text style={styles.loadingText}>Loading your Stages…</Text></View>
        ) : visibleStages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons color={canalDynamicColors.muted} name={filter === "active" ? "radio-outline" : "time-outline"} size={28} />
            <Text style={styles.emptyTitle}>{filter === "active" ? "Nothing live right now" : "No past Stages yet"}</Text>
            <Text style={styles.emptyText}>{filter === "active" ? "Start a Stage from one of your Scenes or create a new live room." : "Ended Stages you keep will appear here."}</Text>
            {filter === "active" ? (
              <Pressable accessibilityLabel="Create a Stage" accessibilityRole="button" onPress={() => router.push("/create-stage")} style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
                <Text style={styles.emptyActionText}>Create a Stage</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.stageList}>
            {visibleStages.map((stage) => (
              <ManagedStageCard busy={busyId === stage.id} key={stage.id} onMutate={mutate} stage={stage} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ManagedStageCard(props: { stage: LiveStage; busy: boolean; onMutate: (stage: LiveStage, action: "end" | "restart" | "delete") => Promise<void> }): React.JSX.Element {
  const { stage } = props;
  const live = stage.status === "live";
  const track = getCurrentLiveStageTrack(stage);
  const presentation = stagePresentation(stage);

  return (
    <View style={[styles.card, { borderColor: `${presentation.accent}4D` }]}>
      <SceneCardBackdrop presentation={presentation} />
      <Pressable
        accessibilityLabel={`Manage ${stage.name}`}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: "/live-stage/[stageId]", params: { stageId: stage.id } })}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.statusBadge, !live && styles.pastBadge]}>
            {live ? <View style={styles.liveDot} /> : null}
            <Text style={styles.statusText}>{live ? "LIVE" : "ENDED"}</Text>
          </View>
          <Text style={[styles.stageVisibility, { color: presentation.accent }]}>{stage.visibility === "public" ? "PUBLIC" : "PRIVATE"}</Text>
          <Text style={styles.elapsed}>{live ? "Active" : "Ran"} {formatLiveStageElapsed(stage)}</Text>
        </View>

        <Text numberOfLines={2} style={styles.stageName}>{stage.name}</Text>
        <View style={styles.hostRow}>
          <ProfileAvatar avatarUrl={stage.hostAvatarUrl} displayName={stage.hostName} size={30} />
          <Text numberOfLines={1} style={styles.stageMeta}>@{stage.hostUsername} · {stage.activity || "Live music"} · {stage.participantCount} member{stage.participantCount === 1 ? "" : "s"}</Text>
        </View>

        <View style={styles.nowPlaying}>
          {track?.imageUrl ? <Image accessibilityLabel={`${track.title} album artwork`} contentFit="cover" source={track.imageUrl} style={styles.artwork} transition={160} /> : <View style={styles.artworkFallback} />}
          <View style={styles.trackCopy}>
            <Text style={styles.trackKicker}>{live ? "NOW PLAYING" : "LAST QUEUE"}</Text>
            <Text numberOfLines={1} style={styles.trackTitle}>{track?.title ?? `${stage.tracks.length} tracks saved`}</Text>
            <Text numberOfLines={1} style={styles.trackArtist}>{track?.artist ?? "Open Stage details"}</Text>
          </View>
          <Ionicons color={canalDynamicColors.text} name="chevron-forward" size={20} />
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={live ? `End ${stage.name}` : `Restart ${stage.name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: props.busy, busy: props.busy }}
          disabled={props.busy}
          onPress={() => live
            ? Alert.alert("End Stage?", "You can restart it later.", [{ text: "Cancel", style: "cancel" }, { text: "End Stage", style: "destructive", onPress: () => void props.onMutate(stage, "end") }])
            : void props.onMutate(stage, "restart")}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Ionicons color={canalDynamicColors.mint} name={live ? "stop-circle-outline" : "refresh-outline"} size={20} />
          <Text style={styles.actionText}>{live ? "End Stage" : "Restart"}</Text>
        </Pressable>
        {!live ? (
          <Pressable
            accessibilityLabel={`Delete ${stage.name}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: props.busy, busy: props.busy }}
            disabled={props.busy}
            onPress={() => Alert.alert("Delete this Stage?", "This permanently removes its chat, collaborators, and queue.", [{ text: "Cancel", style: "cancel" }, { text: "Delete Stage", style: "destructive", onPress: () => void props.onMutate(stage, "delete") }])}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Ionicons color={canalDynamicColors.danger} name="trash-outline" size={19} />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { flexGrow: 1, gap: 18, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 130 },
  backButton: { minHeight: 48, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, paddingRight: 12 },
  backText: { color: canalDynamicColors.text, fontSize: 13, fontWeight: "800" },
  hero: { gap: 5 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "500", letterSpacing: -1 },
  subtitle: { maxWidth: 345, color: canalDynamicColors.muted, fontSize: 14, lineHeight: 20 },
  filterBar: { minHeight: 58, flexDirection: "row", gap: 5, padding: 5, borderRadius: 20, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface },
  filterButton: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15, borderRadius: 15, borderCurve: "continuous" },
  filterButtonSelected: { backgroundColor: canalDynamicColors.elevated },
  filterLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: canalDynamicColors.mint },
  filterText: { color: canalDynamicColors.muted, fontSize: 13, fontWeight: "800" },
  filterTextSelected: { color: canalDynamicColors.text },
  filterCount: { color: canalDynamicColors.muted, fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  errorCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 17, backgroundColor: canalDynamicColors.warningSurface },
  errorText: { flex: 1, color: canalDynamicColors.text, fontSize: 12, lineHeight: 17 },
  retryButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: canalDynamicColors.muted, fontSize: 13 },
  emptyCard: { minHeight: 210, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, borderRadius: 25, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface },
  emptyTitle: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 22 },
  emptyText: { maxWidth: 275, color: canalDynamicColors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  emptyAction: { minHeight: 48, justifyContent: "center", paddingHorizontal: 18 },
  emptyActionText: { color: canalDynamicColors.mint, fontSize: 13, fontWeight: "900" },
  stageList: { gap: 14 },
  card: { overflow: "hidden", borderWidth: 1, borderRadius: 27, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface, boxShadow: "0 18px 42px rgba(35, 15, 55, 0.18)" },
  cardBody: { padding: 18 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderRadius: 14, backgroundColor: "rgba(102, 22, 47, 0.64)" },
  pastBadge: { backgroundColor: canalDynamicColors.elevated },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF8A83" },
  statusText: { color: canalDynamicColors.text, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  stageVisibility: { fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  elapsed: { flex: 1, color: canalDynamicColors.muted, fontSize: 9, textAlign: "right" },
  stageName: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 29, fontWeight: "500", letterSpacing: -0.6, marginTop: 17 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 },
  stageMeta: { flex: 1, color: canalDynamicColors.muted, fontSize: 11 },
  nowPlaying: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, padding: 10, marginTop: 17, borderWidth: 1, borderColor: canalDynamicColors.line, borderRadius: 18, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface },
  artwork: { width: 55, height: 55, borderRadius: 13, borderCurve: "continuous" },
  artworkFallback: { width: 55, height: 55, borderRadius: 13, backgroundColor: canalDynamicColors.elevated },
  trackCopy: { flex: 1, minWidth: 0 },
  trackKicker: { color: canalDynamicColors.mint, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  trackTitle: { color: canalDynamicColors.text, fontSize: 13, fontWeight: "800", marginTop: 4 },
  trackArtist: { color: canalDynamicColors.muted, fontSize: 10, marginTop: 2 },
  actions: { minHeight: 54, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: canalDynamicColors.line },
  actionButton: { flex: 1, minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { color: canalDynamicColors.mint, fontSize: 12, fontWeight: "900" },
  deleteText: { color: canalDynamicColors.danger, fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
