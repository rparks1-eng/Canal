import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SoundscapeExperience } from "../components/soundscape/SoundscapeExperience";
import { soundscapeSceneSeed } from "../components/soundscape/soundscape-view-model";
import { shareSoundscapeProjection } from "../lib/public-soundscape";
import { buildSoundscapeArchive, soundscapePeriodForDate } from "../lib/soundscape-aggregation";
import { collectSoundscapeAggregationInput } from "../lib/soundscape-collector";
import { loadCommonGroundProjection, loadCommonGroundState, loadSoundscapeArchive, refreshSoundscapeArchive, setCommonGroundApproval, setSoundscapeShareVisibility } from "../lib/soundscape-cloud";
import type { SoundscapeAggregationInput, SoundscapeCommonGroundProjection, SoundscapeCommonGroundState } from "../lib/soundscape-types";
import { readSoundscape, removeSnapshotFromSoundscape } from "../lib/soundscape";
import { writeOnboardingSceneSeed } from "../lib/onboarding-scene-seed";
import type { SoundscapeProfile } from "../lib/soundscape";
import { useAuth } from "../providers/auth-provider";
import { useHideCanalNavigation } from "../providers/navigation-visibility-provider";

export default function SoundscapeScreen() {
  useHideCanalNavigation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ peerUserId?: string }>();
  const peerUserId = typeof params.peerUserId === "string" ? params.peerUserId : null;
  const [legacy, setLegacy] = useState<SoundscapeProfile | null>(null);
  const [archive, setArchive] = useState<ReturnType<typeof buildSoundscapeArchive> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commonGround, setCommonGround] = useState<SoundscapeCommonGroundState | null>(null);
  const [commonProjection, setCommonProjection] = useState<SoundscapeCommonGroundProjection | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const soundscape = await readSoundscape();
      const period = soundscapePeriodForDate("year", new Date());
      const localInput: SoundscapeAggregationInput = {
        accountId: "local:guest",
        period,
        generatedAt: new Date().toISOString(),
        scenes: [],
        stages: [],
        discoveries: [],
        songDna: [],
        listening: [],
        feedback: [],
        snapshots: [],
      };
      const collectedInput = user?.id
        ? await collectSoundscapeAggregationInput(user.id, period)
        : localInput;
      const cloudArchive = user?.id
        ? await loadSoundscapeArchive(user.id, period).catch(() => null)
        : null;
      const built = cloudArchive ?? buildSoundscapeArchive(collectedInput);
      if (user?.id && peerUserId) {
        const state = await loadCommonGroundState(user.id, peerUserId);
        setCommonGround(state);
        setCommonProjection(state.status === "approved" ? await loadCommonGroundProjection(user.id, peerUserId, period) : null);
      } else {
        setCommonGround(null);
        setCommonProjection(null);
      }
      setLegacy(soundscape);
      setArchive(built);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Canal could not load this Soundscape.");
    } finally {
      setLoading(false);
    }
  }, [peerUserId, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const featured = useMemo(() => legacy?.snapshotIds ?? [], [legacy]);

  async function createFromSignal(activity: string, mood: string) {
    if (user?.id) {
      await writeOnboardingSceneSeed(user.id, soundscapeSceneSeed(activity, mood));
    }
    router.push("/scene-studio");
  }

  async function refreshArchive() {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const period = soundscapePeriodForDate("year", new Date());
      const input = await collectSoundscapeAggregationInput(user.id, period);
      setArchive(await refreshSoundscapeArchive(user.id, input));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Canal could not refresh this Soundscape.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading || !archive || !legacy) return <SafeAreaView style={styles.loading}><ActivityIndicator color="#ffd7ad" /><Text style={styles.loadingText}>Building your Soundscape…</Text></SafeAreaView>;

  return <SoundscapeExperience
    archive={archive}
    displayName={legacy.displayName}
    username={legacy.username}
    featuredSnapshotIds={featured}
    error={error}
    refreshing={refreshing}
    commonGround={commonGround}
    commonProjection={commonProjection}
    onBack={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")}
    onRetry={() => void load()}
    onCreateScene={(activity, mood) => void createFromSignal(activity, mood)}
    onRefresh={() => void refreshArchive()}
    onOpenScene={(sceneId) => router.push({ pathname: "/scenes/[sceneId]", params: { sceneId } })}
    onOpenStage={(stageId) => router.push({ pathname: "/live-stage/[stageId]", params: { stageId } })}
    onOpenSnapshot={(snapshotId) => router.push({ pathname: "/snapshots/[snapshotId]", params: { snapshotId } })}
    onRemoveSnapshot={async (snapshotId) => { await removeSnapshotFromSoundscape(snapshotId); await load(); }}
    onApproveCommonGround={peerUserId && user?.id ? async (approved) => { await setCommonGroundApproval(user.id, peerUserId, approved); await load(); } : undefined}
    onSetVisibility={user?.id && archive.archiveId ? async (visibility) => { await setSoundscapeShareVisibility(user.id, archive.archiveId as string, visibility); await load(); } : undefined}
    onShare={async () => {
      if (!user?.id || archive.visibility === "private" || !archive.archiveId) throw new Error("Make this cloud Soundscape shareable before creating its public link.");
      await shareSoundscapeProjection({ ownerId: user.id, displayName: legacy.displayName, period: archive.period });
    }}
  />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#101a26" },
  loadingText: { color: "#f7f2ea", fontSize: 15 },
});
