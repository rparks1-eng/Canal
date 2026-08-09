import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import * as Haptics from "expo-haptics";
import {
  Stack,
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  readScenes,
  sceneDurationMinutes,
} from "../lib/scenes";
import type {
  StoredScene,
} from "../lib/scenes";
import {
  submitSceneToStage,
} from "../lib/stage-collaboration";
import {
  useAuth,
} from "../providers/auth-provider";
import {
  useConnectivity,
} from "../providers/connectivity-provider";
import {
  scenePresentation,
} from "../components/canal-ui/scene-signature";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StageContributionScreen() {
  const params = useLocalSearchParams<{
    stageId?: string | string[];
    sceneId?: string | string[];
  }>();
  const stageId = first(params.stageId);
  const returnedSceneId = first(params.sceneId);
  const { user, accountEpoch, sessionGeneration } = useAuth();
  const { status } = useConnectivity();
  const accountKey = `${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration}`;
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;

  const [scenes, setScenes] = useState<StoredScene[]>([]);
  const [selectedId, setSelectedId] = useState(returnedSceneId);
  const [sharesContext, setSharesContext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => scenes.find((scene) => scene.id === selectedId) ?? null,
    [scenes, selectedId],
  );

  const load = useCallback(async () => {
    const requestedAccount = accountKey;
    setLoading(true);
    try {
      const next = await readScenes();
      if (accountKeyRef.current !== requestedAccount) return;
      setScenes(next.filter((scene) => scene.tracks.length > 0));
      setSelectedId((current) =>
        next.some((scene) => scene.id === current && scene.tracks.length > 0)
          ? current
          : next.find((scene) => scene.tracks.length > 0)?.id ?? "",
      );
    } catch {
      if (accountKeyRef.current === requestedAccount) {
        setMessage("Canal could not load your Scenes.");
      }
    } finally {
      if (accountKeyRef.current === requestedAccount) setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(): Promise<void> {
    if (!user?.id || !stageId || !selected || submitting) return;
    if (status !== "online") {
      setMessage("Reconnect before submitting your Stage contribution.");
      return;
    }

    const requestedAccount = accountKey;
    setSubmitting(true);
    setMessage("");
    try {
      await submitSceneToStage(stageId, selected, {
        sourceType: returnedSceneId === selected.id ? "fresh_scene" : "existing_scene",
        sharesMusicContext: sharesContext,
      });
      if (accountKeyRef.current !== requestedAccount) return;
      if (process.env.EXPO_OS === "ios") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace({
        pathname: "/stage-lobby/[stageId]",
        params: { stageId },
      });
    } catch (error) {
      if (accountKeyRef.current === requestedAccount) {
        setMessage(error instanceof Error ? error.message : "Canal could not submit your contribution.");
      }
    } finally {
      if (accountKeyRef.current === requestedAccount) setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Your contribution</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PRIVATE INPUT</Text>
          <Text style={styles.title}>What should you bring to the room?</Text>
          <Text style={styles.subtitle}>Choose one of your Canal Scenes, or create a fresh take. Other collaborators see only the resulting Stage mix.</Text>
        </View>

        <Pressable
          accessibilityLabel="Create a new Scene for this Stage"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/scene-studio", params: { stageId, reset: String(Date.now()) } } as never)}
          style={styles.newScene}
        >
          <Text style={styles.newSceneMark}>＋</Text>
          <View style={styles.grow}><Text style={styles.cardTitle}>Create a fresh Scene take</Text><Text style={styles.cardMeta}>Choose activity, moods, genres, arc, familiarity, and playback preferences.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>OR CONTRIBUTE AN EXISTING SCENE</Text>
        {loading ? <ActivityIndicator color="#72D8C4" /> : scenes.map((scene) => {
          const chosen = scene.id === selectedId;
          const presentation = scenePresentation(scene);
          return (
            <Pressable
              key={scene.id}
              accessibilityLabel={`${scene.name}, ${scene.activity || "Any activity"}, ${sceneDurationMinutes(scene)} minutes, ${scene.tracks.length} tracks`}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              onPress={() => setSelectedId(scene.id)}
              style={({ pressed }) => [
                styles.sceneRow,
                {
                  backgroundColor: presentation.colors[2],
                  borderColor: chosen ? presentation.accent : `${presentation.accent}44`,
                },
                chosen && styles.sceneRowSelected,
                pressed && styles.sceneRowPressed,
              ]}
            >
              <View pointerEvents="none" style={[styles.sceneGlowOne, { backgroundColor: presentation.colors[0] }]} />
              <View pointerEvents="none" style={[styles.sceneGlowTwo, { backgroundColor: presentation.colors[1] }]} />
              <View style={styles.sceneText}>
                <Text numberOfLines={1} style={styles.sceneName}>{scene.name}</Text>
                <Text numberOfLines={1} style={[styles.sceneMeta, { color: `${presentation.accent}CC` }]}>
                  {scene.activity || "Any activity"} · {sceneDurationMinutes(scene)} min · {scene.tracks.length} tracks
                </Text>
                <Text numberOfLines={1} style={styles.sceneSource}>Created by you</Text>
              </View>
              <View style={[styles.radio, chosen && { borderColor: presentation.accent }]}>
                {chosen ? <View style={[styles.radioDot, { backgroundColor: presentation.accent }]} /> : null}
              </View>
            </Pressable>
          );
        })}

        <View style={styles.consentRow}>
          <View style={styles.grow}><Text style={styles.cardTitle}>Use my connected-music context</Text><Text style={styles.cardMeta}>Consent for Canal to use permitted signals for this Stage only. Raw history is never shown to collaborators.</Text></View>
          <Switch accessibilityLabel="Use my connected music context for this Stage" value={sharesContext} onValueChange={setSharesContext} trackColor={{ false: "#39413D", true: "#2E796B" }} thumbColor={sharesContext ? "#72D8C4" : "#BBC2BE"} />
        </View>

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ busy: submitting, disabled: !selected || submitting || status !== "online" }} disabled={!selected || submitting || status !== "online"} onPress={() => void submit()} style={[styles.primary, (!selected || submitting || status !== "online") && styles.disabled]}>
          {submitting ? <ActivityIndicator color="#0C1714" /> : <Text style={styles.primaryText}>Submit my take</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { gap: 14, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 110 },
  header: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  backIcon: { color: canalDynamicColors.text, fontSize: 34, fontWeight: "300" },
  headerTitle: { color: canalDynamicColors.text, fontSize: 16, fontWeight: "800" },
  hero: { gap: 6, paddingVertical: 8 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 29, fontWeight: "900" },
  subtitle: { color: canalDynamicColors.muted, fontSize: 14, lineHeight: 21 },
  newScene: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: "#31554C", backgroundColor: "#101B18", padding: 14 },
  newSceneMark: { color: canalDynamicColors.mint, fontSize: 28 },
  grow: { flex: 1 },
  cardTitle: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "800" },
  cardMeta: { color: canalDynamicColors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chevron: { color: canalDynamicColors.mint, fontSize: 28 },
  sectionLabel: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 6 },
  sceneRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 17, borderWidth: 1, borderColor: "#29312E", backgroundColor: "#101514", padding: 11 },
  sceneRowSelected: { borderColor: "#72D8C4", backgroundColor: "#101B18" },
  sceneRowPressed: { opacity: 0.82 },
  sceneGlowOne: { position: "absolute", width: 116, height: 116, borderRadius: 58, top: -62, right: 20, opacity: 0.22 },
  sceneGlowTwo: { position: "absolute", width: 92, height: 92, borderRadius: 46, bottom: -54, left: 12, opacity: 0.16 },
  sceneText: { flex: 1, zIndex: 1 },
  sceneName: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "900" },
  sceneMeta: { fontSize: 11, marginTop: 4 },
  sceneSource: { color: "rgba(255,255,255,0.64)", fontSize: 10, marginTop: 3 },
  sceneArt: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#30443E" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#69736E", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#72D8C4" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#72D8C4" },
  consentRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#29312E", paddingVertical: 12 },
  message: { color: "#E8B4AE", fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#72D8C4" },
  primaryText: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
