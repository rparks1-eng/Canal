import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { readScenePlaylistExports } from "../lib/playlist-exports";
import type { ScenePlaylistExport } from "../lib/playlist-exports";
import {
  playlistMatchesDateFilter,
  type PlaylistDateFilter,
} from "../lib/playlist-export-filters";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

const PRIMARY_FILTERS = [
  ["today", "Made today"],
  ["week", "This week"],
  ["month", "Past month"],
] as const;

export default function ExportedPlaylistsScreen() {
  const [playlists, setPlaylists] = useState<ScenePlaylistExport[]>([]);
  const [filter, setFilter] = useState<PlaylistDateFilter>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError("");
      void readScenePlaylistExports({ limit: 100 })
        .then((items) => {
          if (active) setPlaylists(items);
        })
        .catch(() => {
          if (active) setError("Canal could not load exported playlists right now.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const filtered = useMemo(
    () => playlists.filter((playlist) => playlistMatchesDateFilter(playlist, filter)),
    [filter, playlists],
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <CanalAmbientBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to Profile"
            accessibilityRole="button"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")}
            style={styles.backButton}
          >
            <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>Exported playlists</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.eyebrow}>FROM YOUR SCENES</Text>
        <Text style={styles.title}>Your playlist archive.</Text>
        <Text style={styles.subtitle}>Every Spotify playlist Canal created from a Scene, organized by when you made it.</Text>

        <View accessibilityRole="tablist" style={styles.primaryFilters}>
          {PRIMARY_FILTERS.map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === value }}
              onPress={() => setFilter(value)}
              style={[styles.primaryFilter, filter === value && styles.primaryFilterSelected]}
            >
              <Text style={[styles.primaryFilterText, filter === value && styles.primaryFilterTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityLabel="Show all exported playlists"
          accessibilityRole="button"
          accessibilityState={{ selected: filter === "all" }}
          onPress={() => setFilter("all")}
          style={styles.allTimeButton}
        >
          <Text style={[styles.allTimeText, filter === "all" && styles.allTimeTextSelected]}>All time</Text>
        </Pressable>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={canalDynamicColors.mint} size="large" /></View>
        ) : error ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Unable to load playlists</Text><Text style={styles.emptyText}>{error}</Text></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No playlists for this period</Text>
            <Text style={styles.emptyText}>Export a Scene to Spotify or choose another time filter.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((playlist) => (
              <Pressable
                key={playlist.id}
                accessibilityLabel={`Open ${playlist.sceneName} on Spotify`}
                accessibilityRole={playlist.spotifyPlaylistUrl ? "link" : "button"}
                disabled={!playlist.spotifyPlaylistUrl}
                onPress={() => playlist.spotifyPlaylistUrl ? void Linking.openURL(playlist.spotifyPlaylistUrl) : undefined}
                style={({ pressed }) => [styles.row, pressed && styles.pressed, !playlist.spotifyPlaylistUrl && styles.disabled]}
              >
                <View style={styles.rowIcon}><Ionicons color={canalDynamicColors.mint} name="musical-notes" size={20} /></View>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{playlist.sceneName}</Text>
                  <Text style={styles.rowMeta}>{playlist.trackCount} tracks · {new Date(playlist.createdAt).toLocaleDateString()}</Text>
                </View>
                <Ionicons color={canalDynamicColors.muted} name="open-outline" size={18} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "transparent", flex: 1 },
  content: { gap: 12, paddingBottom: 100, paddingHorizontal: 20 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  headerSpacer: { height: 48, width: 48 },
  headerTitle: { color: canalDynamicColors.text, fontSize: 16, fontWeight: "800" },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 32, fontWeight: "600" },
  subtitle: { color: canalDynamicColors.muted, fontSize: 13, lineHeight: 19 },
  primaryFilters: { flexDirection: "row", gap: 5, marginTop: 4 },
  primaryFilter: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 8 },
  primaryFilterSelected: { backgroundColor: canalDynamicColors.warningSurface, borderRadius: 15 },
  primaryFilterText: { color: canalDynamicColors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" },
  primaryFilterTextSelected: { color: canalDynamicColors.text },
  allTimeButton: { alignItems: "flex-end", alignSelf: "flex-end", justifyContent: "center", minHeight: 48, minWidth: 72 },
  allTimeText: { color: canalDynamicColors.muted, fontSize: 11, fontWeight: "800" },
  allTimeTextSelected: { color: canalDynamicColors.mint },
  center: { alignItems: "center", justifyContent: "center", minHeight: 220 },
  empty: { alignItems: "center", borderColor: canalDynamicColors.line, borderRadius: 20, borderStyle: "dashed", borderWidth: 1, gap: 8, padding: 24 },
  emptyTitle: { color: canalDynamicColors.text, fontSize: 17, fontWeight: "900" },
  emptyText: { color: canalDynamicColors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  list: { gap: 8 },
  row: { alignItems: "center", backgroundColor: canalDynamicColors.surface, borderColor: canalDynamicColors.line, borderRadius: 17, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 68, padding: 10 },
  rowIcon: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "900" },
  rowMeta: { color: canalDynamicColors.muted, fontSize: 10, marginTop: 4 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
