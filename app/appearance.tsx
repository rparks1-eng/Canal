import {
  Ionicons,
} from "@expo/vector-icons";

import {
  router,
} from "expo-router";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  CanalAmbientBackground,
} from "../components/canal-ui/canal-ambient-background";

import {
  useCanalAppearance,
} from "../theme/canal-appearance";

import type {
  CanalAppearanceMode,
} from "../theme/canal-appearance";

import {
  canalDynamicColors,
} from "../theme/canal-dynamic-colors";

const OPTIONS: readonly {
  mode: CanalAppearanceMode;
  label: string;
  description: string;
  icon: "sunny-outline" | "moon-outline" | "phone-portrait-outline";
}[] = [
  {
    mode: "system",
    label: "System",
    description: "Match your iPhone’s current appearance.",
    icon: "phone-portrait-outline",
  },
  {
    mode: "light",
    label: "Light",
    description: "Warm editorial paper with dark, high-contrast type.",
    icon: "sunny-outline",
  },
  {
    mode: "dark",
    label: "Dark",
    description: "Deep studio surfaces with warm, readable type.",
    icon: "moon-outline",
  },
];

function safeBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/settings");
}

export default function AppearanceScreen() {
  const { mode, setMode } = useCanalAppearance();

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <CanalAmbientBackground />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Pressable
          accessibilityLabel="Back to Settings"
          accessibilityRole="button"
          onPress={safeBack}
          style={styles.back}
        >
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={25} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.kicker}>APPEARANCE</Text>
          <Text accessibilityRole="header" style={styles.title}>Choose your light</Text>
          <Text style={styles.subtitle}>
            Canal keeps text, controls, and status colors readable in every mode.
          </Text>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((option) => {
            const selected = option.mode === mode;

            return (
              <Pressable
                key={option.mode}
                accessibilityLabel={`${option.label} appearance`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void setMode(option.mode)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.icon, selected && styles.iconSelected]}>
                  <Ionicons
                    color={selected ? canalDynamicColors.onAccent : canalDynamicColors.text}
                    name={option.icon}
                    size={22}
                  />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                <Ionicons
                  color={selected ? canalDynamicColors.mint : canalDynamicColors.muted}
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={23}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewKicker}>LIVE PREVIEW</Text>
          <Text style={styles.previewTitle}>A room full of sound</Text>
          <Text style={styles.previewBody}>
            Primary and secondary text retain accessible contrast while the surface changes.
          </Text>
          <View style={styles.previewAction}>
            <Text style={styles.previewActionText}>Create a Scene</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { gap: 22, paddingHorizontal: 20, paddingBottom: 120 },
  back: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  header: { gap: 7 },
  kicker: { color: canalDynamicColors.mint, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, lineHeight: 42 },
  subtitle: { color: canalDynamicColors.muted, fontSize: 16, lineHeight: 23 },
  options: { gap: 11 },
  option: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: canalDynamicColors.line, borderRadius: 20, backgroundColor: canalDynamicColors.surface, padding: 14 },
  optionSelected: { borderColor: canalDynamicColors.mint },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: canalDynamicColors.elevated },
  iconSelected: { backgroundColor: canalDynamicColors.mint },
  optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: canalDynamicColors.text, fontSize: 17, fontWeight: "900" },
  optionDescription: { color: canalDynamicColors.muted, fontSize: 13, lineHeight: 18 },
  preview: { gap: 10, borderRadius: 25, backgroundColor: canalDynamicColors.surface, padding: 20 },
  previewKicker: { color: canalDynamicColors.lavender, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  previewTitle: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 27 },
  previewBody: { color: canalDynamicColors.muted, fontSize: 15, lineHeight: 22 },
  previewAction: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: canalDynamicColors.mint, marginTop: 5 },
  previewActionText: { color: canalDynamicColors.onAccent, fontSize: 15, fontWeight: "900" },
});
