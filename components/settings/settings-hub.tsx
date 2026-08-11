import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../canal-ui/canal-ambient-background";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

type RouteTarget = string | { pathname: string; params?: Record<string, string> };
type SettingsRow = { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; route: RouteTarget; danger?: boolean };

const EXPERIENCE: SettingsRow[] = [
  { title: "Appearance", subtitle: "System, Light or Dark", icon: "sunny-outline", route: "/appearance" },
  { title: "Playback & Scene generation", subtitle: "True Black, explicit music and transitions", icon: "play-circle-outline", route: { pathname: "/settings-preferences", params: { section: "playback" } } },
  { title: "Notifications", subtitle: "Stages, collaboration and social activity", icon: "notifications-outline", route: { pathname: "/settings-preferences", params: { section: "notifications" } } },
  { title: "Accessibility", subtitle: "Motion, contrast, text and haptics", icon: "accessibility-outline", route: { pathname: "/settings-preferences", params: { section: "accessibility" } } },
];
const MUSIC: SettingsRow[] = [
  { title: "Music services", subtitle: "Spotify connection and smart synchronization", icon: "musical-notes-outline", route: "/music-services" },
  { title: "Song DNA & learning", subtitle: "Likes, temporary dislikes and Scene feedback", icon: "git-network-outline", route: { pathname: "/settings-preferences", params: { section: "learning" } } },
  { title: "Downloads & storage", subtitle: "Cached music, artwork and local drafts", icon: "server-outline", route: { pathname: "/settings-preferences", params: { section: "storage" } } },
];
const PRIVACY: SettingsRow[] = [
  { title: "Privacy & data", subtitle: "Analytics, exports and device data", icon: "lock-closed-outline", route: "/data-controls" },
  { title: "Safety & connections", subtitle: "Blocked accounts and invitation permissions", icon: "shield-checkmark-outline", route: { pathname: "/settings-preferences", params: { section: "safety" } } },
  { title: "Help, feedback & about", subtitle: "Support, diagnostics, terms and version", icon: "help-circle-outline", route: { pathname: "/settings-preferences", params: { section: "support" } } },
  { title: "Session & account actions", subtitle: "Log out, deactivate or permanently delete", icon: "log-out-outline", route: { pathname: "/settings-preferences", params: { section: "account" } }, danger: true },
];

function goBack(): void { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/profile"); }

export function SettingsHub(props: { displayName: string; handle: string; spotifyConnected?: boolean }): React.JSX.Element {
  return <SafeAreaView edges={["top"]} style={styles.screen}>
    <CanalAmbientBackground />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable accessibilityLabel="Back to Profile" accessibilityRole="button" onPress={goBack} style={styles.iconButton}><Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} /></Pressable><View><Text style={styles.kicker}>YOUR CANAL</Text><Text accessibilityRole="header" style={styles.title}>Settings</Text></View></View>
      <Pressable accessibilityLabel="Open profile" accessibilityRole="button" onPress={() => router.push("/(tabs)/profile")} style={styles.account}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{props.displayName.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.accountCopy}><Text style={styles.accountName}>{props.displayName}</Text><Text style={styles.accountHandle}>{props.handle} · Account and profile</Text></View>
        <Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={18} />
      </Pressable>
      <View style={styles.statusRail}><Status icon="musical-note" label="Spotify" value={props.spotifyConnected ? "Connected" : "Review"} /><Status icon="sync" label="Library" value="Smart sync" /><Status icon="cloud-done" label="Canal Cloud" value="Account scoped" /></View>
      <SettingsSection rows={EXPERIENCE} title="Experience" />
      <SettingsSection rows={MUSIC} title="Music & intelligence" />
      <SettingsSection rows={PRIVACY} title="Privacy & support" />
    </ScrollView>
  </SafeAreaView>;
}

function Status(props: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }): React.JSX.Element { return <View style={styles.status}><Ionicons color={canalDynamicColors.mint} name={props.icon} size={18} /><Text style={styles.statusLabel}>{props.label}</Text><Text numberOfLines={1} style={styles.statusValue}>{props.value}</Text></View>; }
function SettingsSection(props: { title: string; rows: SettingsRow[] }): React.JSX.Element { return <View style={styles.section}><Text style={styles.sectionTitle}>{props.title}</Text><View style={styles.rows}>{props.rows.map((row) => <Pressable accessibilityLabel={`Open ${row.title}`} accessibilityRole="button" key={row.title} onPress={() => router.push(row.route as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={styles.rowIcon}><Ionicons color={row.danger ? canalDynamicColors.danger : canalDynamicColors.text} name={row.icon} size={21} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, row.danger && styles.danger]}>{row.title}</Text><Text numberOfLines={1} style={styles.rowSubtitle}>{row.subtitle}</Text></View><Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={17} /></Pressable>)}</View></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, content: { paddingHorizontal: 18, paddingBottom: 120, gap: 18 },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 8 }, iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, kicker: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 31 },
  account: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: canalDynamicColors.line }, avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: canalDynamicColors.mint }, avatarText: { color: canalDynamicColors.onAccent, fontFamily: "Georgia", fontSize: 20 }, accountCopy: { flex: 1, minWidth: 0 }, accountName: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 20 }, accountHandle: { color: canalDynamicColors.muted, fontSize: 12, marginTop: 3 },
  statusRail: { flexDirection: "row", gap: 7 }, status: { flex: 1, minHeight: 76, padding: 10, borderRadius: 17, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface, gap: 3 }, statusLabel: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "800" }, statusValue: { color: canalDynamicColors.text, fontSize: 11, fontWeight: "800" },
  section: { gap: 6 }, sectionTitle: { color: canalDynamicColors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", paddingHorizontal: 3 }, rows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: canalDynamicColors.line }, row: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: canalDynamicColors.line, paddingHorizontal: 2 }, rowIcon: { width: 38, height: 48, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" }, rowSubtitle: { color: canalDynamicColors.muted, fontSize: 11, marginTop: 3 }, danger: { color: canalDynamicColors.danger }, pressed: { opacity: 0.62 },
});
