import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { Image } from "expo-image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  readLiveStage,
  subscribeToLiveStage,
} from "../../lib/live-stages";
import type {
  LiveStage,
} from "../../lib/live-stages";
import {
  buildCollaborativeStageMix,
  readStageContributionStatuses,
} from "../../lib/stage-collaboration";
import type {
  StageContributionStatus,
} from "../../lib/stage-collaboration";
import {
  addSpotifyArtworkToLiveStage,
} from "../../lib/spotify-scene-artwork";
import {
  useAuth,
} from "../../providers/auth-provider";
import {
  useConnectivity,
} from "../../providers/connectivity-provider";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StageLobbyScreen() {
  const params = useLocalSearchParams<{ stageId?: string | string[] }>();
  const stageId = first(params.stageId);
  const { user, accountEpoch, sessionGeneration } = useAuth();
  const { status } = useConnectivity();
  const accountKey = `${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration}`;
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;
  const [stage, setStage] = useState<LiveStage | null>(null);
  const [contributions, setContributions] = useState<StageContributionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [mixing, setMixing] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!stageId || !user?.id) return;
    const requestedAccount = accountKey;
    try {
      const [nextStage, nextContributions] = await Promise.all([
        readLiveStage(stageId),
        readStageContributionStatuses(stageId),
      ]);
      if (accountKeyRef.current !== requestedAccount) return;
      setStage(nextStage);
      setContributions(nextContributions);
      setMessage("");
    } catch (error) {
      if (accountKeyRef.current === requestedAccount) {
        setMessage(error instanceof Error ? error.message : "Canal could not load this Stage lobby.");
      }
    } finally {
      if (accountKeyRef.current === requestedAccount) setLoading(false);
    }
  }, [accountKey, stageId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (!stageId) return;
      return subscribeToLiveStage(stageId, () => void load());
    }, [load, stageId]),
  );

  useEffect(() => {
    if (!stage || stage.tracks.slice(0, 4).every((track) => track.imageUrl)) return;
    const requestedAccount = accountKey;
    void addSpotifyArtworkToLiveStage(stage, [0, 1, 2, 3]).then((hydrated) => {
      if (accountKeyRef.current === requestedAccount) setStage(hydrated);
    });
  }, [accountKey, stage]);

  const isHost = stage?.hostId === user?.id;
  const readyCount = contributions.filter((item) => item.ready).length;

  async function mix(): Promise<void> {
    if (!isHost || mixing || status !== "online") return;
    setMixing(true);
    setMessage("");
    try {
      const mixed = await buildCollaborativeStageMix(stageId);
      setStage(mixed);
      setMessage(`Balanced mix ready with ${mixed.tracks.length} tracks.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Canal could not build the mix.");
    } finally {
      setMixing(false);
    }
  }

  if (loading && !stage) {
    return <View style={styles.center}><Stack.Screen options={{ headerShown: false }} /><ActivityIndicator color="#72D8C4" size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}><Text style={styles.backIcon}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>Stage lobby</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.eyebrow}>JOIN CODE</Text>
          <Text selectable style={styles.code}>{stage?.stageCode ?? "— — — — — —"}</Text>
          <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `Join my Canal Stage with code ${stage?.stageCode ?? ""}` })} style={styles.inviteButton}><Text style={styles.inviteText}>Share invite</Text></Pressable>
        </View>

        <View style={styles.titleBlock}><Text style={styles.title}>{stage?.name ?? "Stage"}</Text><Text style={styles.subtitle}>{readyCount} of {contributions.length} people ready · {stage?.tracks.length ?? 0} tracks in the current mix</Text></View>

        {stage?.tracks.length ? (
          <View style={styles.artworkStrip} accessibilityLabel="Stage mix artwork">
            {stage.tracks.slice(0, 4).map((track) => track.imageUrl ? (
              <Image
                key={track.id}
                accessibilityLabel={`${track.title} album artwork`}
                contentFit="cover"
                source={track.imageUrl}
                style={styles.mixArtwork}
                transition={140}
              />
            ) : (
              <View key={track.id} style={[styles.mixArtwork, styles.mixArtworkFallback]}>
                <Text style={styles.mixArtworkNote}>♪</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>ROOM CONTRIBUTIONS</Text>
        {contributions.map((item) => (
          <View key={item.userId} style={styles.personRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName.split(/\s+/u).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Text></View>
            <View style={styles.grow}><Text style={styles.personName}>{item.displayName}</Text><Text style={styles.personMeta}>{item.ready ? `${item.sceneName ?? "Scene"} · ${item.trackCount} tracks` : "Choosing what to contribute…"}</Text></View>
            <Text style={[styles.ready, !item.ready && styles.waiting]}>{item.ready ? "READY" : "WAITING"}</Text>
          </View>
        ))}

        {isHost ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname:
                  "/stage-invite-collaborators",
                params: { stageId },
              })
            }
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              Invite more collaborators
            </Text>
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/stage-contribution", params: { stageId } })} style={styles.secondary}><Text style={styles.secondaryText}>Add or change my contribution</Text></Pressable>

        {isHost ? (
          <Pressable accessibilityRole="button" accessibilityState={{ busy: mixing, disabled: readyCount < 1 || mixing || status !== "online" }} disabled={readyCount < 1 || mixing || status !== "online"} onPress={() => void mix()} style={[styles.primary, (readyCount < 1 || mixing || status !== "online") && styles.disabled]}>
            {mixing ? <ActivityIndicator color="#0C1714" /> : <Text style={styles.primaryText}>Generate balanced mix</Text>}
          </Pressable>
        ) : null}

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!stage} onPress={() => router.replace({ pathname: "/live-stage/[stageId]", params: { stageId } })} style={styles.enter}><Text style={styles.enterText}>{isHost ? "Preview live Stage" : "Enter Stage"}</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  content: { gap: 15, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 110 },
  header: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  backIcon: { color: canalDynamicColors.text, fontSize: 34, fontWeight: "300" },
  headerTitle: { color: canalDynamicColors.text, fontSize: 16, fontWeight: "800" },
  codeCard: { gap: 10, alignItems: "center", borderRadius: 24, borderWidth: 1, borderColor: "#31554C", backgroundColor: "#101B18", padding: 22 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  code: { color: "#F7F4EC", fontSize: 28, fontWeight: "900", letterSpacing: 7 },
  inviteButton: { minHeight: 48, minWidth: 150, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: "#40504A" },
  inviteText: { color: canalDynamicColors.text, fontSize: 13, fontWeight: "800" },
  titleBlock: { gap: 4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 29, fontWeight: "900" },
  subtitle: { color: canalDynamicColors.muted, fontSize: 13 },
  sectionLabel: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: "#29312E" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#293833" },
  avatarText: { color: "#F7F4EC", fontSize: 12, fontWeight: "900" },
  grow: { flex: 1 },
  personName: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" },
  personMeta: { color: canalDynamicColors.muted, fontSize: 12, marginTop: 3 },
  ready: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900" },
  waiting: { color: "#9DA6A1" },
  primary: { minHeight: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#72D8C4" },
  primaryText: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "900" },
  secondary: { minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3A4641" },
  secondaryText: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" },
  enter: { minHeight: 50, alignItems: "center", justifyContent: "center" },
  enterText: { color: canalDynamicColors.mint, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  message: { color: "#E8B4AE", fontSize: 13, lineHeight: 19 },
});
