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
  readFollowing,
  unfollowUser,
} from "../lib/relationships";
import {
  DirectoryUser,
  getDirectoryUser,
} from "../lib/user-directory";

export default function FollowingScreen() {
  const [
    followingUsers,
    setFollowingUsers,
  ] = useState<DirectoryUser[]>([]);

  const [query, setQuery] =
    useState("");

  const [
    operationUsername,
    setOperationUsername,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const loadFollowing =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const usernames =
          await readFollowing();

        const users =
          usernames.map(
            (username) =>
              getDirectoryUser(
                username,
              ) ??
              createFallbackUser(
                username,
              ),
          );

        setFollowingUsers(users);
      } catch (error) {
        console.error(
          "Unable to load following:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load your Following list.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFollowing();
    }, [loadFollowing]),
  );

  const visibleUsers =
    useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      if (!normalizedQuery) {
        return followingUsers;
      }

      return followingUsers.filter(
        (user) =>
          [
            user.displayName,
            user.username,
            user.bio,
            ...user.genres,
          ].some((value) =>
            value
              .toLowerCase()
              .includes(
                normalizedQuery,
              ),
          ),
      );
    }, [
      followingUsers,
      query,
    ]);

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

  function confirmUnfollow(
    user: DirectoryUser,
  ) {
    Alert.alert(
      `Unfollow ${user.displayName}?`,
      `@${user.username} will be removed from your Following list.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unfollow",
          style: "destructive",
          onPress: () => {
            void removeFollowing(
              user,
            );
          },
        },
      ],
    );
  }

  async function removeFollowing(
    user: DirectoryUser,
  ) {
    try {
      setOperationUsername(
        user.username,
      );

      await unfollowUser(
        user.username,
        user.displayName,
      );

      setFollowingUsers(
        followingUsers.filter(
          (item) =>
            item.username !==
            user.username,
        ),
      );
    } catch (error) {
      console.error(
        "Unable to unfollow:",
        error,
      );

      Alert.alert(
        "Unable to unfollow",
        "Canal could not update your Following list.",
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
              ‹ You
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Following
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/friends",
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
              Find
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.eyebrow}>
            YOUR PEOPLE
          </Text>

          <Text style={styles.heading}>
            Following.
          </Text>

          <Text
            style={styles.description}
          >
            Return to the people and
            public Soundscapes you
            follow.
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
            placeholder="Search Following"
            placeholderTextColor="#777f79"
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
              name="person-add-outline"
              size={31}
              color="#ff9a50"
            />

            <Text
              style={styles.emptyTitle}
            >
              Nobody here yet
            </Text>

            <Text
              style={styles.emptyText}
            >
              Follow people from
              Discover or Find Friends.
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
            style={styles.userList}
          >
            {visibleUsers.map(
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
                        onPress={() =>
                          confirmUnfollow(
                            user,
                          )
                        }
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
                            color="#ff9187"
                          />
                        ) : (
                          <Text
                            style={
                              styles.unfollowText
                            }
                          >
                            Unfollow
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

  unfollowText: {
    color: "#ff9187",
    fontSize: 11,
    fontWeight: "800",
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