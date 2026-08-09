import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import {
  canalDynamicColors,
} from "../../theme/canal-dynamic-colors";

import type {
  GeniusContextResponse,
} from "../../lib/genius-context-contract";

export type LinerNotesTrack = {
  title: string;
  artist: string;
  album?: string;
};

type LinerNotesOverlayProps = {
  visible: boolean;
  track: LinerNotesTrack | null;
  onClose: () => void;
  context?: GeniusContextResponse | null;
  state?: "ready" | "loading" | "empty" | "error" | "offline";
  onRetry?: () => void;
};

export function LinerNotesAction(props: {
  onPress: () => void;
  compact?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel="Open song context"
      accessibilityHint="Shows liner notes, credits, and Genius context"
      accessibilityRole="button"
      hitSlop={8}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.contextAction,
        props.compact && styles.contextActionCompact,
        props.style,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.contextActionIcon}>▤</Text>
      {!props.compact ? (
        <Text style={styles.contextActionLabel}>{props.label ?? "Song context"}</Text>
      ) : null}
    </Pressable>
  );
}

export function LinerNotesOverlay({
  visible,
  track,
  onClose,
  context,
  state = "ready",
  onRetry,
}: LinerNotesOverlayProps): React.JSX.Element | null {
  const [fullNotes, setFullNotes] = useState(false);
  const translateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (!visible) {
      setFullNotes(false);
      translateY.setValue(28);
      return;
    }

    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      Animated.timing(translateY, {
        duration: reduceMotion ? 0 : 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      active = false;
      translateY.stopAnimation();
    };
  }, [translateY, visible]);

  if (!track) return null;

  const song = context?.song;
  const actionsDisabled = state !== "ready" || !song;
  const actionUnavailableHint =
    state === "empty" || !song
      ? "Unavailable because Genius did not return a canonical match."
      : "Unavailable until song context is ready.";
  const openGenius = (): void => {
    if (song?.geniusUrl) {
      void Linking.openURL(song.geniusUrl);
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close song context"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.eyebrow}>
                {fullNotes ? "LINER NOTES" : "QUICK CONTEXT"}
              </Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.artist}>{track.artist}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close song context"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent}>
            {state === "loading" ? (
              <StateCard title="Loading song context" body="Asking Genius for recording details…" />
            ) : state === "offline" ? (
              <StateCard title="You’re offline" body="Reconnect to load fresh Genius context." onRetry={onRetry} />
            ) : state === "error" ? (
              <StateCard title="Context unavailable" body="Canal could not load this song’s context safely." onRetry={onRetry} />
            ) : state === "empty" || !song ? (
              <StateCard
                title="No context found"
                body="Genius didn’t return a confident match for this track. Choose another track to view song context."
              />
            ) : (
              <>
                <View style={styles.matchRow}>
                  <Text style={styles.matchLabel}>MATCH</Text>
                  <Text style={styles.matchValue}>
                    {song.matchConfidence === "provider-id" ? "Verified ID" : song.matchConfidence === "exact" ? "Exact" : "Likely"}
                  </Text>
                </View>

                <Section title="Story">
                  <Text style={styles.body}>
                    {song.description ?? "No provider story is available for this recording yet."}
                  </Text>
                </Section>

                <Section title="Credits">
                  {song.credits.length ? song.credits.map((credit) => (
                    <View key={`${credit.label}-${credit.names.join("-")}`} style={styles.creditRow}>
                      <Text style={styles.creditLabel}>{credit.label}</Text>
                      <Text style={styles.creditNames}>{credit.names.join(", ")}</Text>
                    </View>
                  )) : <Text style={styles.body}>No credits are available.</Text>}
                </Section>

                {fullNotes ? (
                  <>
                    <Section title="Notes">
                      {song.annotations.length ? song.annotations.map((annotation) => (
                        <View key={annotation.id} style={styles.annotationCard}>
                          <Text style={styles.annotationBadge}>
                            {annotation.verified ? "VERIFIED NOTE" : "COMMUNITY NOTE"}
                          </Text>
                          <Text style={styles.body}>{annotation.body}</Text>
                        </View>
                      )) : <Text style={styles.body}>No annotations are available.</Text>}
                    </Section>

                    <Section title="Creative links">
                      {song.links.map((link) => (
                        <Pressable
                          accessibilityRole="link"
                          key={`${link.label}-${link.url}`}
                          onPress={() => void Linking.openURL(link.url)}
                          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
                        >
                          <Text style={styles.linkText}>{link.label}</Text>
                          <Text style={styles.linkArrow}>↗</Text>
                        </Pressable>
                      ))}
                    </Section>
                  </>
                ) : null}
              </>
            )}
          </ScrollView>

          <Text style={styles.attribution}>
            {context?.attribution.label ?? "Song context from Genius"}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityHint={
                actionsDisabled
                  ? actionUnavailableHint
                  : "Opens the canonical song page on Genius."
              }
              accessibilityLabel="Open song on Genius"
              accessibilityRole="button"
              accessibilityState={{ disabled: actionsDisabled }}
              disabled={actionsDisabled}
              onPress={openGenius}
              style={({ pressed }) => [styles.secondaryButton, actionsDisabled && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Open Genius</Text>
            </Pressable>
            <Pressable
              accessibilityHint={
                actionsDisabled
                  ? actionUnavailableHint
                  : "Shows the full available story, credits, notes, and links."
              }
              accessibilityLabel={fullNotes ? "Show quick song context" : "Show full liner notes"}
              accessibilityRole="button"
              accessibilityState={{ disabled: actionsDisabled }}
              disabled={actionsDisabled}
              onPress={() => setFullNotes((current) => !current)}
              style={({ pressed }) => [styles.primaryButton, actionsDisabled && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>
                {fullNotes ? "Quick context" : "Full liner notes"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function StateCard(props: { title: string; body: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.stateCard}>
      <Text style={styles.stateTitle}>{props.title}</Text>
      <Text style={styles.body}>{props.body}</Text>
      {props.onRetry ? (
        <Pressable
          accessibilityLabel="Try loading song context again"
          accessibilityRole="button"
          onPress={props.onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(18, 15, 12, 0.56)", justifyContent: "flex-end" },
  sheet: { backgroundColor: canalDynamicColors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: "88%", paddingBottom: 16, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } },
  handle: { alignSelf: "center", backgroundColor: canalDynamicColors.line, borderRadius: 2, height: 4, marginTop: 10, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12, paddingHorizontal: 22, paddingBottom: 12, paddingTop: 16 },
  sheetHeaderCopy: { flex: 1 },
  eyebrow: { color: canalDynamicColors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 29, fontWeight: "700", marginTop: 5 },
  artist: { color: canalDynamicColors.muted, fontSize: 15, marginTop: 2 },
  closeButton: { alignItems: "center", backgroundColor: canalDynamicColors.elevated, borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  closeText: { color: canalDynamicColors.text, fontSize: 29, lineHeight: 31 },
  sheetContent: { gap: 16, paddingBottom: 16, paddingHorizontal: 22 },
  matchRow: { alignItems: "center", alignSelf: "flex-start", backgroundColor: canalDynamicColors.successSurface, borderRadius: 999, flexDirection: "row", gap: 8, minHeight: 36, paddingHorizontal: 12 },
  matchLabel: { color: canalDynamicColors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  matchValue: { color: canalDynamicColors.text, fontSize: 13, fontWeight: "800" },
  section: { borderTopColor: canalDynamicColors.line, borderTopWidth: 1, gap: 10, paddingTop: 16 },
  sectionTitle: { color: canalDynamicColors.mint, fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  body: { color: canalDynamicColors.text, fontSize: 16, lineHeight: 24 },
  creditRow: { flexDirection: "row", gap: 14, justifyContent: "space-between" },
  creditLabel: { color: canalDynamicColors.muted, flex: 1, fontSize: 14 },
  creditNames: { color: canalDynamicColors.text, flex: 1.4, fontSize: 14, fontWeight: "700", textAlign: "right" },
  annotationCard: { backgroundColor: canalDynamicColors.elevated, borderColor: canalDynamicColors.line, borderRadius: 18, borderWidth: 1, gap: 7, padding: 16 },
  annotationBadge: { color: canalDynamicColors.lavender, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  linkRow: { alignItems: "center", borderBottomColor: canalDynamicColors.line, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52 },
  linkText: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "700" },
  linkArrow: { color: canalDynamicColors.mint, fontSize: 18 },
  stateCard: { backgroundColor: canalDynamicColors.elevated, borderColor: canalDynamicColors.line, borderRadius: 18, borderWidth: 1, gap: 6, padding: 18 },
  stateTitle: { color: canalDynamicColors.text, fontSize: 18, fontWeight: "800" },
  retryButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: canalDynamicColors.elevated, borderRadius: 14, justifyContent: "center", marginTop: 6, minHeight: 48, paddingHorizontal: 16 },
  retryText: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" },
  attribution: { color: canalDynamicColors.muted, fontSize: 11, marginHorizontal: 22, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#2E294A", borderRadius: 16, flex: 1.25, justifyContent: "center", minHeight: 52, paddingHorizontal: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryButton: { alignItems: "center", backgroundColor: canalDynamicColors.elevated, borderRadius: 16, flex: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 14 },
  secondaryButtonText: { color: canalDynamicColors.text, fontSize: 14, fontWeight: "800" },
  contextAction: { alignItems: "center", alignSelf: "flex-start", backgroundColor: canalDynamicColors.elevated, borderRadius: 14, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  contextActionCompact: { borderRadius: 24, minWidth: 48, paddingHorizontal: 0, width: 48 },
  contextActionIcon: { color: canalDynamicColors.mint, fontSize: 20, fontWeight: "900" },
  contextActionLabel: { color: canalDynamicColors.text, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.46 },
});
