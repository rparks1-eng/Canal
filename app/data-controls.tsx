import { Ionicons } from "@expo/vector-icons";
import {
    router,
} from "expo-router";
import {
    useEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    clearAllCanalData,
    exportCanalData,
    getCanalStorageSummary,
} from "../lib/data-controls";

type StorageSummary = {
  keyCount: number;
  estimatedCharacters: number;
};

type WebNavigator = {
  share?: (data: {
    title?: string;
    text?: string;
  }) => Promise<void>;

  clipboard?: {
    writeText: (
      value: string,
    ) => Promise<void>;
  };
};

export default function DataControlsScreen() {
  const [
    summary,
    setSummary,
  ] = useState<StorageSummary>({
    keyCount: 0,
    estimatedCharacters: 0,
  });

  const [
    activeAction,
    setActiveAction,
  ] = useState<
    "export" | "reset" | ""
  >("");

  useEffect(() => {
    void loadSummary();
  }, []);

  async function loadSummary() {
    try {
      const storedSummary =
        await getCanalStorageSummary();

      setSummary(storedSummary);
    } catch (error) {
      console.error(
        "Unable to read Canal storage:",
        error,
      );
    }
  }

  async function handleExport() {
    try {
      setActiveAction(
        "export",
      );

      const exportText =
        await exportCanalData();

      if (Platform.OS !== "web") {
        await Share.share({
          title:
            "Canal Data Export",

          message:
            exportText,
        });

        return;
      }

      const webNavigator = (
        globalThis as unknown as {
          navigator?: WebNavigator;
        }
      ).navigator;

      if (webNavigator?.share) {
        try {
          await webNavigator.share({
            title:
              "Canal Data Export",

            text:
              exportText,
          });

          return;
        } catch (error) {
          if (
            error instanceof Error &&
            error.name ===
              "AbortError"
          ) {
            return;
          }
        }
      }

      if (
        webNavigator?.clipboard
      ) {
        await webNavigator.clipboard.writeText(
          exportText,
        );

        Alert.alert(
          "Data copied",
          "Your Canal data export was copied to the clipboard.",
        );

        return;
      }

      throw new Error(
        "Export sharing is unavailable in this browser.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to export",
        error instanceof Error
          ? error.message
          : "Canal could not export your local data.",
      );
    } finally {
      setActiveAction("");
    }
  }

  function confirmReset() {
    Alert.alert(
      "Reset Canal on this device?",
      "This removes Scenes, Snapshots, Soundscape data, Following, blocked users, activity, settings, Stages, favorites, and Spotify connection data stored by the prototype.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: () => {
            void handleReset();
          },
        },
      ],
    );
  }

  async function handleReset() {
    try {
      setActiveAction(
        "reset",
      );

      await clearAllCanalData();

      Alert.alert(
        "Canal reset",
        "Local Canal data was removed from this device.",
        [
          {
            text: "Return to Start",
            onPress: () =>
              router.replace("/"),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Unable to reset",
        error instanceof Error
          ? error.message
          : "Canal could not clear all local data.",
      );
    } finally {
      setActiveAction("");
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
              ‹ Settings
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Data Controls
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View>
          <Text style={styles.eyebrow}>
            LOCAL DATA
          </Text>

          <Text style={styles.heading}>
            Control your Canal data.
          </Text>

          <Text
            style={styles.description}
          >
            Export or remove the
            prototype data stored
            locally on this device.
          </Text>
        </View>

        <View
          style={styles.summaryCard}
        >
          <View
            style={styles.summaryIcon}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={28}
              color="#ff9a50"
            />
          </View>

          <Text
            style={styles.summaryTitle}
          >
            Local prototype storage
          </Text>

          <Text
            style={styles.summaryText}
          >
            {summary.keyCount} Canal
            storage groups
          </Text>

          <Text
            style={styles.summaryText}
          >
            Approximately{" "}
            {formatStorageSize(
              summary.estimatedCharacters,
            )}{" "}
            of text data
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Export
          </Text>

          <View
            style={styles.actionCard}
          >
            <View
              style={styles.actionHeader}
            >
              <View
                style={styles.actionIcon}
              >
                <Ionicons
                  name="download-outline"
                  size={24}
                  color="#ff9a50"
                />
              </View>

              <View
                style={styles.actionCopy}
              >
                <Text
                  style={styles.actionTitle}
                >
                  Export local data
                </Text>

                <Text
                  style={styles.actionText}
                >
                  Creates a readable
                  JSON export containing
                  the Canal data stored
                  on this device.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={
                activeAction !== ""
              }
              onPress={() => {
                void handleExport();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                activeAction !== "" &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              {activeAction ===
              "export" ? (
                <ActivityIndicator
                  color="#17110c"
                />
              ) : (
                <>
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color="#17110c"
                  />

                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    Export Canal Data
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Reset
          </Text>

          <View
            style={[
              styles.actionCard,
              styles.dangerCard,
            ]}
          >
            <View
              style={styles.actionHeader}
            >
              <View
                style={
                  styles.dangerIcon
                }
              >
                <Ionicons
                  name="trash-outline"
                  size={24}
                  color="#ff9187"
                />
              </View>

              <View
                style={styles.actionCopy}
              >
                <Text
                  style={styles.actionTitle}
                >
                  Reset Canal
                </Text>

                <Text
                  style={styles.actionText}
                >
                  Removes local
                  prototype data and
                  returns the app to a
                  fresh state.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={
                activeAction !== ""
              }
              onPress={
                confirmReset
              }
              style={({ pressed }) => [
                styles.dangerButton,
                activeAction !== "" &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              {activeAction ===
              "reset" ? (
                <ActivityIndicator
                  color="#ff9187"
                />
              ) : (
                <Text
                  style={
                    styles.dangerButtonText
                  }
                >
                  Reset Everything
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color="#ff9a50"
          />

          <Text style={styles.noteText}>
            This prototype does not yet
            have a Canal cloud account
            or server backup. Removing
            local data cannot currently
            be undone inside the app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatStorageSize(
  characterCount: number,
): string {
  if (characterCount < 1000) {
    return `${characterCount} characters`;
  }

  const kilobytes =
    characterCount / 1000;

  if (kilobytes < 1000) {
    return `${kilobytes.toFixed(
      1,
    )} KB`;
  }

  return `${(
    kilobytes / 1000
  ).toFixed(2)} MB`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
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

  eyebrow: {
    marginBottom: 8,
    color: "#ff9a50",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
  },

  description: {
    marginTop: 10,
    color: "#aeb6b0",
    fontSize: 15,
    lineHeight: 22,
  },

  summaryCard: {
    alignItems: "center",
    padding: 22,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 22,
    backgroundColor: "#171c19",
  },

  summaryIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#2b1d14",
  },

  summaryTitle: {
    marginTop: 13,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },

  summaryText: {
    marginTop: 6,
    color: "#8f9891",
    fontSize: 12,
  },

  section: {
    gap: 11,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },

  actionCard: {
    gap: 17,
    padding: 18,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 21,
    backgroundColor: "#171c19",
  },

  dangerCard: {
    borderColor: "#4f302d",
    backgroundColor: "#1d1514",
  },

  actionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  actionIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 17,
    backgroundColor: "#2b1d14",
  },

  dangerIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 17,
    backgroundColor: "#271716",
  },

  actionCopy: {
    flex: 1,
  },

  actionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  actionText: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 12,
    lineHeight: 18,
  },

  primaryButton: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  dangerButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6e3833",
    borderRadius: 16,
    backgroundColor: "#271716",
  },

  dangerButtonText: {
    color: "#ff9187",
    fontSize: 14,
    fontWeight: "800",
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