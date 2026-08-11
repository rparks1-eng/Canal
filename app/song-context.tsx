import { useEffect, useMemo, useRef, useState } from "react";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { useLinerNotesContext } from "../components/liner-notes/useLinerNotesContext";
import type { GeniusSongContext } from "../lib/genius-context-contract";
import { getSceneById, type SceneTrack, type StoredScene } from "../lib/scenes";
import { captureSceneStudioScope } from "../lib/scene-studio-scope";
import { classifyCanalSongDna, type SongSceneMoodEvidence } from "../lib/song-dna";
import { persistSongDna, readSongDisliked, readSongLiked, readSongSceneMoodEvidence, setSongDisliked, setSongLiked } from "../lib/song-preferences";
import {
  normalizeSongSceneActionInput,
  songSceneActionParams,
} from "../lib/song-scene-actions";
import { useAuth } from "../providers/auth-provider";
import { useConnectivity } from "../providers/connectivity-provider";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

type FieldState = "loading" | "empty" | "error" | "offline" | "ready";

export default function SongContextScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ sceneId?: string; trackId?: string; trackTitle?: string; artistName?: string; artworkUrl?: string; spotifyUrl?: string; genreHints?: string }>();
  const sceneId = typeof params.sceneId === "string" ? params.sceneId : "";
  const trackId = typeof params.trackId === "string" ? params.trackId : "";
  const trackTitle = typeof params.trackTitle === "string" ? params.trackTitle.slice(0, 300) : "";
  const artistName = typeof params.artistName === "string" ? params.artistName.slice(0, 300) : "";
  const requestedArtworkUrl = typeof params.artworkUrl === "string" && /^https:\/\//u.test(params.artworkUrl)
    ? params.artworkUrl
    : undefined;
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const { refresh, status: connectivityStatus } = useConnectivity();
  const [scene, setScene] = useState<StoredScene | null>(null);
  const [track, setTrack] = useState<SceneTrack | null>(null);
  const [trackLoading, setTrackLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState("");
  const [sceneMoodEvidence, setSceneMoodEvidence] = useState<SongSceneMoodEvidence[]>([]);
  const scope = useMemo(() => captureSceneStudioScope({ userId: user?.id, accountEpoch, sessionGeneration }), [accountEpoch, sessionGeneration, user?.id]);
  const currentScopeRef = useRef(scope);
  const persistedDnaKeyRef = useRef("");
  currentScopeRef.current = scope;

  useEffect(() => {
    let active = true;
    setTrackLoading(true);
    setScene(null);
    setTrack(null);

    if (!sceneId && trackId && trackTitle && artistName) {
      setTrack({ id: trackId, title: trackTitle, artist: artistName, imageUrl: requestedArtworkUrl });
      setTrackLoading(false);
      return () => { active = false; };
    }

    void getSceneById(sceneId).then((nextScene) => {
      if (!active) return;
      const nextTrack = nextScene?.tracks.find((candidate) => candidate.id === trackId) ?? null;
      setScene(nextScene);
      setTrack(nextTrack);
      setTrackLoading(false);
    }).catch(() => {
      if (!active) return;
      setTrackLoading(false);
    });
    return () => { active = false; };
  }, [artistName, requestedArtworkUrl, sceneId, trackId, trackTitle, user?.id]);

  const linerNotesTrack = useMemo(() => track ? {
    title: track.title,
    artist: track.artist,
  } : null, [track]);
  const genius = useLinerNotesContext({
    track: linerNotesTrack,
    visible: Boolean(track),
    userId: user?.id ?? null,
    sessionGeneration,
    connectivityStatus,
  });
  const song = genius.context?.song;
  const state: FieldState = trackLoading ? "loading" : track ? genius.state : "error";
  const artworkUrl = song?.artworkUrl ?? track?.imageUrl;
  const songAction = useMemo(() => normalizeSongSceneActionInput({
    trackId: track?.id,
    title: track?.title,
    artist: track?.artist,
    artworkUrl,
    spotifyUrl: track?.spotifyUrl ?? params.spotifyUrl,
  }), [artworkUrl, params.spotifyUrl, track]);
  const genreHints = useMemo(() => typeof params.genreHints === "string"
    ? params.genreHints.slice(0, 1_000).split("|").map((value) => value.trim()).filter(Boolean).slice(0, 12)
    : [], [params.genreHints]);
  const songDna = useMemo(() => classifyCanalSongDna({
    title: track?.title,
    artist: track?.artist,
    album: song?.album,
    genreHints,
    story: song?.description,
    sceneMoodEvidence,
  }), [genreHints, sceneMoodEvidence, song?.album, song?.description, track?.artist, track?.title]);

  useEffect(() => {
    let active = true;
    setSceneMoodEvidence([]);
    if (!songAction || !scope) return () => { active = false; };
    void readSongSceneMoodEvidence(songAction.trackId, scope, () => currentScopeRef.current).then((evidence) => {
      if (active) setSceneMoodEvidence(evidence);
    });
    return () => { active = false; };
  }, [scope, songAction]);

  useEffect(() => {
    if (!songAction || !scope) return;
    const persistenceKey = `${scope.userId}:${songAction.trackId}:${songDna.taxonomyVersion}:${songDna.genres.join("|")}:${songDna.moods.join("|")}:${songDna.confidence}`;
    if (persistedDnaKeyRef.current === persistenceKey) return;
    persistedDnaKeyRef.current = persistenceKey;
    void persistSongDna(songAction, songDna, scope, () => currentScopeRef.current).catch(() => {
      if (persistedDnaKeyRef.current === persistenceKey) persistedDnaKeyRef.current = "";
    });
  }, [scope, songAction, songDna]);

  useEffect(() => {
    let active = true;
    setLiked(false);
    setDisliked(false);
    setLikeError("");
    if (!songAction || !scope) return () => { active = false; };
    void Promise.all([
      readSongLiked(songAction.trackId, scope, () => currentScopeRef.current),
      readSongDisliked(songAction.trackId, scope, () => currentScopeRef.current),
    ])
      .then(([nextLiked, nextDisliked]) => { if (active) { setLiked(nextLiked); setDisliked(nextDisliked); } })
      .catch(() => { if (active) setLikeError("Like status is temporarily unavailable."); });
    return () => { active = false; };
  }, [scope, songAction]);

  const toggleLike = async (): Promise<void> => {
    if (!songAction || !scope || likeBusy) return;
    const nextLiked = !liked;
    setLikeBusy(true);
    setLikeError("");
    try {
      await setSongLiked(songAction, songDna, nextLiked, scope, () => currentScopeRef.current);
      setLiked(nextLiked);
      if (nextLiked) setDisliked(false);
    } catch {
      setLikeError("Could not update this song. Try again.");
    } finally {
      setLikeBusy(false);
    }
  };

  const toggleDislike = async (): Promise<void> => {
    if (!songAction || !scope || likeBusy) return;
    const nextDisliked = !disliked;
    setLikeBusy(true);
    setLikeError("");
    try {
      await setSongDisliked(songAction, songDna, nextDisliked, scope, () => currentScopeRef.current);
      setDisliked(nextDisliked);
      if (nextDisliked) setLiked(false);
    } catch {
      setLikeError("Could not update this song. Try again.");
    } finally {
      setLikeBusy(false);
    }
  };

  const addToScene = (): void => {
    if (!songAction) return;
    router.push({ pathname: "/add-song-to-scene", params: songSceneActionParams(songAction) } as never);
  };

  const createSceneFromSong = (): void => {
    if (!songAction) return;
    router.push({
      pathname: "/scene-studio",
      params: {
        reset: String(Date.now()),
        anchorTrackId: songAction.trackId,
        direct: `Build this Scene around ${songAction.title} by ${songAction.artist}.`,
      },
    } as never);
  };

  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else if (sceneId) router.replace({ pathname: "/scenes/[sceneId]", params: { sceneId } } as never);
    else router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <CanalAmbientBackground />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Scene" accessibilityRole="button" onPress={goBack} style={styles.headerButton}>
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SONG CONTEXT</Text>
          <Text numberOfLines={1} style={styles.headerScene}>{scene?.name ?? (sceneId ? "Scene track" : "New to your orbit")}</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {artworkUrl ? (
            <Image accessibilityLabel={`${track?.title ?? "Song"} artwork`} contentFit="cover" source={{ uri: artworkUrl }} style={styles.artwork} transition={160} />
          ) : (
            <View style={[styles.artwork, styles.artworkEmpty]}>
              <Ionicons color={canalDynamicColors.muted} name="musical-note-outline" size={38} />
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text accessibilityRole="header" style={styles.title}>{track?.title ?? "Song unavailable"}</Text>
            <Text style={styles.artist}>{track?.artist ?? "Unknown artist"}</Text>
            <Text style={styles.album}>{song?.album ?? placeholderFor(state, "No album context found")}</Text>
          </View>
          <View style={styles.songPreferenceActions}>
            <Pressable accessibilityLabel={liked ? "Unlike song" : "Like song"} accessibilityRole="button" accessibilityState={{ busy: likeBusy, selected: liked }} disabled={!songAction || !scope || likeBusy} onPress={() => { void toggleLike(); }} style={({ pressed }) => [styles.likeButton, pressed && styles.pressed]}>
              <Ionicons color={liked ? canalDynamicColors.mint : canalDynamicColors.text} name={liked ? "heart" : "heart-outline"} size={23} />
            </Pressable>
            <Pressable accessibilityLabel={disliked ? "Remove song dislike" : "Dislike song"} accessibilityHint="Temporarily deprioritizes this song in future Scene generation" accessibilityRole="button" accessibilityState={{ busy: likeBusy, selected: disliked }} disabled={!songAction || !scope || likeBusy} onPress={() => { void toggleDislike(); }} style={({ pressed }) => [styles.likeButton, pressed && styles.pressed]}>
              <Ionicons color={disliked ? canalDynamicColors.danger : canalDynamicColors.text} name={disliked ? "remove-circle" : "remove-circle-outline"} size={21} />
            </Pressable>
          </View>
        </View>

        <View accessibilityLabel="Canal Song DNA" style={styles.songDna}>
          <View style={styles.dnaHeading}>
            <Text style={styles.dnaEyebrow}>CANAL SONG DNA</Text>
            <View accessibilityLabel="Canal Song DNA beta" style={styles.dnaBeta}>
              <Ionicons color={canalDynamicColors.muted} name="flask-outline" size={12} />
              <Text style={styles.dnaBetaText}>BETA</Text>
            </View>
          </View>
          <DnaRow label="Genre" values={songDna.genres} />
          <DnaRow label="Mood" values={songDna.moods} />
          <Text style={styles.dnaSource}>{`${songDna.confidence.toUpperCase()} CONFIDENCE · ${songDna.sources.map((source) => source.toUpperCase()).join(" + ")}`}</Text>
          {likeError ? <Text accessibilityLiveRegion="polite" style={styles.likeError}>{likeError}</Text> : null}
        </View>

        <View style={styles.songActions}>
          <Pressable accessibilityLabel={`Add ${track?.title ?? "song"} to a Scene`} accessibilityRole="button" disabled={!songAction} onPress={addToScene} style={({ pressed }) => [styles.songAction, pressed && styles.pressed, !songAction && styles.actionDisabled]}>
            <Ionicons color={canalDynamicColors.text} name="add-circle-outline" size={20} />
            <Text style={styles.songActionText}>Add to Scene</Text>
          </Pressable>
          <Pressable accessibilityLabel={`Create a Scene from ${track?.title ?? "song"}`} accessibilityRole="button" disabled={!songAction} onPress={createSceneFromSong} style={({ pressed }) => [styles.songAction, pressed && styles.pressed, !songAction && styles.actionDisabled]}>
            <Ionicons color={canalDynamicColors.text} name="sparkles-outline" size={19} />
            <Text style={styles.songActionText}>Create Scene</Text>
          </Pressable>
        </View>

        <ContextStatus state={state} onRetry={() => { void refresh(); genius.retry(); }} />

        <ContextSection icon="book-outline" title="Story">
          <Text style={styles.body}>{song?.description ?? placeholderFor(state, "No story context found")}</Text>
        </ContextSection>

        <ContextSection icon="people-outline" title="Credits">
          {song?.credits.length ? (
            <View style={styles.creditsGrid}>
              {song.credits.map((credit) => (
                <View key={`${credit.label}-${credit.names.join("-")}`} style={styles.creditTile}>
                  <Text numberOfLines={1} style={styles.creditLabel}>{credit.label}</Text>
                  <Text numberOfLines={2} style={styles.creditNames}>{credit.names.join(", ")}</Text>
                </View>
              ))}
            </View>
          ) : <EmptyField state={state} text="No credits found" />}
        </ContextSection>

        <ContextSection icon="calendar-outline" title="Release details">
          <DetailRow label="Album" value={song?.album} state={state} />
          <DetailRow label="Release date" value={song?.releaseDate} state={state} />
          <DetailRow label="Genius match" value={matchLabel(song)} state={state} />
          <DetailRow label="Pageviews" value={song?.popularity?.pageviews.toLocaleString()} state={state} />
        </ContextSection>

        <ContextSection icon="chatbubble-ellipses-outline" title="Notes">
          {song?.annotations.length ? (
            <ScrollView
              accessibilityLabel="Community notes"
              contentContainerStyle={styles.notesRail}
              decelerationRate="fast"
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={276}
            >
              {song.annotations.map((annotation, index) => (
                <View accessibilityLabel={`Note ${index + 1} of ${song.annotations.length}`} key={annotation.id} style={styles.noteCard}>
                  <View style={styles.noteHeader}>
                    <Text style={styles.noteLabel}>{annotation.verified ? "VERIFIED NOTE" : "COMMUNITY NOTE"}</Text>
                    <Text style={styles.noteCount}>{index + 1}/{song.annotations.length}</Text>
                  </View>
                  <Text numberOfLines={9} style={styles.noteBody}>{annotation.body}</Text>
                  {annotation.geniusUrl ? (
                    <Pressable accessibilityLabel={`Open full note ${index + 1} on Genius`} accessibilityRole="link" onPress={() => { if (annotation.geniusUrl) void Linking.openURL(annotation.geniusUrl); }} style={styles.noteLink}>
                      <Text style={styles.noteLinkText}>Read full note</Text>
                      <Ionicons color={canalDynamicColors.muted} name="open-outline" size={15} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : <EmptyField state={state} text="No notes found" />}
        </ContextSection>

        <ContextSection icon="link-outline" title="Creative links">
          {song?.links.length ? song.links.map((link) => (
            <Pressable accessibilityLabel={`Open ${link.label}`} accessibilityRole="link" key={`${link.label}-${link.url}`} onPress={() => void Linking.openURL(link.url)} style={styles.linkRow}>
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons color={canalDynamicColors.muted} name="open-outline" size={17} />
            </Pressable>
          )) : <EmptyField state={state} text="No creative links found" />}
        </ContextSection>

        <Text style={styles.attribution}>{genius.context?.attribution.label ?? "Song context from Genius"}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function placeholderFor(state: FieldState, empty: string): string {
  if (state === "loading") return "Loading context…";
  if (state === "offline") return "Context unavailable while offline";
  if (state === "error") return "Context temporarily unavailable";
  return empty;
}

function matchLabel(song?: GeniusSongContext): string | undefined {
  if (!song) return undefined;
  if (song.matchConfidence === "provider-id") return "Verified ID";
  if (song.matchConfidence === "exact") return "Exact match";
  return "Likely match";
}

function ContextStatus(props: { state: FieldState; onRetry: () => void }): React.JSX.Element {
  if (props.state === "ready") return <></>;
  if (props.state === "loading") return <View accessibilityLiveRegion="polite" style={styles.statusRow}><ActivityIndicator color={canalDynamicColors.mint} /><Text style={styles.statusText}>Loading Genius context…</Text></View>;
  const title = props.state === "empty" ? "No context found" : props.state === "offline" ? "You’re offline" : "Context unavailable";
  return <View accessibilityLiveRegion="polite" style={styles.statusCard}><View style={styles.statusCopy}><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusBody}>The complete song page remains visible. Missing fields are marked below.</Text></View>{props.state !== "empty" ? <Pressable accessibilityLabel="Retry song context" accessibilityRole="button" onPress={props.onRetry} style={styles.retryButton}><Ionicons color={canalDynamicColors.text} name="refresh-outline" size={18} /></Pressable> : null}</View>;
}

function ContextSection(props: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.section}><View style={styles.sectionHeader}><Ionicons color={canalDynamicColors.mint} name={props.icon} size={19} /><Text style={styles.sectionTitle}>{props.title}</Text></View>{props.children}</View>;
}

function DnaRow(props: { label: string; values: readonly string[] }): React.JSX.Element {
  return <View style={styles.dnaRow}><Text style={styles.dnaLabel}>{props.label}</Text><Text style={styles.dnaValues}>{props.values.length ? props.values.join("  ·  ") : "Still learning"}</Text></View>;
}

function EmptyField(props: { state: FieldState; text: string }): React.JSX.Element {
  return <Text style={styles.emptyField}>{placeholderFor(props.state, props.text)}</Text>;
}

function DetailRow(props: { label: string; value?: string; state: FieldState }): React.JSX.Element {
  return <View style={styles.detailRow}><Text style={styles.fieldLabel}>{props.label}</Text><Text style={styles.fieldValue}>{props.value ?? placeholderFor(props.state, "No context found")}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, alignItems: "center" },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  headerScene: { color: canalDynamicColors.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  content: { paddingHorizontal: 18, paddingBottom: 150, gap: 14 },
  hero: { paddingHorizontal: 4, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 16 },
  artwork: { width: 112, height: 112, borderRadius: 18, borderCurve: "continuous" },
  artworkEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: canalDynamicColors.elevated },
  heroCopy: { flex: 1, gap: 6 },
  songPreferenceActions: { alignItems: "center" },
  likeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  title: { color: canalDynamicColors.text, fontSize: 25, fontWeight: "900", lineHeight: 29 },
  artist: { color: canalDynamicColors.text, fontSize: 16, fontWeight: "700" },
  album: { color: canalDynamicColors.muted, fontSize: 13, lineHeight: 18 },
  songDna: { paddingHorizontal: 4, paddingVertical: 12, gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: canalDynamicColors.line },
  dnaEyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  dnaHeading: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 9 },
  dnaBeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  dnaBetaText: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  dnaRow: { minHeight: 28, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  dnaLabel: { width: 48, color: canalDynamicColors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  dnaValues: { flex: 1, color: canalDynamicColors.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  dnaSource: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  likeError: { color: canalDynamicColors.danger, fontSize: 12, fontWeight: "700" },
  songActions: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
  songAction: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 8 },
  songActionText: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "800" },
  actionDisabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
  statusRow: { minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  statusText: { color: canalDynamicColors.muted, fontSize: 13, fontWeight: "700" },
  statusCard: { minHeight: 68, padding: 14, borderRadius: 18, borderCurve: "continuous", backgroundColor: canalDynamicColors.warningSurface, flexDirection: "row", alignItems: "center", gap: 10 },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "900" },
  statusBody: { color: canalDynamicColors.muted, fontSize: 12, lineHeight: 17 },
  retryButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: canalDynamicColors.line },
  sectionHeader: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { color: canalDynamicColors.text, fontSize: 17, fontWeight: "900" },
  body: { color: canalDynamicColors.muted, fontSize: 14, lineHeight: 21 },
  emptyField: { color: canalDynamicColors.muted, fontSize: 14, fontStyle: "italic" },
  creditsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  creditTile: { width: "48%", minHeight: 62, paddingHorizontal: 11, paddingVertical: 9, gap: 4, borderRadius: 14, borderCurve: "continuous", backgroundColor: canalDynamicColors.elevated },
  creditLabel: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.65 },
  creditNames: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "800", lineHeight: 16 },
  detailRow: { minHeight: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 18 },
  fieldLabel: { color: canalDynamicColors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { flex: 1, color: canalDynamicColors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  notesRail: { gap: 10, paddingRight: 18 },
  noteCard: { width: 266, minHeight: 220, padding: 14, gap: 9, borderRadius: 18, borderCurve: "continuous", backgroundColor: canalDynamicColors.elevated },
  noteHeader: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  noteLabel: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  noteCount: { color: canalDynamicColors.muted, fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] },
  noteBody: { flex: 1, color: canalDynamicColors.muted, fontSize: 13, lineHeight: 19 },
  noteLink: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  noteLinkText: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "900" },
  linkRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  linkText: { flex: 1, color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" },
  attribution: { color: canalDynamicColors.muted, fontSize: 11, textAlign: "center", paddingVertical: 8 },
});
