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

import { useAuth } from "../providers/auth-provider";

import {
  followUser,
  readRelationshipState,
  unfollowUser,
} from "../lib/relationships";

import type {
  BlockedUserReference,
} from "../lib/relationships";

import {
  discoverableProfilesFromScenes,
  profileIsBlocked,
} from "../lib/social-discovery";

import type {
  DiscoverableProfile,
} from "../lib/social-discovery";

import {
  loadExploreScenes,
} from "../lib/social";

export default function FriendsScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();

  return (
    <FriendsScreenContent
      key={`${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`}
    />
  );
}

function FriendsScreenContent() {
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
    blockedTargets,
    setBlockedTargets,
  ] = useState<
    BlockedUserReference[]
  >([]);

  const [
    users,
    setUsers,
  ] = useState<
    DiscoverableProfile[]
  >([]);

  const [
    operationUsername,
    setOperationUsername,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const loadRelationships =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const [
          relationshipState,
          publicScenes,
        ] =
          await Promise.all([
            readRelationshipState(),
            loadExploreScenes(),
          ]);

        setFollowing(
          relationshipState.following,
        );

        setBlocked(
          relationshipState.blocked,
        );

        setBlockedTargets(
          relationshipState
            .blockedTargets ??
            [],
        );

        setUsers(
          discoverableProfilesFromScenes(
            publicScenes,
          ),
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
            !profileIsBlocked(
              user,
              blocked,
              blockedTargets,
            ),
        )
        .filter((user) => {
          if (!normalizedQuery) {
            return true;
          }

          return [
            user.displayName,
            user.handle,
            user.bio,
            ...user.genres,
            ...user.artists,
            user.favoriteActivities,
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
      blockedTargets,
      query,
      users,
    ]);

  async function toggleFollowing(
    user: DiscoverableProfile,
  ) {
    const username =
      user.handle
        .trim()
        .toLowerCase()
        .replace(/^@+/u, "");

    const isFollowing =
      following.includes(
        username,
      );

    try {
      setOperationUsername(
        user.id,
      );

      if (isFollowing) {
        const state =
          await unfollowUser(
            username,
            user.displayName,
            user.id,
          );

        setFollowing(
          following.filter(
            (candidate) =>
              candidate !==
              username,
          ),
        );

        showPendingRelationshipSync(
          state.syncStatus,
        );
      } else {
        const state =
          await followUser(
            username,
            user.displayName,
            user.id,
          );

        setFollowing(
          Array.from(
            new Set([
              ...following,
              username,
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
    userId: string,
  ) {
    router.push({
      pathname:
        "/creator/[userId]",
      params: {
        userId,
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
            accessibilityLabel="Go back"
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
            accessibilityLabel="Invite friends"
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
              accessibilityLabel="Clear people search"
              accessibilityRole="button"
              onPress={() =>
                setQuery("")
              }
              style={
                styles.clearSearchButton
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
            accessibilityLabel="View following"
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
            accessibilityLabel="View blocked users"
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
                const username =
                  user.handle
                    .trim()
                    .toLowerCase()
                    .replace(/^@+/u, "");

                const isFollowing =
                  following.includes(
                    username,
                  );

                const isOperating =
                  operationUsername ===
                  user.id;

                return (
                  <View
                    key={user.id}
                    style={
                      styles.userCard
                    }
                  >
                    <Pressable
                      accessibilityLabel={`Open ${user.displayName}`}
                      accessibilityRole="button"
                      onPress={() =>
                        openUser(
                          user.id,
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
                          {profileInitials(
                            user,
                          )}
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
                          {user.handle}
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
                        accessibilityLabel={`Open ${user.displayName}`}
                        accessibilityRole="button"
                        onPress={() =>
                          openUser(
                            user.id,
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
                        accessibilityLabel={`${isFollowing ? "Unfollow" : "Follow"} ${user.displayName}`}
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            isOperating,
                          disabled:
                            isOperating,
                          selected:
                            isFollowing,
                        }}
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

function profileInitials(
  profile: DiscoverableProfile,
): string {
  return (
    profile.displayName
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part
            .charAt(0)
            .toUpperCase(),
      )
      .join("") ||
    "C"
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
    backgroundColor: "#F3EFE5",
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
    minHeight: 48,
    justifyContent: "center",
  },

  backText: {
    color: "#6D6B64",
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#191A18",
    fontSize: 16,
    fontWeight: "700",
  },

  headerAction: {
    color: "#787DFF",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  eyebrow: {
    marginBottom: 8,
    color: "#787DFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    color: "#191A18",
    fontFamily: "Georgia",
    fontSize: 30,
    fontWeight: "700",
  },

  description: {
    marginTop: 10,
    color: "#6D6B64",
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

  clearSearchButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent:
      "center",
    marginRight: -14,
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
    minHeight: 48,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#303833",
  },

  footerAction: {
    minHeight: 48,
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
