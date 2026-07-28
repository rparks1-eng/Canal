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
  readBlockedUsers,
  unblockUser,
} from "../lib/relationships";
import {
  DirectoryUser,
  getDirectoryUser,
} from "../lib/user-directory";

export default function BlockedUsersScreen() {
  const [
    blockedUsers,
    setBlockedUsers,
  ] = useState<DirectoryUser[]>([]);

  const [
    operationUsername,
    setOperationUsername,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const loadBlockedUsers =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const usernames =
          await readBlockedUsers();

        setBlockedUsers(
          usernames.map(
            (username) =>
              getDirectoryUser(
                username,
              ) ??
              createFallbackUser(
                username,
              ),
          ),
        );
      } catch (error) {
        console.error(
          "Unable to load blocked users:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load blocked users.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBlockedUsers();
    }, [loadBlockedUsers]),
  );

  function confirmUnblock(
    user: DirectoryUser,
  ) {
    Alert.alert(
      `Unblock ${user.displayName}?`,
      `@${user.username} can appear in Discover and search again.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unblock",
          onPress: () => {
            void removeBlockedUser(
              user,
            );
          },
        },
      ],
    );
  }

  async function removeBlockedUser(
    user: DirectoryUser,
  ) {
    try {
      setOperationUsername(
        user.username,
      );

      const state =
        await unblockUser(
          user.username,
          user.displayName,
        );

      setBlockedUsers(
        blockedUsers.filter(
          (item) =>
            item.username !==
          user.username,
        ),
      );

      if (
        state.syncStatus ===
        "pending"
      ) {
        Alert.alert(
          "Saved on this device",
          "Canal will sync this change to your account when the connection returns.",
        );
      }
    } catch (error) {
      console.error(
        "Unable to unblock user:",
        error,
      );

      Alert.alert(
        "Unable to unblock",
        "Canal could not unblock this person.",
      );
    } finally {
      setOperationUsername("");
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
            Blocked Users
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View>
          <Text style={styles.eyebrow}>
            PRIVACY
          </Text>

          <Text style={styles.heading}>
            Blocked people.
          </Text>

          <Text
            style={styles.description}
          >
            Blocked people are hidden
            from Discover, search, and
            your Following list on this
            device.
          </Text>
        </View>

        {isLoading ? (
          <View
            style={styles.centered}
          >
            <ActivityIndicator
              size="large"
              color="#ff7a1a"
            />
          </View>
        ) : blockedUsers.length ===
          0 ? (
          <View
            style={styles.emptyCard}
          >
            <View
              style={styles.emptyIcon}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={31}
                color="#9ff3b5"
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              Nobody is blocked
            </Text>

            <Text
              style={styles.emptyText}
            >
              People you block will
              appear here.
            </Text>
          </View>
        ) : (
          <View
            style={styles.userList}
          >
            {blockedUsers.map(
              (user) => {
                const isOperating =
                  operationUsername ===
                  user.username;

                return (
                  <View
                    key={user.username}
                    style={
                      styles.userCard
                    }
                  >
                    <View
                      style={
                        styles.avatar
                      }
                    >
                      <Text
                        style={
                          styles.avatarText
                        }
                      >
                        {user.initials}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.userInformation
                      }
                    >
                      <Text
                        numberOfLines={1}
                        style={
                          styles.displayName
                        }
                      >
                        {user.displayName}
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.username
                        }
                      >
                        @{user.username}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        isOperating
                      }
                      onPress={() =>
                        confirmUnblock(
                          user,
                        )
                      }
                      style={({ pressed }) => [
                        styles.unblockButton,
                        isOperating &&
                          styles.disabled,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      {isOperating ? (
                        <ActivityIndicator
                          size="small"
                          color="#ff9a50"
                        />
                      ) : (
                        <Text
                          style={
                            styles.unblockText
                          }
                        >
                          Unblock
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              },
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createFallbackUser(
  username: string,
): DirectoryUser {
  return {
    username,
    displayName: username,
    initials:
      username
        .slice(0, 2)
        .toUpperCase(),
    bio: "",
    genres: [],
    favoriteArtists: [],
    recentScenes: [],
    visibility: "public",
  };
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
    backgroundColor: "#142119",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8f9891",
    fontSize: 13,
  },

  userList: {
    gap: 11,
  },

  userCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 19,
    backgroundColor: "#171c19",
  },

  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 26,
    backgroundColor: "#271716",
  },

  avatarText: {
    color: "#ff9187",
    fontSize: 14,
    fontWeight: "800",
  },

  userInformation: {
    flex: 1,
    paddingRight: 10,
  },

  displayName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  username: {
    marginTop: 4,
    color: "#8f9891",
    fontSize: 12,
  },

  unblockButton: {
    minWidth: 78,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 13,
    backgroundColor: "#211810",
  },

  unblockText: {
    color: "#ff9a50",
    fontSize: 12,
    fontWeight: "800",
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
