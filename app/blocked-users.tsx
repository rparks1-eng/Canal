import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useEffect,
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

import {
  readBlockedUserReferences,
  unblockUser,
} from "../lib/relationships";

import type {
  BlockedUserReference,
} from "../lib/relationships";

import {
  isSupabaseConfigured,
} from "../lib/supabase";

import {
  getDirectoryUser,
} from "../lib/user-directory";

import type {
  DirectoryUser,
} from "../lib/user-directory";

import {
  useAuth,
} from "../providers/auth-provider";

type BlockedUserListItem = {
  identity: string;
  reference:
    BlockedUserReference;
  user: DirectoryUser;
};

export default function BlockedUsersScreen() {
  const {
    accountEpoch,
    sessionGeneration,
    user,
  } = useAuth();

  const identityKey =
    `${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`;

  return (
    <BlockedUsersScreenContent
      key={
        identityKey
      }
      identityKey={
        identityKey
      }
    />
  );
}

function BlockedUsersScreenContent(
  props: {
    identityKey: string;
  },
) {
  const {
    identityKey,
  } = props;

  const [
    blockedUsers,
    setBlockedUsers,
  ] =
    useState<
      BlockedUserListItem[]
    >([]);

  const [
    operationKey,
    setOperationKey,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const mountedRef =
    useRef(
      true,
    );

  const identityKeyRef =
    useRef(
      identityKey,
    );

  const loadVersionRef =
    useRef(
      0,
    );

  identityKeyRef.current =
    identityKey;

  useEffect(
    () => {
      mountedRef.current =
        true;

      return () => {
        mountedRef.current =
          false;
      };
    },
    [],
  );

  const loadBlockedUsers =
    useCallback(async () => {
      const requestKey =
        identityKey;
      const loadVersion =
        loadVersionRef.current +
        1;

      loadVersionRef.current =
        loadVersion;

      const isCurrent =
        (): boolean =>
          mountedRef.current &&
          identityKeyRef.current ===
            requestKey &&
          loadVersionRef.current ===
            loadVersion;

      try {
        if (isCurrent()) {
          setIsLoading(true);
        }

        const references =
          await readBlockedUserReferences();

        if (!isCurrent()) {
          return;
        }

        const nextBlockedUsers =
          references
            .map(
              createBlockedUserListItem,
            )
            .filter(
              (
                item,
              ): item is BlockedUserListItem =>
                item !==
                null,
            );

        setBlockedUsers(
          nextBlockedUsers,
        );
      } catch (error) {
        if (!isCurrent()) {
          return;
        }

        console.error(
          "Unable to load blocked users:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load blocked users.",
        );
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    }, [
      identityKey,
    ]);

  useFocusEffect(
    useCallback(() => {
      void loadBlockedUsers();
    }, [loadBlockedUsers]),
  );

  function confirmUnblock(
    item: BlockedUserListItem,
  ) {
    const {
      user,
    } = item;

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
              item,
            );
          },
        },
      ],
    );
  }

  async function removeBlockedUser(
    item: BlockedUserListItem,
  ) {
    const requestKey =
      identityKey;

    if (
      !mountedRef.current ||
      identityKeyRef.current !==
        requestKey ||
      operationKey
    ) {
      return;
    }

    const {
      reference,
      user,
    } = item;

    const targetUserId =
      reference.targetUserId;

    if (
      isSupabaseConfigured &&
      !targetUserId
    ) {
      Alert.alert(
        "Unable to unblock safely",
        "This older block record does not have a stable account ID. Canal will not match it to a reused username.",
      );

      return;
    }

    try {
      loadVersionRef.current +=
        1;

      setOperationKey(
        item.identity,
      );

      const state =
        await unblockUser(
          user.username,
          user.displayName,
          targetUserId,
        );

      if (
        !mountedRef.current ||
        identityKeyRef.current !==
          requestKey
      ) {
        return;
      }

      loadVersionRef.current +=
        1;

      setBlockedUsers(
        (current) =>
          current.filter(
            (candidate) =>
              candidate
                .identity !==
              item.identity,
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
      if (
        !mountedRef.current ||
        identityKeyRef.current !==
          requestKey
      ) {
        return;
      }

      console.error(
        "Unable to unblock user:",
        error,
      );

      Alert.alert(
        "Unable to unblock",
        "Canal could not unblock this person.",
      );
    } finally {
      if (
        mountedRef.current &&
        identityKeyRef.current ===
          requestKey
      ) {
        setOperationKey(
          (current) =>
            current ===
              item.identity
              ? ""
              : current,
        );
      }
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
            your Following list.
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
              (item) => {
                const {
                  user,
                } = item;

                const isOperating =
                  operationKey ===
                  item.identity;

                const operationInProgress =
                  operationKey !==
                  "";

                return (
                  <View
                    key={
                      item.identity
                    }
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
                      accessibilityLabel={`Unblock ${user.displayName}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        busy:
                          isOperating,
                        disabled:
                          operationInProgress,
                      }}
                      disabled={
                        operationInProgress
                      }
                      onPress={() =>
                        confirmUnblock(
                          item,
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

function createBlockedUserListItem(
  reference:
    BlockedUserReference,
): BlockedUserListItem | null {
  const identity =
    blockedUserIdentity(
      reference,
    );

  if (!identity) {
    return null;
  }

  const user =
    getDirectoryUser(
      reference.username,
    ) ??
    createFallbackUser(
      reference.username,
    );

  return {
    identity,
    reference,
    user,
  };
}

function blockedUserIdentity(
  reference:
    BlockedUserReference,
): string | null {
  const targetUserId =
    reference.targetUserId
      ?.trim()
      .toLowerCase();

  if (targetUserId) {
    return `uuid:${targetUserId}`;
  }

  if (
    !isSupabaseConfigured
  ) {
    return `local-username:${reference.username}`;
  }

  return null;
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
    backgroundColor: "#F3EFE5",
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
    minHeight: 48,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 90,
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
    minHeight: 48,
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
