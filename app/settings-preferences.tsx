import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAlert } from "../lib/canal-alert";

import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { logoutAllMusicPlatforms, retryIncompleteAccountCleanup } from "../lib/app-session";
import { DEFAULT_CANAL_SETTINGS, readAccountCanalSettings, saveAccountCanalSettings, type CanalSettings } from "../lib/app-settings";
import { getCanalStorageSummary } from "../lib/data-controls";
import { useAuth } from "../providers/auth-provider";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

type Section = "playback" | "notifications" | "accessibility" | "learning" | "storage" | "safety" | "support" | "account";
const SECTION_COPY: Record<Section, { kicker: string; title: string; subtitle: string }> = {
  playback: { kicker: "PLAYBACK & CREATION", title: "Shape every Scene", subtitle: "These defaults apply to new Scenes and playback on this account." },
  notifications: { kicker: "NOTIFICATIONS", title: "Only what matters", subtitle: "Activity remains synchronized while presentation follows these choices." },
  accessibility: { kicker: "ACCESSIBILITY", title: "Canal, your way", subtitle: "Device preferences remain the baseline and can be refined here." },
  learning: { kicker: "SONG DNA & LEARNING", title: "Teach Canal your sound", subtitle: "Control how explicit feedback improves future Scene generation." },
  storage: { kicker: "DOWNLOADS & STORAGE", title: "Stored on this device", subtitle: "Review local storage without deleting cloud content." },
  safety: { kicker: "SAFETY & CONNECTIONS", title: "Your boundaries", subtitle: "Control invitations and review blocked accounts." },
  support: { kicker: "HELP & ABOUT", title: "Support Canal", subtitle: "Get help, share safe diagnostics and review this build." },
  account: { kicker: "SESSION & ACCOUNT", title: "Account actions", subtitle: "Session actions remain separate from cloud data deletion." },
};

export default function SettingsPreferencesScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = Object.prototype.hasOwnProperty.call(SECTION_COPY, params.section ?? "") ? params.section as Section : "playback";
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_CANAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [storageCopy, setStorageCopy] = useState("Calculating local storage…");
  const [message, setMessage] = useState("");

  useEffect(() => { let active = true; if (!user) { setLoading(false); return () => { active = false; }; } void readAccountCanalSettings(user.id).then((value) => { if (active) setSettings(value); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user]);
  useEffect(() => { if (section !== "storage") return; void getCanalStorageSummary().then((summary) => setStorageCopy(`${summary.keyCount} Canal records · approximately ${Math.max(1, Math.round(summary.estimatedCharacters / 1024))} KB of indexed local data`)).catch(() => setStorageCopy("Storage summary is temporarily unavailable.")); }, [section]);

  const update = async <K extends keyof CanalSettings>(key: K, value: CanalSettings[K]): Promise<void> => {
    if (!user || saving) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next); setSaving(true); setMessage("");
    try { await saveAccountCanalSettings(user.id, next); if (next.interfaceHaptics) await Haptics.selectionAsync(); setMessage("Saved across your Canal account."); }
    catch { setSettings(previous); setMessage("Canal could not save that preference. The previous setting was restored."); }
    finally { setSaving(false); }
  };

  const performLogout = async (): Promise<void> => {
    if (loggingOut) return;
    setLoggingOut(true);
    setMessage("Logging out of this device…");

    try {
      const pending = await retryIncompleteAccountCleanup({ allowSignOut: true });
      let result = pending ?? await logoutAllMusicPlatforms();

      if (
        pending &&
        !result.signedOut &&
        !result.cleanupIncomplete &&
        result.recovery === "none"
      ) {
        result = await logoutAllMusicPlatforms();
      }

      if (!result.signedOut) {
        setMessage(
          result.recovery === "signout"
            ? "Spotify is disconnected. Retry to finish logging out of Canal on this device."
            : "Device cleanup needs attention before Canal can finish logging out.",
        );
        return;
      }

      router.replace("/login");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Canal could not finish logging out. Retry without refreshing the page.",
      );
    } finally {
      setLoggingOut(false);
    }
  };

  const requestLogout = (): void => {
    if (loggingOut) return;

    const message = "This disconnects Spotify on this device. Cloud data remains intact.";

    if (Platform.OS === "web") {
      const confirm = (globalThis as typeof globalThis & {
        confirm?: (prompt: string) => boolean;
      }).confirm;

      if (typeof confirm === "function" && confirm(`Log out of Canal?\n\n${message}`)) {
        void performLogout();
      }
      return;
    }

    CanalAlert.alert(
      "Log out of Canal?",
      message,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: () => { void performLogout(); } },
      ],
    );
  };
  const copy = SECTION_COPY[section];
  return <SafeAreaView edges={["top"]} style={styles.screen}><CanalAmbientBackground /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <Pressable accessibilityLabel="Back to Settings" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/settings")} style={styles.back}><Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} /></Pressable>
    <View style={styles.header}><Text style={styles.kicker}>{copy.kicker}</Text><Text accessibilityRole="header" style={styles.title}>{copy.title}</Text><Text style={styles.subtitle}>{copy.subtitle}</Text></View>
    {loading ? <ActivityIndicator color={canalDynamicColors.mint} /> : <SectionContent loggingOut={loggingOut} requestLogout={requestLogout} section={section} settings={settings} storageCopy={storageCopy} update={update} />}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {saving ? <ActivityIndicator color={canalDynamicColors.mint} /> : null}
  </ScrollView></SafeAreaView>;
}

