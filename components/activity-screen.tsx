import { canalDynamicColors } from "../theme/canal-dynamic-colors";
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
import { ProfileAvatar } from "./profile-avatar";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  resolvePublicProfileIdByHandle,
} from "../lib/social";

import {
  respondToStageCollaborationInvite,
} from "../lib/stage-collaboration-invites";

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

import {
  useNotificationCenter,
} from "../providers/notification-center-provider";

type IoniconName =
  keyof typeof Ionicons.glyphMap;

export default function ActivityScreen() {
  const {
    clearUnreadCount,
  } = useNotificationCenter();
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
        clearUnreadCount();
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
      clearUnreadCount,
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

  async function openActivityItem(
    item: CanalActivityItem,
  ): Promise<void> {
    if (
      item.stageId &&
      item.stageInviteId
    ) {
      Alert.alert(
        "Join as a collaborator?",
        item.description,
        [
          {
            text: "Not now",
            style: "cancel",
          },
          {
            text: "Decline",
            style: "destructive",
            onPress: () => {
              void respondToStageCollaborationInvite(
                item.stageInviteId!,
                false,
              ).then(loadActivity);
            },
          },
          {
            text: "Join and contribute",
            onPress: () => {
              void respondToStageCollaborationInvite(
                item.stageInviteId!,
                true,
              ).then(
                (stageId) =>
                  router.push({
                    pathname:
                      "/stage-contribution",
                    params: {
                      stageId,
                    },
                  }),
              );
            },
          },
        ],
      );

      return;
    }

    if (item.stageId) {
      router.push({
        pathname:
          "/stage-contribution",
        params: {
          stageId:
            item.stageId,
        },
      });

      return;
    }

    if (item.snapshotId) {
      router.push({
        pathname: "/snapshots/[snapshotId]",
        params: {
          snapshotId: item.snapshotId,
          ...(item.commentId
            ? { commentId: item.commentId }
            : {}),
        },
      } as never);

      return;
    }

    if (!item.username) {
      return;
    }

    try {
      const profileId =
        await resolvePublicProfileIdByHandle(
          item.username,
        );

      if (!profileId) {
        Alert.alert(
          "Profile unavailable",
          "This Canal profile is no longer public or available.",
        );

        return;
      }

      router.push({
        pathname:
          "/creator/[userId]",
        params: {
          userId: profileId,
        },
      });
    } catch {
      Alert.alert(
        "Unable to open profile",
        "Canal could not load this profile right now. Try again.",
      );
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
            accessibilityHint="Returns to your profile."
            accessibilityLabel="Back to Profile"
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/profile",
              )
            }
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={canalDynamicColors.text}
              name="chevron-back"
              size={24}
            />
          </Pressable>

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
                color={canalDynamicColors.gold}
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
              accessibilityLabel="Find friends"
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
                    !item.username &&
                    !item.snapshotId
                  }
                  onPress={() =>
                    void openActivityItem(
                      item,
                    )
                  }
                  style={({ pressed }) => [
                    styles.activityCard,
                    pressed &&
                      (item.username ||
                        item.snapshotId) &&
                      styles.pressed,
                  ]}
                >
                  {item.username ? (
                    <ProfileAvatar
                      avatarUrl={item.avatarUrl}
                      displayName={item.displayName || item.username}
                      size={42}
                    />
                  ) : (
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
                  )}

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

                  {item.username ||
                  item.snapshotId ? (
                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color={canalDynamicColors.muted}
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
    backgroundColor: "transparent",
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
    minHeight: 48,
    justifyContent: "center",
  },

  backButton: {
    width: 80,
    minHeight: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerSpacer: {
    width: 80,
  },

  headerTitle: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  clearText: {
    color: canalDynamicColors.danger,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },

  eyebrow: {
    marginBottom: 8,
    color: canalDynamicColors.lavender,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 30,
    fontWeight: "700",
  },

  description: {
    marginTop: 10,
    color: canalDynamicColors.muted,
    fontSize: 15,
    lineHeight: 22,
  },

  pendingText: {
    marginTop: 5,
    color: canalDynamicColors.gold,
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
    color: canalDynamicColors.text,
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    color: canalDynamicColors.muted,
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
    borderColor: canalDynamicColors.line,
    borderRadius: 19,
    backgroundColor: canalDynamicColors.surface,
  },

  activityIcon: {
    width: 47,
    minHeight: 48,
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
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  activityDescription: {
    marginTop: 4,
    color: canalDynamicColors.muted,
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
