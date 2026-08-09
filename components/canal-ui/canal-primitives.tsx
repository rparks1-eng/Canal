import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReactNode } from "react";

import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { getCanalColors } from "../../theme/canal-colors";
import { canalSpacing } from "../../theme/canal-spacing";
import { canalTypography } from "../../theme/canal-typography";

type Children = { children: ReactNode };

export function useCanalReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (value) => {
        if (mounted) setEnabled(value);
      },
    );
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export function CanalScreen({ children }: Children) {
  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.screenContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function EditorialHeader(props: {
  kicker?: string;
  title: string;
  description?: string;
}) {
  const colors = getCanalColors(useColorScheme());

  return (
    <View style={styles.header}>
      {props.kicker ? <Text style={[canalTypography.meta, { color: colors.muted }]}>{props.kicker}</Text> : null}
      <Text accessibilityRole="header" style={[canalTypography.display, { color: colors.ink }]}>{props.title}</Text>
      {props.description ? <Text style={[canalTypography.body, { color: colors.muted }]}>{props.description}</Text> : null}
    </View>
  );
}

export function CanalGlassNav(props: Children & { reduceTransparency?: boolean }) {
  const colors = getCanalColors(useColorScheme());
  const systemReduceTransparency = useCanalReduceTransparency();
  const reduceTransparency =
    systemReduceTransparency ||
    props.reduceTransparency === true;
  return <View testID="canal-glass-nav" style={[styles.glassNav, { backgroundColor: reduceTransparency ? colors.elevated : colors.glass, borderColor: colors.line }]}>{props.children}</View>;
}

export function CanalButton(props: {
  label: string;
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  tone?: "primary" | "secondary" | "quiet";
  canInteract?: () => boolean;
}) {
  const colors = getCanalColors(useColorScheme());
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const tone = props.tone ?? "primary";
  const primary = tone === "primary";
  const busy = Boolean(props.busy || inFlight);
  const disabled = Boolean(!props.onPress || props.disabled || busy || props.canInteract?.() === false);
  const backgroundColor = primary ? colors.ink : tone === "quiet" ? "transparent" : colors.elevated;
  const color = primary ? colors.page : colors.ink;
  const handlePress = async (): Promise<void> => {
    if (inFlightRef.current || disabled || !props.onPress || props.canInteract?.() === false) return;
    inFlightRef.current = true;
    setInFlight(true);
    try {
      await props.onPress();
      if (props.canInteract?.() === false) return;
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setInFlight(false);
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={handlePress} style={({ pressed }) => [styles.button, { backgroundColor, borderColor: primary ? "transparent" : colors.line, opacity: disabled ? 0.48 : pressed ? 0.8 : 1 }]}><Text style={[canalTypography.chrome, { color }]}>{props.label}</Text></Pressable>;
}

export function CanalChip(props: { label: string; selected?: boolean; onPress?: () => void | Promise<void>; disabled?: boolean; busy?: boolean; canInteract?: () => boolean }) {
  const colors = getCanalColors(useColorScheme());
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const busy = Boolean(props.busy || inFlight);
  const disabled = Boolean(!props.onPress || props.disabled || busy || props.canInteract?.() === false);
  const handlePress = async (): Promise<void> => {
    if (inFlightRef.current || disabled || !props.onPress || props.canInteract?.() === false) return;
    inFlightRef.current = true;
    setInFlight(true);
    try {
      await props.onPress();
      if (props.canInteract?.() === false) return;
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setInFlight(false);
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ selected: Boolean(props.selected), disabled, busy }} disabled={disabled} onPress={handlePress} style={[styles.chip, { backgroundColor: props.selected ? colors.ink : colors.elevated, borderColor: props.selected ? colors.ink : colors.line, opacity: disabled ? 0.48 : 1 }]}><Text style={[canalTypography.chrome, { color: props.selected ? colors.page : colors.ink }]}>{props.selected ? "✓ " : ""}{props.label}</Text></Pressable>;
}

export function SceneTrackRow(props: { title: string; artist: string; index?: number; artwork?: ReactNode; actionLabel?: string; onAction?: () => void }) {
  const colors = getCanalColors(useColorScheme());
  return <View style={[styles.trackRow, { borderColor: colors.line }]}><Text style={[styles.trackIndex, { color: colors.muted }]}>{props.index ?? "•"}</Text><View style={[styles.artwork, { backgroundColor: colors.accent }]}>{props.artwork}</View><View style={styles.trackCopy}><Text numberOfLines={1} style={[canalTypography.chrome, { color: colors.ink }]}>{props.title}</Text><Text numberOfLines={1} style={[canalTypography.body, { color: colors.muted }]}>{props.artist}</Text></View>{props.actionLabel ? <CanalButton label={props.actionLabel} onPress={props.onAction} tone="quiet" /> : null}</View>;
}

export function CanalMediaFrame({ children }: Children) {
  const colors = getCanalColors(useColorScheme());
  return <View accessibilityElementsHidden={children == null} style={[styles.mediaFrame, { backgroundColor: colors.ink }]}>{children}</View>;
}

export function CanalStatus(props: { title: string; message: string; tone?: "info" | "success" | "warning" | "error" }) {
  const colors = getCanalColors(useColorScheme());
  const tone = props.tone ?? "info";
  const accent = tone === "error" ? colors.danger : tone === "success" ? colors.mint : tone === "warning" ? colors.gold : colors.accent;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.status, { backgroundColor: colors.elevated, borderColor: colors.line, borderLeftColor: accent }]}><Text style={[canalTypography.chrome, { color: colors.ink }]}>{props.title}</Text><Text style={[canalTypography.body, { color: colors.muted }]}>{props.message}</Text></View>;
}

export function CanalRecovery(props: { title: string; message: string; actionLabel: string; onAction?: () => void; busy?: boolean }) {
  return <View style={styles.stack}><CanalStatus title={props.title} message={props.message} tone="error" /><CanalButton label={props.actionLabel} onPress={props.onAction} busy={props.busy} tone="secondary" /></View>;
}

export function CanalError(props: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.stack}><CanalStatus title={props.title} message={props.message} tone="error" />{props.actionLabel ? <CanalButton label={props.actionLabel} onPress={props.onAction} tone="secondary" /> : null}</View>;
}

