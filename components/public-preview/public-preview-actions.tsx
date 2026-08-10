import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { rememberDeferredDestination } from "../../lib/deferred-destination";

export function PublicPreviewActions({
  signedIn,
  primaryLabel,
  onPrimary,
  destination,
}: {
  signedIn: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  destination: string;
}) {
  if (signedIn) {
    return (
      <Pressable accessibilityRole="button" onPress={onPrimary} style={styles.primary}>
        <Text style={styles.primaryText}>{primaryLabel}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={() => void continueToAuth("sign-in")} style={styles.primary}>
        <Text style={styles.primaryText}>Sign in to Canal</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void continueToAuth("create-account")} style={styles.secondary}>
        <Text style={styles.secondaryText}>Create account</Text>
      </Pressable>
    </View>
  );

  async function continueToAuth(mode: "sign-in" | "create-account"): Promise<void> {
    const remembered = await rememberDeferredDestination(destination);
    if (!remembered) return;
    router.push(mode === "sign-in" ? "/login" : { pathname: "/login", params: { mode } });
  }
}

const styles = StyleSheet.create({
  row: { gap: 10 },
  primary: { alignItems: "center", backgroundColor: "#DFFFF7", borderRadius: 16, justifyContent: "center", minHeight: 48, paddingHorizontal: 20 },
  primaryText: { color: "#153F50", fontSize: 15, fontWeight: "900" },
  secondary: { alignItems: "center", borderRadius: 16, justifyContent: "center", minHeight: 48, paddingHorizontal: 20 },
  secondaryText: { color: "#D8FFF6", fontSize: 15, fontWeight: "800" },
});
