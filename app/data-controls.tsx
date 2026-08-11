import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
} from "expo-router";
import {
    useCallback,
    useEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";

import { CanalAlert } from "../lib/canal-alert";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    deleteOwnAnalyticsEvents,
    readAnalyticsControlState,
    setAnalyticsConsent,
} from "../lib/analytics";

import {
    clearAllCanalData,
    exportCanalData,
    getCanalStorageSummary,
} from "../lib/data-controls";

import {
    useAuth,
} from "../providers/auth-provider";

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
  const {
    user,
  } =
    useAuth();

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
    | "analytics"
    | "delete-analytics"
    | "export"
    | "reset"
    | ""
  >("");

  const [
    analyticsEnabled,
    setAnalyticsEnabled,
  ] = useState(false);

  const [
    analyticsLoading,
    setAnalyticsLoading,
  ] = useState(true);

  const [
    analyticsQueuedCount,
    setAnalyticsQueuedCount,
  ] = useState(0);

  const [
    analyticsMessage,
    setAnalyticsMessage,
  ] = useState("");

  const loadAnalyticsState =
    useCallback(async () => {
    if (!user) {
      setAnalyticsEnabled(
        false,
      );
      setAnalyticsQueuedCount(
        0,
      );
      setAnalyticsLoading(
        false,
      );

      return;
    }

    setAnalyticsLoading(
      true,
    );

    try {
      const state =
        await readAnalyticsControlState();

      setAnalyticsEnabled(
        state.enabled,
      );

      setAnalyticsQueuedCount(
        state.queuedEventCount,
      );

      if (
        state.pendingCloudDeletion
      ) {
        setAnalyticsMessage(
          "Cloud analytics history deletion will retry when Canal reconnects.",
        );
      }
    } catch {
      setAnalyticsMessage(
        "Canal could not read the analytics preference. Analytics remain off.",
      );
    } finally {
      setAnalyticsLoading(
        false,
      );
    }
    }, [
      user,
    ]);

  useEffect(() => {
    void loadSummary();
    void loadAnalyticsState();
  }, [
    loadAnalyticsState,
  ]);

  async function handleAnalyticsToggle(
    enabled: boolean,
  ) {
    setActiveAction(
      "analytics",
    );

    setAnalyticsMessage(
      "",
    );

    try {
      const result =
        await setAnalyticsConsent(
          enabled,
        );

      setAnalyticsEnabled(
        result.enabled,
      );

      setAnalyticsQueuedCount(
        result.queuedEventCount,
      );

      setAnalyticsMessage(
        result.message,
      );
    } catch {
      setAnalyticsMessage(
        "Canal could not save the analytics preference. The previous setting is unchanged.",
      );

      await loadAnalyticsState();
    } finally {
      setActiveAction(
        "",
      );
    }
  }

  async function handleDeleteAnalytics() {
    setActiveAction(
      "delete-analytics",
    );

    setAnalyticsMessage(
      "",
    );

    try {
      const result =
        await deleteOwnAnalyticsEvents();

      setAnalyticsEnabled(
        result.enabled,
      );

      setAnalyticsQueuedCount(
        result.queuedEventCount,
      );

      setAnalyticsMessage(
        result.message,
      );
    } catch {
      setAnalyticsMessage(
        "Canal could not delete analytics history. Try again when connected.",
      );
    } finally {
      setActiveAction(
        "",
      );
    }
  }

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

        CanalAlert.alert(
          "Data copied",
          "Your Canal data export was copied to the clipboard.",
        );

        return;
      }

      throw new Error(
        "Export sharing is unavailable in this browser.",
      );
    } catch (error) {
      CanalAlert.alert(
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
    CanalAlert.alert(
      "Clear Canal data on this device?",
      "This removes Canal data stored on this device and disconnects Spotify. It does not delete your Canal account or cloud Scenes, Snapshots, Stages, profile, relationships, or playlist history.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
            text: "Clear This Device",
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

      CanalAlert.alert(
        "Device data cleared",
        "Local Canal data was removed. Your Canal account and cloud data were not deleted.",
        [
          {
            text: "Return to Start",
            onPress: () =>
              router.replace("/"),
          },
        ],
      );
    } catch (error) {
      CanalAlert.alert(
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
            Choose whether to share
            limited usage analytics,
            export local data, or
            clear this device.
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
              color={canalDynamicColors.lavender}
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
            Product analytics
          </Text>

          <View
            style={styles.actionCard}
          >
            <View
              style={styles.toggleRow}
            >
              <View
                style={styles.actionCopy}
              >
                <Text
                  style={styles.actionTitle}
                >
                  Share limited usage
                  analytics
                </Text>

                <Text
                  style={styles.actionText}
                >
                  Off by default. When
                  enabled, Canal records
                  milestone names,
                  retry status, platform,
                  and bounded failure
                  categories. It never
                  includes passwords,
                  emails, reset links,
                  tokens, URLs, raw
                  errors, tracks, or
                  private Scene and
                  Snapshot content.
                </Text>
              </View>

              <Switch
                accessibilityLabel="Share limited usage analytics"
                accessibilityHint="Controls whether Canal records and sends privacy-limited product events."
                accessibilityState={{
                  busy:
                    analyticsLoading ||
                    activeAction ===
                      "analytics",
                  checked:
                    analyticsEnabled,
                  disabled:
                    analyticsLoading ||
                    activeAction !==
                      "",
                }}
                disabled={
                  analyticsLoading ||
                  activeAction !== ""
                }
                onValueChange={(
                  value,
                ) => {
                  void handleAnalyticsToggle(
                    value,
                  );
                }}
                trackColor={{
                  false:
                    "#434a45",
                  true:
                    "#4C46C8",
                }}
                thumbColor="#191A18"
                value={
                  analyticsEnabled
                }
              />
            </View>

            <Text
              accessibilityLiveRegion="polite"
              style={
                styles.analyticsStatus
              }
            >
              {analyticsLoading
                ? "Checking analytics preference."
                : analyticsEnabled
                  ? `${analyticsQueuedCount} event${analyticsQueuedCount === 1 ? "" : "s"} waiting for delivery. Events expire from the device after seven days and from Canal after 90 days.`
                  : "Analytics are off. No new analytics events are recorded or queued."}
            </Text>

            {analyticsMessage ? (
              <Text
                accessibilityLiveRegion="polite"
                style={
                  styles.analyticsMessage
                }
              >
                {analyticsMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel="Delete Analytics History"
              accessibilityRole="button"
              accessibilityHint="Deletes queued events on this device and your existing Canal analytics rows."
              accessibilityState={{
                busy:
                  activeAction ===
                  "delete-analytics",
                disabled:
                  analyticsLoading ||
                  activeAction !== "",
              }}
              disabled={
                analyticsLoading ||
                activeAction !== ""
              }
              onPress={() => {
                void handleDeleteAnalytics();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                (
                  analyticsLoading ||
                  activeAction !== ""
                ) &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              {activeAction ===
              "delete-analytics" ? (
                <ActivityIndicator
                  color="#4C46C8"
                />
              ) : (
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Delete Analytics History
                </Text>
              )}
            </Pressable>
          </View>
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
                  color={canalDynamicColors.lavender}
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
              accessibilityLabel="Export Canal Data"
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  activeAction ===
                  "export",
                disabled:
                  activeAction !== "",
              }}
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
                  color="#191A18"
                />
              ) : (
                <>
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color={canalDynamicColors.text}
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
                  color={canalDynamicColors.danger}
                />
              </View>

              <View
                style={styles.actionCopy}
              >
                <Text
                  style={styles.actionTitle}
                >
                  Clear data on this
                  device
                </Text>

                <Text
                  style={styles.actionText}
                >
                  Removes local caches,
                  drafts, settings, and
                  music credentials. It
                  does not delete your
                  Canal account or most
                  cloud data.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Clear This Device"
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  activeAction ===
                  "reset",
                disabled:
                  activeAction !== "",
              }}
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
                  Clear This Device
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={canalDynamicColors.lavender}
          />

          <Text style={styles.noteText}>
            Canal uses Supabase for your
            account and synchronized
            profile, Scenes, Snapshots,
            relationships, playlist
            history, and Live Stages.
            Clearing this device is not
            account deletion. A complete
            cloud export and account
            deletion flow remains a
            release gate.
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
    width: 90,
    minHeight: 48,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 90,
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

  eyebrow: {
    marginBottom: 8,
    color: canalDynamicColors.lavender,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
      fontFamily: "Georgia",
    color: canalDynamicColors.text,
    fontSize: 30,
    fontWeight: "700",
  },

  description: {
    marginTop: 10,
    color: canalDynamicColors.muted,
    fontSize: 15,
    lineHeight: 22,
  },

  summaryCard: {
    alignItems: "center",
    padding: 22,
    borderWidth: 1,
    borderColor: "#D9D3C8",
    borderRadius: 22,
    backgroundColor: canalDynamicColors.surface,
  },

  summaryIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  summaryTitle: {
    marginTop: 13,
    color: canalDynamicColors.text,
    fontSize: 17,
    fontWeight: "700",
  },

  summaryText: {
    marginTop: 6,
    color: canalDynamicColors.muted,
    fontSize: 12,
  },

  section: {
    gap: 11,
  },

  sectionTitle: {
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  actionCard: {
    gap: 17,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D9D3C8",
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  dangerCard: {
    borderColor: "#D8AAA6",
    backgroundColor: canalDynamicColors.dangerSurface,
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
    backgroundColor: canalDynamicColors.surface,
  },

  dangerIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  actionCopy: {
    flex: 1,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  actionTitle: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  actionText: {
    marginTop: 5,
    color: canalDynamicColors.muted,
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
    backgroundColor: "#4C46C8",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 16,
    backgroundColor: canalDynamicColors.surface,
  },

  secondaryButtonText: {
    color: "#6B3B22",
    fontSize: 13,
    fontWeight: "800",
  },

  analyticsStatus: {
    color: canalDynamicColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  analyticsMessage: {
    color: "#6B3B22",
    fontSize: 12,
    lineHeight: 18,
  },

  dangerButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6e3833",
    borderRadius: 16,
    backgroundColor: canalDynamicColors.surface,
  },

  dangerButtonText: {
    color: canalDynamicColors.danger,
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
    backgroundColor: canalDynamicColors.surface,
  },

  noteText: {
    flex: 1,
    color: canalDynamicColors.muted,
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