function SectionContent(props: { loggingOut: boolean; requestLogout: () => void; section: Section; settings: CanalSettings; storageCopy: string; update: <K extends keyof CanalSettings>(key: K, value: CanalSettings[K]) => Promise<void> }): React.JSX.Element {
  const s = props.settings;
  if (props.section === "playback") return <View><Toggle label="True Black playback" note="Use a pure black canvas in Now Playing while preserving artwork and readable controls." value={s.trueBlackPlayback} onChange={(v) => props.update("trueBlackPlayback", v)} /><Toggle label="Allow explicit tracks" note="Default for newly created Scenes." value={s.allowExplicitDefault} onChange={(v) => props.update("allowExplicitDefault", v)} /><Toggle label="Smooth transitions" note="Prefer compatible energy changes between tracks." value={s.smoothTransitionsDefault} onChange={(v) => props.update("smoothTransitionsDefault", v)} /><Toggle label="Avoid recently used tracks" note="Increase variety across newly generated Scenes." value={s.avoidRecentDefault} onChange={(v) => props.update("avoidRecentDefault", v)} /><Toggle label="Smart Spotify synchronization" note="Refresh the cached library after reconnecting while minimizing provider requests." value={s.smartSpotifySync} onChange={(v) => props.update("smartSpotifySync", v)} /></View>;
  if (props.section === "notifications") return <View><Toggle label="Stage invitations" note="Direct and collaborator invitations." value={s.stageInviteNotifications} onChange={(v) => props.update("stageInviteNotifications", v)} /><Toggle label="Stage reminders" note="Stages you host or joined starting soon." value={s.stageReminderNotifications} onChange={(v) => props.update("stageReminderNotifications", v)} /><Toggle label="Social activity" note="Follows, likes, comments and replies." value={s.socialNotifications} onChange={(v) => props.update("socialNotifications", v)} /><Toggle label="Scene collaboration" note="Edits, requests and contribution status." value={s.collaborationNotifications} onChange={(v) => props.update("collaborationNotifications", v)} /></View>;
  if (props.section === "accessibility") return <View><Toggle label="Follow Reduce Motion" note="Simplify atmospheric and sheet animations when enabled on the device." value={s.followReduceMotion} onChange={(v) => props.update("followReduceMotion", v)} /><Toggle label="Interface haptics" note="Subtle confirmation for supported actions." value={s.interfaceHaptics} onChange={(v) => props.update("interfaceHaptics", v)} /><Action label="Open iPhone text and contrast settings" onPress={() => { void Linking.openSettings(); }} /></View>;
  if (props.section === "learning") return <View><View style={styles.info}><Text style={styles.infoTitle}>Song DNA beta</Text><Text style={styles.infoText}>Apple Music, Spotify, Genius and privacy-protected Scene consensus shape genre and mood classification.</Text></View><Toggle label="Use recommendation learning" note="Apply explicit Likes, Dislikes, swaps, skips and replay feedback." value={s.songLearningEnabled} onChange={(v) => props.update("songLearningEnabled", v)} /><Text style={styles.groupLabel}>TEMPORARY DISLIKE WINDOW</Text><View style={styles.days}>{([7, 14, 30, 60] as const).map((days) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: s.dislikeWindowDays === days }} key={days} onPress={() => void props.update("dislikeWindowDays", days)} style={[styles.day, s.dislikeWindowDays === days && styles.daySelected]}><Text style={styles.dayText}>{days} days</Text></Pressable>)}</View></View>;
  if (props.section === "storage") return <View><View style={styles.info}><Text style={styles.infoTitle}>Local storage</Text><Text style={styles.infoText}>{props.storageCopy}</Text></View><Action label="Open full Data Controls" onPress={() => router.push("/data-controls")} /><Action label="Review Spotify cache and sync" onPress={() => router.push("/music-services")} /></View>;
  if (props.section === "safety") return <View><Toggle label="Collaboration invitations" note="Allow friends to invite you into Scenes and Stages." value={s.collaborationInvites} onChange={(v) => props.update("collaborationInvites", v)} /><Action label="Review blocked accounts" onPress={() => router.push("/blocked-users")} /></View>;
  if (props.section === "support") return <View><Action label="Email Canal support" onPress={() => { void Linking.openURL("mailto:support@canal.app?subject=Canal%20support"); }} /><Action label="Share safe diagnostics" onPress={() => { void Share.share({ title: "Canal diagnostics", message: "Canal 1.0.0 · Expo SDK 54 · no credentials included" }); }} /><View style={styles.info}><Text style={styles.infoTitle}>Canal 1.0.0</Text><Text style={styles.infoText}>Expo SDK 54 · Privacy and provider acknowledgements live in Data Controls.</Text></View></View>;
  return <View><Action busy={props.loggingOut} disabled={props.loggingOut} label={props.loggingOut ? "Logging out…" : "Log out of this device"} onPress={props.requestLogout} /><Action label="Permanently delete account" onPress={() => router.push("/delete-account")} danger /></View>;
}

