import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { deleteLiveStage, endLiveStage, formatLiveStageElapsed, LiveStage, readHostedLiveStages, restartLiveStage } from "../lib/live-stages";

export default function ManagedStagesScreen() {
  const [stages, setStages] = useState<LiveStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    try { setStages(await readHostedLiveStages()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const ordered = useMemo(() => [...stages].sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : 1;
    return new Date(b.startedAt ?? b.createdAt).getTime() - new Date(a.startedAt ?? a.createdAt).getTime();
  }), [stages]);

  async function mutate(stage: LiveStage, action: "end" | "restart" | "delete") {
    if (busyId) return;
    setBusyId(stage.id);
    try {
      if (action === "delete") {
        await deleteLiveStage(stage.id);
        setStages((current) => current.filter((item) => item.id !== stage.id));
      } else {
        const next = action === "end" ? await endLiveStage(stage) : await restartLiveStage(stage);
        if (next) setStages((current) => current.map((item) => item.id === next.id ? next : item));
      }
    } finally { setBusyId(""); }
  }

  return <>
    <Stack.Screen options={{ title: "My Stages", headerBackTitle: "Profile" }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.eyebrow}>HOSTING</Text><Text style={styles.title}>My Stages</Text><Text style={styles.subtitle}>Live rooms first, followed by your newest ended Stages.</Text></View>
      {loading ? <ActivityIndicator color={canalDynamicColors.mint} /> : ordered.length === 0 ? <Text style={styles.empty}>Stages you host will appear here.</Text> : ordered.map((stage) => {
        const live = stage.status === "live";
        return <View key={stage.id} style={[styles.card, live && styles.liveCard]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${stage.name}`} onPress={() => router.push({ pathname: "/live-stage/[stageId]", params: { stageId: stage.id } })} style={styles.body}>
            <View style={styles.row}><Text style={[styles.status, live && styles.liveStatus]}>{live ? "LIVE NOW" : "ENDED"}</Text><Text style={styles.visibility}>{stage.visibility === "public" ? "Public" : "Private"}</Text></View>
            <Text style={styles.name}>{stage.name}</Text><Text style={styles.meta}>{stage.participantCount} member{stage.participantCount === 1 ? "" : "s"} · {live ? "Active" : "Ran for"} {formatLiveStageElapsed(stage)}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busyId === stage.id} onPress={() => live ? Alert.alert("End Stage?", "You can restart it later.", [{ text: "Cancel", style: "cancel" }, { text: "End Stage", style: "destructive", onPress: () => void mutate(stage, "end") }]) : void mutate(stage, "restart")} style={styles.action}><Text style={styles.actionText}>{live ? "End" : "Restart"}</Text></Pressable>
            {!live ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${stage.name}`} disabled={busyId === stage.id} onPress={() => Alert.alert("Delete this Stage?", "This permanently removes its chat, collaborators, and queue.", [{ text: "Cancel", style: "cancel" }, { text: "Delete Stage", style: "destructive", onPress: () => void mutate(stage, "delete") }])} style={styles.deleteAction}><Text style={styles.deleteText}>Delete</Text></Pressable> : null}
          </View>
        </View>;
      })}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, gap: 16, padding: 20, paddingBottom: 48, backgroundColor: canalDynamicColors.baseCanvas }, hero: { gap: 6 }, eyebrow: { color: canalDynamicColors.mint, fontWeight: "900", letterSpacing: 2 }, title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "900" }, subtitle: { color: canalDynamicColors.muted, fontSize: 16, lineHeight: 23 }, empty: { color: canalDynamicColors.muted, paddingVertical: 40, textAlign: "center" }, card: { overflow: "hidden", borderWidth: 1, borderColor: canalDynamicColors.line, borderRadius: 26, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface }, liveCard: { borderColor: canalDynamicColors.mint }, body: { gap: 10, minHeight: 128, padding: 20 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, status: { color: canalDynamicColors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, liveStatus: { color: canalDynamicColors.mint }, visibility: { color: canalDynamicColors.muted, fontWeight: "700" }, name: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 26, fontWeight: "800" }, meta: { color: canalDynamicColors.muted, fontSize: 14 }, actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: canalDynamicColors.line }, action: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center" }, actionText: { color: canalDynamicColors.mint, fontWeight: "900" }, deleteAction: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: canalDynamicColors.line }, deleteText: { color: canalDynamicColors.danger, fontWeight: "900" } });
