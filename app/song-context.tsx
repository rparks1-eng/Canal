import { useEffect, useMemo, useState } from "react";

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
import { useAuth } from "../providers/auth-provider";
import { useConnectivity } from "../providers/connectivity-provider";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

type FieldState = "loading" | "empty" | "error" | "offline" | "ready";

export default function SongContextScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ sceneId?: string; trackId?: string }>();
  const sceneId = typeof params.sceneId === "string" ? params.sceneId : "";
  const trackId = typeof params.trackId === "string" ? params.trackId : "";
  const { sessionGeneration, user } = useAuth();
  const { refresh, status: connectivityStatus } = useConnectivity();
  const [scene, setScene] = useState<StoredScene | null>(null);
  const [track, setTrack] = useState<SceneTrack | null>(null);
  const [trackLoading, setTrackLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setTrackLoading(true);
    setScene(null);
    setTrack(null);
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
  }, [sceneId, trackId, user?.id]);

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

  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/scenes/[sceneId]", params: { sceneId } } as never);
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
          <Text numberOfLines={1} style={styles.headerScene}>{scene?.name ?? "Scene track"}</Text>
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
  if (props.state === "ready") return <View style={styles.statusRow}><Ionicons color={canalDynamicColors.mint} name="checkmark-circle-outline" size={18} /><Text style={styles.statusText}>Context matched by Genius</Text></View>;
  if (props.state === "loading") return <View accessibilityLiveRegion="polite" style={styles.statusRow}><ActivityIndicator color={canalDynamicColors.mint} /><Text style={styles.statusText}>Loading Genius context…</Text></View>;
  const title = props.state === "empty" ? "No context found" : props.state === "offline" ? "You’re offline" : "Context unavailable";
  return <View accessibilityLiveRegion="polite" style={styles.statusCard}><View style={styles.statusCopy}><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusBody}>The complete song page remains visible. Missing fields are marked below.</Text></View>{props.state !== "empty" ? <Pressable accessibilityLabel="Retry song context" accessibilityRole="button" onPress={props.onRetry} style={styles.retryButton}><Ionicons color={canalDynamicColors.text} name="refresh-outline" size={18} /></Pressable> : null}</View>;
}

function ContextSection(props: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.section}><View style={styles.sectionHeader}><Ionicons color={canalDynamicColors.mint} name={props.icon} size={19} /><Text style={styles.sectionTitle}>{props.title}</Text></View>{props.children}</View>;
}

function EmptyField(props: { state: FieldState; text: string }): React.JSX.Element {
  return <Text style={styles.emptyField}>{placeholderFor(props.state, props.text)}</Text>;
}

function DetailRow(props: { label: string; value?: string; state: FieldState }): React.JSX.Element {
  return <View style={styles.detailRow}><Text style={styles.fieldLabel}>{props.label}</Text><Text style={styles.fieldValue}>{props.value ?? placeholderFor(props.state, "No context found")}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: canalDynamicColors.baseCanvas },
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
  title: { color: canalDynamicColors.text, fontSize: 25, fontWeight: "900", lineHeight: 29 },
  artist: { color: canalDynamicColors.text, fontSize: 16, fontWeight: "700" },
  album: { color: canalDynamicColors.muted, fontSize: 13, lineHeight: 18 },
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
  creditTile: { width: "48%", minHeight: 62, paddingHorizontal: 11, paddingVertical: 9, gap: 4, borderRadius: 14, borderCurve: "continuous", backgroundColor: canalDynamicColors.canvas },
  creditLabel: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.65 },
  creditNames: { color: canalDynamicColors.text, fontSize: 12, fontWeight: "800", lineHeight: 16 },
  detailRow: { minHeight: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 18 },
  fieldLabel: { color: canalDynamicColors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { flex: 1, color: canalDynamicColors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  notesRail: { gap: 10, paddingRight: 18 },
  noteCard: { width: 266, minHeight: 220, padding: 14, gap: 9, borderRadius: 18, borderCurve: "continuous", backgroundColor: canalDynamicColors.canvas },
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
