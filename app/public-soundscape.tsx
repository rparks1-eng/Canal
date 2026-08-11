import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadSoundscapeShareProjection } from "../lib/soundscape-cloud";
import { parsePublicSoundscapePeriod } from "../lib/public-soundscape";
import type { SoundscapeShareProjection } from "../lib/soundscape-types";
import { useHideCanalNavigation } from "../providers/navigation-visibility-provider";

export default function PublicSoundscapeScreen() {
  useHideCanalNavigation();
  const params = useLocalSearchParams<{ ownerId?: string; periodKind?: string; periodKey?: string }>();
  const ownerId = typeof params.ownerId === "string" ? params.ownerId : "";
  const periodKind = typeof params.periodKind === "string" ? params.periodKind : "";
  const periodKey = typeof params.periodKey === "string" ? params.periodKey : "";
  const period = useMemo(() => parsePublicSoundscapePeriod(periodKind, periodKey), [periodKey, periodKind]);
  const [projection, setProjection] = useState<SoundscapeShareProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    if (!ownerId || !period) { setError("This Soundscape address is incomplete or invalid."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await loadSoundscapeShareProjection(ownerId, period);
      if (!result) { setProjection(null); setError("This Soundscape is private, unavailable, or no longer shared."); }
      else setProjection(result);
    } catch {
      setProjection(null); setError("This Soundscape is private, unavailable, or no longer shared.");
    } finally { setLoading(false); }
  }, [ownerId, period]);

  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/explore")} style={styles.iconButton}><Ionicons name="chevron-back" color="#fff7ee" size={21} /></Pressable><Text style={styles.brand}>CANAL · SHARED SOUNDSCAPE</Text><View style={styles.iconButton} /></View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#efb388" /><Text style={styles.muted}>Opening safe Soundscape…</Text></View> : error || !projection ? <View accessibilityLiveRegion="polite" style={styles.center}><Ionicons name="lock-closed-outline" color="#e7baa0" size={30} /><Text style={styles.errorTitle}>Soundscape unavailable</Text><Text style={styles.muted}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.action}><Text style={styles.actionText}>Try again</Text></Pressable></View> : <ScrollView contentContainerStyle={[styles.page, width >= 760 && styles.pageWide]} showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>{projection.period.key} · SAFE PUBLIC PROJECTION</Text><Text style={styles.title}>A year of music made visible.</Text><Text style={styles.subtitle}>This finished view contains only the Soundscape details its owner chose to publish.</Text>
      {projection.historyState === "insufficient_history" ? <View style={styles.notice}><Text style={styles.noticeText}>{projection.insufficientReason ?? "This Soundscape needs more history."}</Text></View> : null}
      <View style={styles.metrics}><Metric value={projection.totals.scenes} label="Scenes" /><Metric value={projection.totals.stages} label="Stages" /><Metric value={projection.totals.discoveries} label="Discoveries" /></View>
      <Section title="What the music was for" items={projection.topActivities} empty="No public activity signal" />
      <Section title="Emotional weather" items={projection.topMoods} empty="No public mood signal" />
      <Section title="Genre currents" items={projection.topGenres} empty="No public genre signal" />
      <Section title="Artists in orbit" items={projection.topArtists} empty="No public artist signal" />
      <View style={styles.feature}><Text style={styles.sectionEyebrow}>HIGHLIGHTS</Text>{projection.highlights.sceneNames.map((name) => <Text key={`scene:${name}`} style={styles.highlight}>{name}</Text>)}{projection.highlights.stageNames.map((name) => <Text key={`stage:${name}`} style={styles.highlight}>{name}</Text>)}{projection.highlights.discoveries.map((item) => <Text key={`${item.title}:${item.artist}`} style={styles.highlight}>{item.title} · {item.artist}</Text>)}</View>
      <Pressable accessibilityRole="button" onPress={() => router.push("/scene-studio")} style={styles.action}><Text style={styles.actionText}>Create your own Scene</Text><Ionicons name="arrow-forward" size={18} color="#18202a" /></Pressable>
    </ScrollView>}
  </SafeAreaView>;
}

function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Section({ title, items, empty }: { title: string; items: SoundscapeShareProjection["topMoods"]; empty: string }) { return <View style={styles.section}><Text style={styles.sectionEyebrow}>{title.toUpperCase()}</Text>{items.length ? <View style={styles.chips}>{items.slice(0, 5).map((item) => <View key={item.key} style={styles.chip}><Text style={styles.chipText}>{item.label}</Text><Text style={styles.chipCount}>{item.count}</Text></View>)}</View> : <Text style={styles.muted}>{empty}</Text>}</View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#101923" }, header: { minHeight: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,.12)" }, iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }, brand: { flex: 1, textAlign: "center", color: "#e9c09d", fontSize: 10, letterSpacing: 1.7, fontWeight: "800" }, center: { flex: 1, maxWidth: 520, alignSelf: "center", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 }, page: { padding: 24, paddingBottom: 80, width: "100%", maxWidth: 920, alignSelf: "center" }, pageWide: { paddingTop: 68 }, kicker: { color: "#e8aa7f", fontSize: 10, letterSpacing: 1.8, fontWeight: "800" }, title: { color: "#fff8ef", fontSize: 42, lineHeight: 47, fontWeight: "600", maxWidth: 680, marginTop: 14 }, subtitle: { color: "#c4bdb6", fontSize: 16, lineHeight: 24, maxWidth: 640, marginTop: 12, marginBottom: 30 }, errorTitle: { color: "#fff7ee", fontSize: 22, fontWeight: "700" }, muted: { color: "#b7b0aa", lineHeight: 20, textAlign: "center" }, notice: { borderRadius: 18, padding: 15, backgroundColor: "rgba(238,174,120,.12)", marginBottom: 20 }, noticeText: { color: "#eadfd4" }, metrics: { flexDirection: "row", gap: 10, marginBottom: 26 }, metric: { flex: 1, minHeight: 92, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,.07)" }, metricValue: { color: "#fff8ef", fontSize: 28, fontWeight: "800" }, metricLabel: { color: "#bdb5ad", fontSize: 11, marginTop: 4 }, section: { paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,.12)" }, sectionEyebrow: { color: "#d6a783", fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 13 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, chip: { minHeight: 48, borderRadius: 24, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,.08)" }, chipText: { color: "#fff6ed", fontSize: 14 }, chipCount: { color: "#d8ab89", fontSize: 11 }, feature: { borderRadius: 27, backgroundColor: "rgba(181,105,91,.18)", padding: 22, marginTop: 25 }, highlight: { color: "#fff5eb", fontSize: 18, lineHeight: 27, paddingVertical: 7 }, action: { minHeight: 50, borderRadius: 25, paddingHorizontal: 20, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f1cdab", marginTop: 25 }, actionText: { color: "#18202a", fontWeight: "800" } });
