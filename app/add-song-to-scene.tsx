import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { scenePresentation } from "../components/canal-ui/scene-signature";
import {
  addSongToScene,
  normalizeSongSceneActionInput,
  sceneCanAcceptSong,
} from "../lib/song-scene-actions";
import { readScenes, type StoredScene } from "../lib/scenes";
import {
  captureSceneStudioScope,
  sameSceneStudioScope,
  type SceneStudioScope,
} from "../lib/scene-studio-scope";
import { useAuth } from "../providers/auth-provider";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

export default function AddSongToSceneScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    trackId?: string;
    trackTitle?: string;
    artistName?: string;
    artworkUrl?: string;
    spotifyUrl?: string;
  }>();
  const song = useMemo(() => normalizeSongSceneActionInput({
    trackId: params.trackId,
    title: params.trackTitle,
    artist: params.artistName,
    artworkUrl: params.artworkUrl,
    spotifyUrl: params.spotifyUrl,
  }), [params.artistName, params.artworkUrl, params.spotifyUrl, params.trackId, params.trackTitle]);
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const scope = useMemo(() => captureSceneStudioScope({
    userId: user?.id,
    accountEpoch,
    sessionGeneration,
  }), [accountEpoch, sessionGeneration, user?.id]);
  const scopeRef = useRef<SceneStudioScope | null>(scope);
  scopeRef.current = scope;
  const [scenes, setScenes] = useState<StoredScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const requestedScope = scope;
    if (!requestedScope) {
      setScenes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextScenes = await readScenes();
      if (sameSceneStudioScope(requestedScope, scopeRef.current)) {
        setScenes(nextScenes.filter((scene) => scene.libraryType !== "saved"));
      }
    } catch (error) {
      if (sameSceneStudioScope(requestedScope, scopeRef.current)) {
        setMessage(error instanceof Error ? error.message : "Canal could not load your Scenes.");
      }
    } finally {
      if (sameSceneStudioScope(requestedScope, scopeRef.current)) setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = useCallback(async (scene: StoredScene) => {
    const operationScope = scopeRef.current;
    if (!song || !operationScope || savingId) return;
    setSavingId(scene.id);
    setMessage("");
    try {
      const updated = await addSongToScene(scene, song, operationScope, () => scopeRef.current);
      if (!sameSceneStudioScope(operationScope, scopeRef.current)) return;
      router.replace({ pathname: "/scenes/[sceneId]", params: { sceneId: updated.id } } as never);
    } catch (error) {
      if (sameSceneStudioScope(operationScope, scopeRef.current)) {
        setMessage(error instanceof Error ? error.message : "Canal could not add this song.");
      }
    } finally {
      if (sameSceneStudioScope(operationScope, scopeRef.current)) setSavingId("");
    }
  }, [savingId, song]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <CanalAmbientBackground />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ADD TO SCENE</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>Choose where this song belongs</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        {song ? (
          <View style={styles.songRow}>
            {song.artworkUrl ? <Image accessibilityLabel={`${song.title} artwork`} source={{ uri: song.artworkUrl }} style={styles.artwork} /> : null}
            <View style={styles.songCopy}>
              <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
              <Text numberOfLines={1} style={styles.songArtist}>{song.artist}</Text>
            </View>
          </View>
        ) : <Text accessibilityLiveRegion="assertive" style={styles.message}>This song reference is invalid.</Text>}

        {message ? <Text accessibilityLiveRegion="assertive" style={styles.message}>{message}</Text> : null}
        {loading ? <ActivityIndicator accessibilityLabel="Loading Scenes" color={canalDynamicColors.mint} /> : null}
        {!loading && song && scenes.length === 0 ? <Text style={styles.empty}>Create a Scene first, then return here to add this song.</Text> : null}

        {song ? scenes.map((scene) => {
          const availability = sceneCanAcceptSong(scene, song.trackId);
          const presentation = scenePresentation(scene);
          const disabled = availability !== "ready" || Boolean(savingId);
          const status = availability === "duplicate" ? "Already added" : availability === "full" ? "Scene full" : `${scene.tracks.length} tracks`;
          return (
            <Pressable
              accessibilityLabel={`Add ${song.title} to ${scene.name}`}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: savingId === scene.id }}
              disabled={disabled}
              key={scene.id}
              onPress={() => void handleAdd(scene)}
              style={({ pressed }) => [styles.sceneRow, pressed && styles.pressed, disabled && styles.disabled]}
            >
              <View style={[styles.sceneSwatch, { backgroundColor: presentation.accent }]} />
              <View style={styles.sceneCopy}>
                <Text numberOfLines={1} style={styles.sceneName}>{scene.name}</Text>
                <Text numberOfLines={1} style={styles.sceneMeta}>{scene.activity || "Any activity"} · {status}</Text>
              </View>
              {savingId === scene.id ? <ActivityIndicator color={presentation.accent} /> : <Ionicons color={presentation.accent} name="add-circle-outline" size={24} />}
            </Pressable>
          );
        }) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center" },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  headerTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800", marginTop: 3 },
  content: { paddingHorizontal: 18, paddingBottom: 140, gap: 10 },
  songRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: canalDynamicColors.line },
  artwork: { width: 56, height: 56, borderRadius: 12 },
  songCopy: { flex: 1, minWidth: 0 },
  songTitle: { color: canalDynamicColors.text, fontSize: 17, fontWeight: "900" },
  songArtist: { color: canalDynamicColors.muted, fontSize: 13, marginTop: 3 },
  sceneRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  sceneSwatch: { width: 8, height: 48, borderRadius: 4 },
  sceneCopy: { flex: 1, minWidth: 0 },
  sceneName: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "900" },
  sceneMeta: { color: canalDynamicColors.muted, fontSize: 12, marginTop: 3 },
  message: { color: canalDynamicColors.danger, fontSize: 13, lineHeight: 19 },
  empty: { color: canalDynamicColors.muted, fontSize: 14, lineHeight: 21, paddingVertical: 18 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