function Toggle(props: { label: string; note: string; value: boolean; onChange: (value: boolean) => void }): React.JSX.Element { return <View style={styles.control}><View style={styles.controlCopy}><Text style={styles.controlTitle}>{props.label}</Text><Text style={styles.controlNote}>{props.note}</Text></View><Switch accessibilityLabel={props.label} onValueChange={props.onChange} trackColor={{ false: canalDynamicColors.line, true: canalDynamicColors.mint }} value={props.value} /></View>; }
function Action(props: { label: string; onPress: () => void; busy?: boolean; danger?: boolean; disabled?: boolean }): React.JSX.Element { return <Pressable accessibilityLabel={props.label} accessibilityRole="button" accessibilityState={{ busy: props.busy === true, disabled: props.disabled === true }} disabled={props.disabled} onPress={props.onPress} style={({ pressed }) => [styles.action, props.danger && styles.actionDanger, props.disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.actionText, props.danger && styles.dangerText]}>{props.label}</Text><Ionicons color={props.danger ? canalDynamicColors.danger : canalDynamicColors.text} name="chevron-forward" size={18} /></Pressable>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "transparent" }, content: { paddingHorizontal: 18, paddingBottom: 120, gap: 18 }, back: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, header: { gap: 6 }, kicker: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 34 }, subtitle: { color: canalDynamicColors.muted, fontSize: 14, lineHeight: 20 }, control: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: canalDynamicColors.line, paddingVertical: 9 }, controlCopy: { flex: 1 }, controlTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" }, controlNote: { color: canalDynamicColors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, info: { padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: canalDynamicColors.surface, gap: 5, marginBottom: 10 }, infoTitle: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "900" }, infoText: { color: canalDynamicColors.muted, fontSize: 12, lineHeight: 17 }, action: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: canalDynamicColors.line, paddingHorizontal: 3 }, actionDanger: { borderBottomColor: canalDynamicColors.danger }, actionText: { flex: 1, color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" }, dangerText: { color: canalDynamicColors.danger }, groupLabel: { color: canalDynamicColors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 14 }, days: { flexDirection: "row", gap: 7, marginTop: 9 }, day: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: canalDynamicColors.line }, daySelected: { borderColor: canalDynamicColors.mint, backgroundColor: canalDynamicColors.surface }, dayText: { color: canalDynamicColors.text, fontSize: 11, fontWeight: "800" }, message: { color: canalDynamicColors.mint, fontSize: 12, lineHeight: 17, textAlign: "center" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.62 } });
