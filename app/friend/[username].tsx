import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useRef,
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

import { useAuth } from "../../providers/auth-provider";

import {
  shareSoundscape,
} from "../../lib/canal-share";
import {
  blockUser,
  followUser,
  readRelationshipState,
  unblockUser,
  unfollowUser,
} from "../../lib/relationships";
import {
  DirectoryUser,
  getDirectoryUser,
} from "../../lib/user-directory";

export default function FriendProfileScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const params =
    useLocalSearchParams();

  const username =
    firstParam(params.username)
      .trim()
      .toLowerCase()
      .replace(/^@+/, "");

  return (
    <FriendProfileContent
      key={`${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}:${username}`}
    />
  );
}

function FriendProfileContent() {
  const params =
    useLocalSearchParams();

  const username =
    firstParam(params.username)
      .trim()
      .toLowerCase()
      .replace(/^@+/, "");

  const [user, setUser] =
    useState<DirectoryUser | null>(
      null,
    );

  const [
    isFollowing,
    setIsFollowing,
  ] = useState(false);

  const [
    isBlocked,
    setIsBlocked,
  ] = useState(false);

  const [isLoading, setIsLoading] =
    useState(true);
  const [isSharing, setIsSharing] =
    useState(false);
  const shareInFlight = useRef(false);

  const [
    isUpdating,
    setIsUpdating,
  ] = useState(false);

  const loadProfile =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const [
          foundUser,
          relationshipState,
        ] = await Promise.all([
          Promise.resolve(
            getDirectoryUser(
              username,
            ),
          ),
          readRelationshipState(),
        ]);

        setUser(foundUser);

        setIsFollowing(
          relationshipState.following.includes(
            username,
          ),
        );

        setIsBlocked(
          relationshipState.blocked.includes(
            username,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    }, [username]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  async function toggleFollowing() {
    if (
      !user ||
      isUpdating
    ) {
      return;
    }

    if (isBlocked) {
      Alert.alert(
        "User is blocked",
        "Unblock this person before following them.",
      );

      return;
    }

    try {
      setIsUpdating(true);

      if (isFollowing) {
        const state =
          await unfollowUser(
            user.username,
            user.displayName,
          );

        setIsFollowing(false);
        showPendingRelationshipSync(
          state.syncStatus,
        );
      } else {
        const state =
          await followUser(
            user.username,
            user.displayName,
          );

        setIsFollowing(true);
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
      setIsUpdating(false);
    }
  }

  function confirmBlock() {
    if (!user) {
      return;
    }

    Alert.alert(
      `Block ${user.displayName}?`,
      `@${user.username} will be removed from Following and hidden from Discover.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void handleBlock();
          },
        },
      ],
    );
  }

  async function handleBlock() {
    if (
      !user ||
      isUpdating
    ) {
      return;
    }

    try {
      setIsUpdating(true);

      const state =
        await blockUser(
          user.username,
          user.displayName,
        );

      setIsFollowing(false);
      setIsBlocked(true);
      showPendingRelationshipSync(
        state.syncStatus,
      );
    } catch (error) {
      console.error(
        "Unable to block user:",
        error,
      );

      Alert.alert(
        "Unable to block",
        "Canal could not block this person.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleUnblock() {
    if (
      !user ||
      isUpdating
    ) {
      return;
    }

    try {
      setIsUpdating(true);

      const state =
        await unblockUser(
          user.username,
          user.displayName,
        );

      setIsBlocked(false);
      showPendingRelationshipSync(
        state.syncStatus,
      );
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
      setIsUpdating(false);
    }
  }

  async function handleShare() {
    if (!user || shareInFlight.current) {
      return;
    }

    if (
      user.visibility !==
      "public"
    ) {
      Alert.alert(
        "Private Soundscape",
        "This Soundscape cannot be shared.",
      );

      return;
    }

    try {
      shareInFlight.current = true;
      setIsSharing(true);
      const result =
        await shareSoundscape({
          username:
            user.username,

          displayName:
            user.displayName,

          bio: user.bio,

          genres:
            user.genres,

          favoriteArtists:
            user.favoriteArtists,
        });

      if (
        result.method ===
        "clipboard"
      ) {
        Alert.alert(
          "Soundscape copied",
          "The Soundscape was copied to your clipboard.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share this Soundscape.",
      );
    } finally {
      shareInFlight.current = false;
      setIsSharing(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView
        style={styles.screen}
      >
        <View
          style={styles.centered}
        >
          <ActivityIndicator
            size="large"
            color="#ff7a1a"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView
        style={styles.screen}
      >
        <View
          style={styles.centered}
        >
          <Ionicons
            name="person-outline"
            size={42}
            color={canalDynamicColors.gold}
          />

          <Text
            style={
              styles.notFoundTitle
            }
          >
            User not found
          </Text>

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
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isBlocked) {
    return (
      <SafeAreaView
        style={styles.screen}
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
            Soundscape
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={styles.centered}
        >
          <View
            style={styles.blockedIcon}
          >
            <Ionicons
              name="ban-outline"
              size={38}
              color={canalDynamicColors.danger}
            />
          </View>

          <Text
            style={
              styles.notFoundTitle
            }
          >
            @{user.username} is blocked
          </Text>

          <Text
            style={styles.centeredText}
          >
            Their Soundscape and
            activity are hidden.
          </Text>

          <Pressable
            accessibilityLabel={`Unblock ${user.displayName}`}
            accessibilityRole="button"
            accessibilityState={{ busy: isUpdating, disabled: isUpdating }}
            disabled={isUpdating}
            onPress={() => {
              void handleUnblock();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              isUpdating &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator
                color="#17110c"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Unblock
              </Text>
            )}
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
              Manage Blocked Users
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (
    user.visibility ===
    "private"
  ) {
    return (
      <SafeAreaView
        style={styles.screen}
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
            Soundscape
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={styles.centered}
        >
          <View
            style={styles.privateIcon}
          >
            <Ionicons
              name="lock-closed-outline"
              size={38}
              color={canalDynamicColors.gold}
            />
          </View>

          <Text
            style={
              styles.notFoundTitle
            }
          >
            Private Soundscape
          </Text>

          <Text
            style={styles.centeredText}
          >
            @{user.username} has not
            made their Soundscape
            public.
          </Text>

          <Pressable
            accessibilityLabel={`Follow ${user.displayName}`}
            accessibilityRole="button"
            accessibilityState={{ busy: isUpdating, disabled: isUpdating }}
            disabled={isUpdating}
            onPress={() => {
              void toggleFollowing();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              isUpdating &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              {isFollowing
                ? "Following"
                : "Follow"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
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
            Soundscape
          </Text>

          <Pressable
            accessibilityLabel={`Share ${user.displayName} Soundscape`}
            accessibilityRole="button"
            accessibilityState={{ busy: isSharing, disabled: isSharing }}
            disabled={isSharing}
            onPress={() => {
              void handleShare();
            }}
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
              Share
            </Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text
              style={styles.avatarText}
            >
              {user.initials}
            </Text>
          </View>

          <Text
            style={
              styles.displayName
            }
          >
            {user.displayName}
          </Text>

          <Text
            style={styles.username}
          >
            @{user.username}
          </Text>

          <View
            style={styles.publicBadge}
          >
            <Ionicons
              name="globe-outline"
              size={12}
              color={canalDynamicColors.mint}
            />

            <Text
              style={
                styles.publicBadgeText
              }
            >
              PUBLIC SOUNDSCAPE
            </Text>
          </View>

          {user.bio ? (
            <Text style={styles.bio}>
              {user.bio}
            </Text>
          ) : null}
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityLabel={`${isFollowing ? "Unfollow" : "Follow"} ${user.displayName}`}
            accessibilityRole="button"
            accessibilityState={{ busy: isUpdating, disabled: isUpdating }}
            disabled={isUpdating}
            onPress={() => {
              void toggleFollowing();
            }}
            style={({ pressed }) => [
              styles.followButton,
              isFollowing &&
                styles.followingButton,
              isUpdating &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator
                color={
                  isFollowing
                    ? "#ff9a50"
                    : "#17110c"
                }
              />
            ) : (
              <Text
                style={[
                  styles.followButtonText,
                  isFollowing &&
                    styles.followingButtonText,
                ]}
              >
                {isFollowing
                  ? "Following"
                  : "Follow"}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityLabel={`Share ${user.displayName} Soundscape`}
            accessibilityRole="button"
            accessibilityState={{ busy: isSharing, disabled: isSharing }}
            disabled={isSharing}
            onPress={() => {
              void handleShare();
            }}
            style={({ pressed }) => [
              styles.shareButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              name="share-social-outline"
              size={19}
              color={canalDynamicColors.gold}
            />

            <Text
              style={styles.shareText}
            >
              Share
            </Text>
          </Pressable>
        </View>

        <View
          style={
            styles.informationCard
          }
        >
          <Text
            style={styles.cardTitle}
          >
            Music taste
          </Text>

          <InformationSection
            label="Genres"
            values={user.genres}
          />

          <InformationSection
            label="Favorite artists"
            values={
              user.favoriteArtists
            }
          />
        </View>

        <View style={styles.section}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            Recent Scenes
          </Text>

          {user.recentScenes.length ===
          0 ? (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={styles.emptyText}
              >
                No public Scenes yet.
              </Text>
            </View>
          ) : (
            user.recentScenes.map(
              (
                sceneName,
                index,
              ) => (
                <View
                  key={`${sceneName}-${index}`}
                  style={
                    styles.sceneCard
                  }
                >
                  <View
                    style={
                      styles.sceneArtwork
                    }
                  >
                    <Text
                      style={
                        styles.sceneArtworkText
                      }
                    >
                      {getInitials(
                        sceneName,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.sceneInformation
                    }
                  >
                    <Text
                      style={
                        styles.sceneName
                      }
                    >
                      {sceneName}
                    </Text>

                    <Text
                      style={
                        styles.sceneSubtitle
                      }
                    >
                      Public Scene
                    </Text>
                  </View>
                </View>
              ),
            )
          )}
        </View>

        <Pressable
          accessibilityLabel={`Share ${user.displayName} Soundscape`}
          accessibilityRole="button"
          accessibilityState={{ busy: isSharing, disabled: isSharing }}
          disabled={isSharing}
          onPress={() => {
            void handleShare();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons
            name="share-social-outline"
            size={20}
            color={canalDynamicColors.text}
          />

          <Text
            style={
              styles.primaryButtonText
            }
          >
            Share Soundscape
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Block ${user.displayName}`}
          accessibilityRole="button"
          accessibilityState={{ busy: isUpdating, disabled: isUpdating }}
          disabled={isUpdating}
          onPress={
            confirmBlock
          }
          style={({ pressed }) => [
            styles.blockButton,
            isUpdating &&
              styles.disabled,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.blockButtonText
            }
          >
            Block @{user.username}
          </Text>
        </Pressable>
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

function InformationSection({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <View
      style={
        styles.informationSection
      }
    >
      <Text
        style={
          styles.informationLabel
        }
      >
        {label}
      </Text>

      <View
        style={styles.chipGrid}
      >
        {values.map((value) => (
          <View
            key={value}
            style={styles.chip}
          >
            <Text
              style={
                styles.chipText
              }
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getInitials(
  value: string,
): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "CA";
  }

  return words
    .slice(0, 2)
    .map((word) =>
      word
        .charAt(0)
        .toUpperCase(),
    )
    .join("");
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
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
    paddingHorizontal: 23,
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
    fontFamily: "Georgia",
    fontSize: 16,
    fontWeight: "700",
  },

  headerAction: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
    paddingHorizontal: 25,
  },

  centeredText: {
    maxWidth: 320,
    color: canalDynamicColors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  notFoundTitle: {
    color: canalDynamicColors.text,
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
  },

  blockedIcon: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 41,
    backgroundColor: "#271716",
  },

  privateIcon: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 41,
    backgroundColor: "#2b1d14",
  },

  hero: {
    alignItems: "center",
  },

  avatar: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 59,
    backgroundColor: "#2b1d14",
  },

  avatarText: {
    color: canalDynamicColors.gold,
    fontSize: 34,
    fontWeight: "800",
  },

  displayName: {
    marginTop: 15,
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
  },

  username: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 14,
  },

  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#1d5b32",
  },

  publicBadgeText: {
    color: canalDynamicColors.mint,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  bio: {
    maxWidth: 330,
    marginTop: 13,
    color: "#c5cbc6",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },

  followButton: {
    minHeight: 52,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  followingButton: {
    borderWidth: 1,
    borderColor: "#39413c",
    backgroundColor: canalDynamicColors.surface,
  },

  followButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  followingButtonText: {
    color: "#c5cbc6",
  },

  shareButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 16,
    backgroundColor: "#211810",
  },

  shareText: {
    color: canalDynamicColors.gold,
    fontSize: 13,
    fontWeight: "800",
  },

  informationCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  cardTitle: {
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  informationSection: {
    gap: 9,
  },

  informationLabel: {
    color: canalDynamicColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },

  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#252c28",
  },

  chipText: {
    color: canalDynamicColors.text,
    fontSize: 12,
    fontWeight: "600",
  },

  section: {
    gap: 12,
  },

  sectionTitle: {
    color: canalDynamicColors.text,
    fontSize: 20,
    fontWeight: "700",
  },

  emptyCard: {
    padding: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 18,
  },

  emptyText: {
    color: canalDynamicColors.muted,
    fontSize: 13,
  },

  sceneCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  sceneArtwork: {
    width: 45,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderRadius: 14,
    backgroundColor: "#2b1d14",
  },

  sceneArtworkText: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  sceneInformation: {
    flex: 1,
  },

  sceneName: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  sceneSubtitle: {
    marginTop: 4,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  primaryButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 15,
    backgroundColor: canalDynamicColors.surface,
  },

  secondaryButtonText: {
    color: canalDynamicColors.gold,
    fontSize: 13,
    fontWeight: "700",
  },

  blockButton: {
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4f302d",
    borderRadius: 15,
    backgroundColor: "#1d1514",
  },

  blockButtonText: {
    color: canalDynamicColors.danger,
    fontSize: 13,
    fontWeight: "700",
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
