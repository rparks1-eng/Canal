import { Ionicons } from "@expo/vector-icons";
import {
  router,
} from "expo-router";
import {
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  shareCanalInvite,
} from "../lib/canal-invites";

export default function InviteFriendsScreen() {
  const [isSharing, setIsSharing] =
    useState(false);

  async function shareInvite() {
    try {
      setIsSharing(true);

      const result =
        await shareCanalInvite();

      if (
        result.method ===
        "clipboard"
      ) {
        Alert.alert(
          "Invite copied",
          "The Canal invite was copied to your clipboard.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share this invite.",
      );
    } finally {
      setIsSharing(false);
    }
  }

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
              ‹ Friends
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Invite Friends
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
              name="people-outline"
              size={43}
              color="#ff9a50"
            />
          </View>

          <Text style={styles.eyebrow}>
            GROW YOUR CANAL
          </Text>

          <Text style={styles.heading}>
            Music is better together.
          </Text>

          <Text
            style={styles.description}
          >
            Invite friends to build
            Scenes, join live Stages,
            and share their
            Soundscapes.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isSharing}
          onPress={() => {
            void shareInvite();
          }}
          style={({ pressed }) => [
            styles.shareButton,
            isSharing &&
              styles.disabled,
            pressed &&
              styles.pressed,
          ]}
        >
          {isSharing ? (
            <ActivityIndicator
              color="#17110c"
            />
          ) : (
            <>
              <Ionicons
                name="share-social-outline"
                size={21}
                color="#17110c"
              />

              <Text
                style={
                  styles.shareButtonText
                }
              >
                Share Canal Invite
              </Text>
            </>
          )}
        </Pressable>

        <View
          style={styles.optionsCard}
        >
          <OptionRow
            icon="radio-outline"
            title="Invite to a Stage"
            description="Start a live Stage, then share its six-digit code."
            onPress={() =>
              router.replace(
                "/(tabs)/live",
              )
            }
          />

          <View
            style={styles.divider}
          />

          <OptionRow
            icon="person-add-outline"
            title="Find people already here"
            description="Search Canal’s current public Soundscapes."
            onPress={() =>
              router.replace(
                "/friends",
              )
            }
          />

          <View
            style={styles.divider}
          />

          <OptionRow
            icon="share-social-outline"
            title="Share your Soundscape"
            description="Send your music identity to people outside Canal."
            onPress={() =>
              router.push(
                "/soundscape",
              )
            }
          />
        </View>

        <View style={styles.noteCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color="#ff9a50"
          />

          <Text style={styles.noteText}>
            This local prototype shares
            a formatted invitation.
            Cross-device Canal signup
            links will require the
            hosted app and backend.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon:
    keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={styles.optionIcon}
      >
        <Ionicons
          name={icon}
          size={22}
          color="#ff9a50"
        />
      </View>

      <View
        style={styles.optionCopy}
      >
        <Text
          style={styles.optionTitle}
        >
          {title}
        </Text>

        <Text
          style={
            styles.optionDescription
          }
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color="#717a73"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  page: {
    paddingHorizontal: 23,
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
    width: 90,
    minHeight: 44,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 90,
  },

  backText: {
    color: "#c5cbc6",
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  hero: {
    alignItems: "center",
  },

  heroIcon: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 37,
    backgroundColor: "#2b1d14",
  },

  eyebrow: {
    marginTop: 18,
    color: "#ff9a50",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heading: {
    marginTop: 8,
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },

  description: {
    maxWidth: 350,
    marginTop: 10,
    color: "#aeb6b0",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  shareButton: {
    minHeight: 57,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 18,
    backgroundColor: "#ff7a1a",
  },

  shareButtonText: {
    color: "#17110c",
    fontSize: 15,
    fontWeight: "800",
  },

  optionsCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 21,
    backgroundColor: "#171c19",
  },

  optionRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  optionIcon: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 15,
    backgroundColor: "#2b1d14",
  },

  optionCopy: {
    flex: 1,
    paddingRight: 9,
  },

  optionTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  optionDescription: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 11,
    lineHeight: 16,
  },

  divider: {
    height: 1,
    marginLeft: 71,
    backgroundColor: "#292f2b",
  },

  noteCard: {
    flexDirection: "row",
    gap: 11,
    padding: 15,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 17,
    backgroundColor: "#211810",
  },

  noteText: {
    flex: 1,
    color: "#bca99b",
    fontSize: 11,
    lineHeight: 17,
  },

  disabled: {
    opacity: 0.5,
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