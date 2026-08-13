import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
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
import { SafeAreaView } from "react-native-safe-area-context";

type IoniconName =
  keyof typeof Ionicons.glyphMap;

export default function HelpScreen() {
  return (
    <SafeAreaView
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={
          styles.page
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.backText}
            >
              ‹ You
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Help
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View style={styles.hero}>
          <View
            style={styles.heroIcon}
          >
            <Ionicons
              name="help-circle-outline"
              size={43}
              color={canalDynamicColors.lavender}
            />
          </View>

          <Text style={styles.eyebrow}>
            CANAL GUIDE
          </Text>

          <Text style={styles.heading}>
            How Canal works.
          </Text>

          <Text
            style={styles.description}
          >
            Learn the main Canal terms
            and jump directly into each
            feature.
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Core features
          </Text>

          <View style={styles.helpCard}>
            <HelpRow
              number="01"
              icon="sparkles-outline"
              title="Scenes"
              description="A Scene is a generated or curated music experience built around a moment, mood, activity, and group."
              action="Create a Scene"
              onPress={() =>
                router.push(
                  "/scene-studio",
                )
              }
            />

            <Divider />

            <HelpRow
              number="02"
              icon="radio-outline"
              title="Stages"
              description="A Stage is a live collaboration space where people build and experience music together."
              action="Open Live"
              onPress={() =>
                router.replace(
                  "/(tabs)/live",
                )
              }
            />

            <Divider />

            <HelpRow
              number="03"
              icon="person-circle-outline"
              title="Soundscape"
              description="Your Soundscape is your music identity, including genres, favorite artists, and saved Snapshots."
              action="Open Soundscape"
              onPress={() =>
                router.push(
                  "/soundscape",
                )
              }
            />

            <Divider />

            <HelpRow
              number="04"
              icon="camera-outline"
              title="Snapshots"
              description="A Snapshot saves a track and the surrounding Scene or Stage mood as a shareable moment."
              action="View Snapshots"
              onPress={() =>
                router.push(
                  "/snapshots",
                )
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Common actions
          </Text>

          <View style={styles.helpCard}>
            <SimpleHelpRow
              icon="musical-notes-outline"
              title="Connect a music service"
              description="Open You, choose Music Services, and connect Apple Music or Spotify. Canal uses every connected library for Scene generation, song search, and provider playlist export."
            />

            <Divider />

            <SimpleHelpRow
              icon="people-outline"
              title="Collaborate"
              description="Create a Stage or add collaborators during Scene creation. A six-digit Stage code can be shared with others."
            />

            <Divider />

            <SimpleHelpRow
              icon="share-social-outline"
              title="Share"
              description="Public Scenes and Soundscapes can be shared. Owners can also directly share their private Scenes from their own Library."
            />

            <Divider />

            <SimpleHelpRow
              icon="lock-closed-outline"
              title="Privacy"
              description="Use public and private visibility controls on Scenes, Snapshots, and your Soundscape."
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Troubleshooting
          </Text>

          <View style={styles.helpCard}>
            <SimpleHelpRow
              icon="refresh-outline"
              title="A screen looks outdated"
              description="Return to the previous screen and open it again. Most Canal screens refresh whenever they receive focus."
            />

            <Divider />

            <SimpleHelpRow
              icon={"logo-spotify" as IoniconName}
              title="Spotify stopped working"
              description="Open Music Services, disconnect Spotify, and connect again. You can also clear Spotify cache from Settings."
            />

            <Divider />

            <SimpleHelpRow
              icon="bug-outline"
              title="The app will not compile"
              description="Run npx tsc --noEmit first. Then restart Expo with npx expo start --clear."
            />
          </View>
        </View>

        <View
          style={styles.buttonStack}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/search",
              )
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={canalDynamicColors.text}
            />

            <Text
              style={
                styles.primaryButtonText
              }
            >
              Search Canal
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/settings",
              )
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Open Settings
            </Text>
          </Pressable>
        </View>

        <View style={styles.noteCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={canalDynamicColors.lavender}
          />

          <Text style={styles.noteText}>
            Canal is currently a local
            prototype. Multi-device
            accounts, server-backed
            collaboration, messaging,
            and hosted share links
            require a production
            backend.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HelpRow({
  number,
  icon,
  title,
  description,
  action,
  onPress,
}: {
  number: string;
  icon: IoniconName;
  title: string;
  description: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.helpRow}>
      <View
        style={styles.numberBox}
      >
        <Text
          style={styles.numberText}
        >
          {number}
        </Text>
      </View>

      <View
        style={
          styles.helpInformation
        }
      >
        <View
          style={styles.titleRow}
        >
          <Ionicons
            name={icon}
            size={20}
            color={canalDynamicColors.lavender}
          />

          <Text
            style={styles.helpTitle}
          >
            {title}
          </Text>
        </View>

        <Text
          style={styles.helpText}
        >
          {description}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.inlineAction,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.inlineActionText
            }
          >
            {action}
          </Text>

          <Ionicons
            name="arrow-forward"
            size={15}
            color={canalDynamicColors.lavender}
          />
        </Pressable>
      </View>
    </View>
  );
}