export function CanalSkeleton({ label = "Loading" }: { label?: string }) {
  const colors = getCanalColors(useColorScheme());
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.skeleton, { backgroundColor: colors.line }]} />;
}

export function CanalEmpty(props: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.stack}><EditorialHeader title={props.title} description={props.message} />{props.actionLabel ? <CanalButton label={props.actionLabel} onPress={props.onAction} /> : null}</View>;
}

export function CanalOffline(props: { message: string; onRetry?: () => void }) {
  return <CanalRecovery title="You’re offline" message={props.message} actionLabel="Try again" onAction={props.onRetry} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, screenContent: { flexGrow: 1, gap: canalSpacing.lg, padding: canalSpacing.lg }, header: { gap: canalSpacing.xs }, glassNav: { minHeight: 64, padding: canalSpacing.sm, borderWidth: 1, borderRadius: canalSpacing.radius.continuous, flexDirection: "row", alignItems: "center", justifyContent: "space-between", boxShadow: "0 14px 30px rgba(0,0,0,0.12)" }, button: { minHeight: canalSpacing.touchTarget, paddingHorizontal: canalSpacing.md, borderWidth: 1, borderRadius: canalSpacing.radius.field, justifyContent: "center", alignItems: "center" }, chip: { minHeight: canalSpacing.touchTarget, paddingHorizontal: canalSpacing.md, borderWidth: 1, borderRadius: canalSpacing.radius.capsule, justifyContent: "center", alignItems: "center" }, trackRow: { minHeight: 76, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: canalSpacing.sm }, trackIndex: { width: 20, textAlign: "center" }, artwork: { width: 48, height: 48, borderRadius: 8 }, trackCopy: { flex: 1, gap: 2 }, mediaFrame: { minHeight: 190, borderRadius: canalSpacing.radius.continuous, overflow: "hidden", justifyContent: "flex-end" }, status: { gap: canalSpacing.xs, padding: canalSpacing.md, borderWidth: 1, borderLeftWidth: 4, borderRadius: canalSpacing.radius.field }, stack: { gap: canalSpacing.sm }, skeleton: { height: 76, borderRadius: canalSpacing.radius.field },
});
