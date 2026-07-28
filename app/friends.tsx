import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  followUser,
  readRelationshipState,
  unfollowUser,
} from "../lib/relationships";
import {
  DirectoryUser,
  getDirectoryUsers,
} from "../lib/user-directory";

export default function FriendsScreen() {
  const [query, setQuery] =
    useState("");

  const [
    following,
    setFollowing,
  ] = useState<string[]>([]);

  const [
    blocked,
    setBlocked,
  ] = useState<string[]>([]);

  const [
    operationUsername,
    setOperationUsername,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const users =
    useMemo(
      () => getDirectoryUsers(),
      [],
    );

  const loadRelationships =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const relationshipState =
          await readRelationshipState();

        setFollowing(
          relationshipState.following,
        );

        setBlocked(
          relationshipState.blocked,
        );
      } catch (error) {
        console.error(
          "Unable to load friends:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load the people directory.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRelationships();
    }, [loadRelationships]),
  );

  const visibleUsers =
    useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      return users
        .filter(
          (user) =>
            !blocked.includes(
              user.username,
            ),
        )
        .filter((user) => {
          if (!normalizedQuery) {
            return true;
          }

          return [
            user.displayName,
            user.username,
            user.bio,
            ...user.genres,
            ...user.favoriteArtists,
          ].some((value) =>
            value
              .toLowerCase()
              .includes(
                normalizedQuery,
              ),
          );
        });
    }, [
      blocked,
      query,
      users,
    ]);

  async function toggleFollowing(
    user: DirectoryUser,
  ) {
    const isFollowing =
      following.includes(
        user.username,
      );

    try {
      setOperationUsername(
        user.username,
      );

      if (isFollowing) {
        const state =
          await unfollowUser(
            user.username,
            user.displayName,
          );

        setFollowing(
          following.filter(
            (username) =>
              username !==
              user.username,
          ),
        );

        showPendingRelationshipSync(
          state.syncStatus,
        );
      } else {
        const state =
          await followUser(
            user.username,
            user.displayName,
          );

        setFollowing(
          Array.from(
            new Set([
              ...following,
              user.username,
            ]),
          ),
        );

        showPendingRelationshipSync(
          state.syncStatus,
        );
      }
    } catch (error) {
      console.error(
        "Unable to update following:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not update your Following list.",
      );
    } finally {
      setOperationUsername("");
    }
  }

  function openUser(
    username: string,
  ) {
    router.push({
      pathname:
        "/friend/[username]",
      params: {
        username,
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
        keyboardShouldPersistTaps="handled"
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
              ‹ Back
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Find Friends
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/invite-friends",
              )
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.headerAction
              }
            >
              Invite
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.eyebrow}>
            PEOPLE
          </Text>

          <Text style={styles.heading}>
            Find your people.
          </Text>

          <Text
            style={styles.description}
          >
            Discover public
            Soundscapes and follow
            people whose music taste
            matches yours.
          </Text>
        </View>

        <View
          style={styles.searchBox}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color="#8f9891"
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people or music taste"
            placeholderTextColor="#777f79"
            autoCapitalize="none"
            style={styles.searchInput}
          />

          {query ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setQuery("")
              }
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#777f79"
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.quickActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/following",
              )
            }
            style={({ pressed }) => [
              styles.quickAction,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              name="people-outline"
              size={20}
              color="#ff9a50"
            />

            <Text
              style={
                styles.quickActionText
              }
            >
              Following
            </Text>

            <View style={styles.countBadge}>
              <Text
                style={
                  styles.countBadgeText
                }
              >
                {following.length}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/blocked-users",
              )
            }
            style={({ pressed }) => [
              styles.quickAction,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              name="ban-outline"
              size={20}
              color="#ff9a50"
            />

            <Text
              style={
                styles.quickActionText
              }
            >
              Blocked
            </Text>

            <View style={styles.countBadge}>
              <Text
                style={
                  styles.countBadgeText
                }
              >
                {blocked.length}
              </Text>
            </View>
          </Pressable>
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
        ) : visibleUsers.length ===
          0 ? (
          <View
            style={styles.emptyCard}
          >
            <Ionicons
              name="people-outline"
              size={31}
              color="#ff9a50"
            />

            <Text
              style={styles.emptyTitle}
            >
              No people found
            </Text>

            <Text
              style={styles.emptyText}
            >
              Try another search or
              review your blocked
              users.
            </Text>
          </View>
        ) : (
          <View
            style={styles.userList}
          >
            {visibleUsers.map(
              (user) => {
                const isFollowing =
                  following.includes(
                    user.username,
                  );

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
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        openUser(
                          user.username,
                        )
                      }
                      style={({ pressed }) => [
                        styles.userMain,
                        pressed &&
                          styles.pressed,
                      ]}
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

                        <Text
                          numberOfLines={1}
                          style={
                            styles.musicTaste
                          }
                        >
                          {user.genres
                            .slice(0, 3)
                            .join(" · ") ||
                            "Public Soundscape"}
                        </Text>
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color="#717a73"
                      />
                    </Pressable>

                    <View
                      style={
                        styles.cardFooter
                      }
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          openUser(
                            user.username,
                          )
                        }
                        style={({ pressed }) => [
                          styles.footerAction,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <Text
                          style={
                            styles.footerActionText
                          }
                        >
                          View Soundscape
                        </Text>
                      </Pressable>

                      <View
                        style={
                          styles.footerDivider
                        }
                      />

                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          isOperating
                        }
                        onPress={() => {
                          void toggleFollowing(
                            user,
                          );
                        }}
                        style={({ pressed }) => [
                          styles.footerAction,
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
                            style={[
                              styles.footerActionText,
                              isFollowing &&
                                styles.followingText,
                            ]}
                          >
                            {isFollowing
                              ? "Following"
                              : "Follow"}
                          </Text>
                        )}
                      </Pressable>
                    </View>
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

function showPendingRelationshipSync(
  syncStatus:
    | "synced"
    | "pending"
    | "offline"
    | undefined,
) {
  if (
    syncStatus ===
    "pending"
  ) {
    Alert.alert(
      "Saved on this device",
      "Canal will sync this change to your account when the connection returns.",
    );
  }
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
    gap: 21,
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

  headerAction: {
    color: "#ff9a50",
    fontSize: 14,
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

  searchBox: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 17,
    backgroundColor: "#171c19",
  },

  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
  },

  quickActions: {
    flexDirection: "row",
    gap: 10,
  },

  quickAction: {
    minHeight: 52,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 16,
    backgroundColor: "#171c19",
  },

  quickActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  countBadge: {
    minWidth: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "#2d332f",
  },

  countBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },

  centered: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    alignItems: "center",
    gap: 10,
    padding: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 21,
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

  userList: {
    gap: 12,
  },

  userCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 20,
    backgroundColor: "#171c19",
  },

  userMain: {
    minHeight: 91,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },

  avatar: {
    width: 57,
    height: 57,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 29,
    backgroundColor: "#2b1d14",
  },

  avatarText: {
    color: "#ff9a50",
    fontSize: 15,
    fontWeight: "800",
  },

  userInformation: {
    flex: 1,
    paddingRight: 8,
  },

  displayName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  username: {
    marginTop: 4,
    color: "#ff9a50",
    fontSize: 12,
    fontWeight: "600",
  },

  musicTaste: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 11,
  },

  cardFooter: {
    minHeight: 47,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#303833",
  },

  footerAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  footerActionText: {
    color: "#ff9a50",
    fontSize: 11,
    fontWeight: "800",
  },

  followingText: {
    color: "#9ff3b5",
  },

  footerDivider: {
    width: 1,
    backgroundColor: "#303833",
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