function SimpleHelpRow({
  icon,
  title,
  description,
}: {
  icon: IoniconName;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.simpleRow}>
      <View
        style={styles.simpleIcon}
      >
        <Ionicons
          name={icon}
          size={21}
          color={canalDynamicColors.lavender}
        />
      </View>

      <View
        style={
          styles.helpInformation
        }
      >
        <Text
          style={styles.helpTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.helpText}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.divider} />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },

  page: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 42,
    gap: 23,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 80,
    minHeight: 48,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 80,
  },

  backText: {
    color: canalDynamicColors.muted,
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  hero: {
    alignItems: "center",
  },

  heroIcon: {
    width: 105,
    height: 105,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 35,
    backgroundColor: canalDynamicColors.surface,
  },

  eyebrow: {
    marginTop: 17,
    color: canalDynamicColors.lavender,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heading: {
      fontFamily: "Georgia",
    marginTop: 8,
    color: canalDynamicColors.text,
    fontSize: 29,
    fontWeight: "700",
    textAlign: "center",
  },

  description: {
    maxWidth: 345,
    marginTop: 10,
    color: canalDynamicColors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  section: {
    gap: 11,
  },

  sectionTitle: {
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  helpCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9D3C8",
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  helpRow: {
    flexDirection: "row",
    padding: 16,
  },

  numberBox: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 13,
    backgroundColor: canalDynamicColors.surface,
  },

  numberText: {
    color: canalDynamicColors.lavender,
    fontSize: 10,
    fontWeight: "900",
  },

  helpInformation: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  helpTitle: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  helpText: {
    marginTop: 6,
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 17,
  },

  inlineAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    minHeight: 48,
    paddingHorizontal: 4,
  },

  inlineActionText: {
    color: canalDynamicColors.lavender,
    fontSize: 11,
    fontWeight: "800",
  },

  simpleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
  },

  simpleIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 14,
    backgroundColor: canalDynamicColors.surface,
  },

  divider: {
    height: 1,
    marginLeft: 16,
    backgroundColor: "#D9D3C8",
  },

  buttonStack: {
    gap: 10,
  },

  primaryButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 17,
    backgroundColor: "#4C46C8",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 16,
    backgroundColor: canalDynamicColors.surface,
  },

  secondaryButtonText: {
    color: canalDynamicColors.lavender,
    fontSize: 13,
    fontWeight: "700",
  },

  noteCard: {
    flexDirection: "row",
    gap: 11,
    padding: 15,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  noteText: {
    flex: 1,
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 17,
  },

  pressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.99,
      },
    ],
  },
});
