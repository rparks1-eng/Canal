import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
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
  RecoveryNotice,
} from "./recovery-notice";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../lib/recovery-issue";

import {
  CanalActivityItem,
  CanalActivityType,
  clearActivity,
  markAllActivityRead,
  readActivity,
} from "../lib/relationships";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

type IoniconName =
  keyof typeof Ionicons.glyphMap;

export default function ActivityScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    activity,
    setActivity,
  ] = useState<
    CanalActivityItem[]
  >([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    loadIssue,
    setLoadIssue,
  ] =
    useState<RecoveryIssue | null>(
      null,
    );

  const loadActivity =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setLoadIssue(
          null,
        );

        const storedActivity =
          await readActivity();

        setActivity(
          storedActivity,
        );

        await markAllActivityRead();
      } catch (error) {
        console.error(
          "Unable to load activity:",
          error,
        );

        setLoadIssue(
          classifyRecoveryIssue(
            error,
            {
              service:
                "canal",
              connectivityStatus,
            },
          ),
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      connectivityStatus,
    ]);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity]),
  );

  useReconnectReload(
    loadActivity,
  );

  const recoverActivity =
    async (): Promise<void> => {
      if (
        loadIssue?.action ===
        "sign-in"
      ) {
        router.replace(
          "/login" as never,
        );

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await loadActivity();
      }
    };

  function confirmClear() {
    Alert.alert(
      "Clear activity history?",
      "This removes synced activity history from your Canal account and this device.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void clearHistory();
          },
        },
      ],
    );
  }

  async function clearHistory() {
    try {
      await clearActivity();

      setActivity([]);
    } catch (error) {
      console.error(
        "Unable to clear activity:",
        error,
      );

      Alert.alert(
        "Unable to clear",
        "Canal could not clear activity history.",
      );
    }
  }

  function openActivityItem(
    item: CanalActivityItem,
  ) {
    if (!item.username) {
      return;
    }

    router.push({
      pathname:
        "/friend/[username]",
      params: {
        username:
          item.username,
      },
    });
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
          <View
            style={
              styles.headerSpacer
            }
          />

          <Text
            style={
              styles.headerTitle
            }
          >
            Activity
          </Text>

          {activity.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear Activity history"
              accessibilityRole="button"
              onPress={
                confirmClear
              }
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.clearText
                }
              >
                Clear
              </Text>
            </Pressable>
          ) : (
            <View
              style={
                styles.headerSpacer
              }
            />
          )}
        </View>

        <View>
          <Text style={styles.eyebrow}>
            RECENT
          </Text>

          <Text style={styles.heading}>
            Canal activity.
          </Text>

          <Text
            style={styles.description}
          >
            Follow, block, share, and
            creation actions sync across
            your signed-in devices.
          </Text>
        </View>

        {loadIssue ? (
          <RecoveryNotice
            busy={
              isLoading
            }
            issue={
              loadIssue
            }
            onAction={
              recoverActivity
            }
          />
        ) : null}

        {isLoading ? (
          <View
            style={styles.centered}
          >
            <ActivityIndicator
              size="large"
              color="#ff7a1a"
            />
          </View>
        ) : loadIssue &&
          activity.length ===
            0 ? null : activity.length ===
          0 ? (
          <View
            style={styles.emptyCard}
          >
            <View
              style={styles.emptyIcon}
            >
              <Ionicons
                name="notifications-outline"
                size={31}
                color="#ff9a50"
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No activity yet
            </Text>

            <Text
              style={styles.emptyText}
            >
              Actions such as following
              or blocking people will
              appear here.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  "/friends",
                )
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Find Friends
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={styles.activityList}
          >
            {activity.map((item) => {
              const icon =
                getActivityIcon(
                  item.type,
                );

              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${item.title}. ${item.description}`}
                  accessibilityRole="button"
                  disabled={
                    !item.username
                  }
                  onPress={() =>
                    openActivityItem(
                      item,
                    )
                  }
                  style={({ pressed }) => [
                    styles.activityCard,
                    pressed &&
                      item.username &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.activityIcon,
                      getActivityIconStyle(
                        item.type,
                      ),
                    ]}
                  >
                    <Ionicons
                      name={icon}
                      size={21}
                      color={getActivityColor(
                        item.type,
                      )}
                    />
                  </View>

                  <View
                    style={
                      styles.activityInformation
                    }
                  >
                    <Text
                      style={
                        styles.activityTitle
                      }
                    >
                      {item.title}
                    </Text>

                    <Text
                      style={
                        styles.activityDescription
                      }
                    >
                      {
                        item.description
                      }
                    </Text>

                    <Text
                      style={
                        styles.activityDate
                      }
                    >
                      {formatActivityDate(
                        item.createdAt,
                      )}
                    </Text>

                    {item.syncStatus ===
                    "pending" ? (
                      <Text
                        accessibilityLabel="Waiting to sync when Canal is online"
                        style={
                          styles.pendingText
                        }
                      >
                        Saved on this
                        device · Waiting
                        for connection
                      </Text>
                    ) : null}
                  </View>

                  {item.username ? (
                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color="#717a73"
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getActivityIcon(
  type: CanalActivityType,
): IoniconName {
  switch (type) {
    case "follow":
      return "person-add-outline";

    case "unfollow":
      return "person-remove-outline";

    case "block":
      return "ban-outline";

    case "unblock":
      return "shield-checkmark-outline";

    case "snapshot":
      return "camera-outline";

    case "scene":
      return "musical-notes-outline";

    case "share":
      return "share-social-outline";

    default:
      return "notifications-outline";
  }
}

function getActivityColor(
  type: CanalActivityType,
): string {
  if (
    type === "block" ||
    type === "unfollow"
  ) {
    return "#ff9187";
  }

  if (
    type === "follow" ||
    type === "unblock"
  ) {
    return "#9ff3b5";
  }

  return "#ff9a50";
}

function getActivityIconStyle(
  type: CanalActivityType,
) {
  if (
    type === "block" ||
    type === "unfollow"
  ) {
    return {
      backgroundColor:
        "#271716",
    };
  }

  if (
    type === "follow" ||
    type === "unblock"
  ) {
    return {
      backgroundColor:
        "#142119",
    };
  }

  return {
    backgroundColor:
      "#2b1d14",
  };
}

function formatActivityDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  const now = Date.now();
  const difference =
    now - date.getTime();

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (difference < minute) {
    return "Just now";
  }

  if (difference < hour) {
    const minutes =
      Math.floor(
        difference / minute,
      );

    return `${minutes}m ago`;
  }

  if (difference < day) {
    const hours =
      Math.floor(
        difference / hour,
      );

    return `${hours}h ago`;
  }

  if (difference < 7 * day) {
    const days =
      Math.floor(
        difference / day,
      );

    return `${days}d ago`;
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year:
        date.getFullYear() !==
        new Date().getFullYear()
          ? "numeric"
          : undefined,
    },
  );
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
    gap: 22,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 80,
    minHeight: 44,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 80,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  clearText: {
    color: "#ff9187",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
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

  pendingText: {
    marginTop: 5,
    color: "#ffb27a",
    fontSize: 11,
    fontWeight: "700",
  },

  centered: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    alignItems: "center",
    gap: 10,
    padding: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 21,
  },

  emptyIcon: {
    width: 65,
    height: 65,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#2b1d14",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8f9891",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  primaryButton: {
    minHeight: 50,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  activityList: {
    gap: 11,
  },

  activityCard: {
    minHeight: 91,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 19,
    backgroundColor: "#171c19",
  },

  activityIcon: {
    width: 47,
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 16,
  },

  activityInformation: {
    flex: 1,
    paddingRight: 8,
  },

  activityTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  activityDescription: {
    marginTop: 4,
    color: "#8f9891",
    fontSize: 11,
    lineHeight: 16,
  },

  activityDate: {
    marginTop: 6,
    color: "#666e68",
    fontSize: 10,
    fontWeight: "600",
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
