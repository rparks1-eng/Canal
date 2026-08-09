import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  captureProfileSocialAccount,
  loadProfileConnectionSummary,
  loadProfileFollowers,
  loadProfileFollowing,
} from "../lib/profile-social";
import type {
  ProfileConnection,
  ProfileConnectionSummary,
} from "../lib/profile-social";
import {
  followUser,
  unfollowUser,
} from "../lib/relationships";
import {
  useAuth,
} from "../providers/auth-provider";

type ConnectionMode =
  | "following"
  | "followers";

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(
    value,
  )
    ? value[0] ??
        ""
    : value ??
        "";
}

function connectionInitials(
  connection: ProfileConnection,
): string {
  return (
    connection.profile.displayName
      .trim()
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      )
      .slice(
        0,
        2,
      )
      .map(
        (word) =>
          word
            .charAt(
              0,
            )
            .toUpperCase(),
      )
      .join("") ||
    "C"
  );
}

export default function FollowingScreen() {
  const {
    user,
  } =
    useAuth();

  const params =
    useLocalSearchParams<{
      mode?:
        | string
        | string[];
      profileId?:
        | string
        | string[];
    }>();

  const requestedMode =
    firstParam(
      params.mode,
    );

  const mode:
    ConnectionMode =
      requestedMode ===
      "followers"
        ? "followers"
        : "following";

  const viewerId =
    user?.id ??
    "";

  const explicitProfileId =
    firstParam(
      params.profileId,
    );

  const profileId =
    explicitProfileId ||
    viewerId;

  const loadIdentity = [
    viewerId,
    profileId,
    mode,
  ].join(
    ":",
  );

  const [
    connections,
    setConnections,
  ] =
    useState<
      ProfileConnection[]
    >([]);

  const [
    summary,
    setSummary,
  ] =
    useState<
      ProfileConnectionSummary | null
    >(
      null,
    );

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    operationId,
    setOperationId,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    dismissedError,
    setDismissedError,
  ] = useState("");

  const [
    loadedIdentity,
    setLoadedIdentity,
  ] = useState("");

  const loadSequenceRef =
    useRef(0);

  const activeLoadIdentityRef =
    useRef(
      loadIdentity,
    );

  activeLoadIdentityRef.current =
    loadIdentity;

  useEffect(
    () => {
      loadSequenceRef.current +=
        1;
      setConnections(
        [],
      );
      setSummary(
        null,
      );
      setErrorMessage(
        "",
      );
      setDismissedError(
        "",
      );
      setOperationId(
        "",
      );
      setLoadedIdentity(
        "",
      );
      setLoading(
        true,
      );
    },
    [
      loadIdentity,
    ],
  );

  const load =
    useCallback(
      async (): Promise<void> => {
        const expectedIdentity =
          loadIdentity;

        const loadSequence =
          loadSequenceRef.current +
          1;

        loadSequenceRef.current =
          loadSequence;

        setConnections(
          [],
        );
        setSummary(
          null,
        );
        setErrorMessage(
          "",
        );
        setDismissedError(
          "",
        );

        if (
          !viewerId ||
          !profileId
        ) {
          setErrorMessage(
            "Sign in to view profile connections.",
          );
          setLoadedIdentity(
            expectedIdentity,
          );
          setLoading(
            false,
          );
          return;
        }

        setLoading(
          true,
        );

        try {
          const account =
            await captureProfileSocialAccount(
              viewerId,
            );

          const [
            nextConnections,
            nextSummary,
          ] =
            await Promise.all([
              mode ===
                "followers"
                ? loadProfileFollowers(
                    profileId,
                    {
                      account,
                    },
                  )
                : loadProfileFollowing(
                    profileId,
                    {
                      account,
                    },
                  ),
              loadProfileConnectionSummary(
                profileId,
                {
                  account,
                },
                ),
            ]);

          if (
            loadSequence !==
              loadSequenceRef.current ||
            expectedIdentity !==
              activeLoadIdentityRef.current
          ) {
            return;
          }

          setConnections(
            nextConnections,
          );
          setSummary(
            nextSummary,
          );
          setErrorMessage(
            "",
          );
          setLoadedIdentity(
            expectedIdentity,
          );
        } catch (error) {
          if (
            loadSequence !==
              loadSequenceRef.current ||
            expectedIdentity !==
              activeLoadIdentityRef.current
          ) {
            return;
          }

          setErrorMessage(
            error instanceof
              Error
              ? error.message
              : "Canal could not load these profiles.",
          );
          setLoadedIdentity(
            expectedIdentity,
          );
        } finally {
          if (
            loadSequence ===
              loadSequenceRef.current &&
            expectedIdentity ===
              activeLoadIdentityRef.current
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        loadIdentity,
        mode,
        profileId,
        viewerId,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();

        return () => {
          loadSequenceRef.current +=
            1;
        };
      },
      [
        load,
      ],
    ),
  );

  const isCurrentIdentity =
    loadedIdentity ===
    loadIdentity;

  const currentSummary =
    isCurrentIdentity
      ? summary
      : null;

  const currentErrorMessage =
    isCurrentIdentity &&
    errorMessage !==
      dismissedError
      ? errorMessage
      : "";

  const currentLoading =
    loading ||
    !isCurrentIdentity;

  const visibleConnections =
    useMemo(
      () => {
        const currentConnections =
          isCurrentIdentity
            ? connections
            : [];

        const normalizedQuery =
          query
            .trim()
            .toLowerCase();

        if (!normalizedQuery) {
          return currentConnections;
        }

        return currentConnections.filter(
          (connection) =>
            [
              connection.profile
                .displayName,
              connection.profile
                .handle,
              connection.profile
                .bio,
              connection.profile
                .favoriteActivities,
            ].some(
              (value) =>
                value
                  .toLowerCase()
                  .includes(
                    normalizedQuery,
                  ),
            ),
        );
      },
      [
        connections,
        isCurrentIdentity,
        query,
      ],
    );

  function showMode(
    nextMode:
      ConnectionMode,
  ): void {
    router.replace({
      pathname:
        "/following",
      params: {
        profileId,
        mode:
          nextMode,
      },
    });
  }

  async function toggleFollow(
    connection:
      ProfileConnection,
  ): Promise<void> {
    const {
      profile,
      viewerIsFollowing,
    } =
      connection;

    if (
      operationId ||
      profile.id ===
        viewerId
    ) {
      return;
    }

    const operationIdentity =
      loadIdentity;

    setOperationId(
      profile.id,
    );
    setErrorMessage(
      "",
    );
    setDismissedError(
      "",
    );

    try {
      if (
        viewerIsFollowing
      ) {
        await unfollowUser(
          profile
            .normalizedHandle,
          profile.displayName,
          profile.id,
        );
      } else {
        await followUser(
          profile
            .normalizedHandle,
          profile.displayName,
          profile.id,
        );
      }

      if (
        operationIdentity !==
        activeLoadIdentityRef.current
      ) {
        return;
      }

      setConnections(
        (current) =>
          current.map(
            (item) =>
              item.profile
                .id ===
              profile.id
                ? {
                    ...item,
                    viewerIsFollowing:
                      !viewerIsFollowing,
                  }
                : item,
          ),
      );

      if (
        profileId ===
        viewerId
      ) {
        setSummary(
          (current) =>
            current
              ? {
                  ...current,
                  followingCount:
                    Math.max(
                      0,
                      current
                        .followingCount +
                        (
                          viewerIsFollowing
                            ? -1
                            : 1
                        ),
                    ),
                }
              : current,
        );
      }
    } catch (error) {
      if (
        operationIdentity !==
        activeLoadIdentityRef.current
      ) {
        return;
      }

      setErrorMessage(
        error instanceof
          Error
          ? error.message
          : "Canal could not update this follow.",
      );
    } finally {
      if (
        operationIdentity ===
        activeLoadIdentityRef.current
      ) {
        setOperationId(
          "",
        );
      }
    }
  }

  const ownList =
    profileId ===
    viewerId;

  return (
    <SafeAreaView
      style={
        styles.screen
      }
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={
          styles.page
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            styles.header
          }
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (
                router.canGoBack()
              ) {
                router.back();
              } else {
                router.replace(
                  "/(tabs)/profile",
                );
              }
            }}
            style={
              styles.backButton
            }
          >
            <Text
              style={
                styles.backText
              }
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              selectable
              style={
                styles.title
              }
            >
              Connections
            </Text>

            <Text
              selectable
              style={
                styles.subtitle
              }
            >
              {ownList
                ? "Your Canal network"
                : "Public profile network"}
            </Text>
          </View>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={
            styles.segment
          }
        >
          <Pressable
            accessibilityLabel="Show following"
            accessibilityRole="tab"
            accessibilityState={{
              selected:
                mode ===
                "following",
            }}
            onPress={() =>
              showMode(
                "following",
              )
            }
            style={[
              styles.segmentButton,
              mode ===
                "following" &&
                styles.segmentButtonActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                mode ===
                  "following" &&
                  styles.segmentTextActive,
              ]}
            >
              Following{" "}
              {currentSummary
                ?.followingCount ??
                "—"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Show followers"
            accessibilityRole="tab"
            accessibilityState={{
              selected:
                mode ===
                "followers",
            }}
            onPress={() =>
              showMode(
                "followers",
              )
            }
            style={[
              styles.segmentButton,
              mode ===
                "followers" &&
                styles.segmentButtonActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                mode ===
                  "followers" &&
                  styles.segmentTextActive,
              ]}
            >
              Followers{" "}
              {currentSummary
                ?.followerCount ??
                "—"}
            </Text>
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel="Search profile connections"
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder="Search people"
          placeholderTextColor={canalDynamicColors.muted}
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.search
          }
        />

        {currentErrorMessage ? (
          <View
            accessibilityRole="alert"
            style={
              styles.error
            }
          >
            <View
              style={
                styles.errorHeader
              }
            >
              <Text
                selectable
                style={
                  styles.errorText
                }
              >
                {currentErrorMessage}
              </Text>

              <Pressable
                accessibilityLabel="Dismiss following error"
                accessibilityRole="button"
                onPress={() =>
                  setDismissedError(
                    currentErrorMessage,
                  )
                }
                style={
                  styles.dismissErrorButton
                }
              >
                <Text
                  style={
                    styles.dismissErrorText
                  }
                >
                  ×
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityLabel="Retry profile connections"
              accessibilityRole="button"
              onPress={() =>
                void load()
              }
              style={
                styles.retryButton
              }
            >
              <Text
                style={
                  styles.retryText
                }
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {currentLoading ? (
          <View
            style={
              styles.loading
            }
          >
            <ActivityIndicator
              size="large"
              color="#4C46C8"
            />
          </View>
        ) : visibleConnections
            .length ===
          0 ? (
          <View
            style={
              styles.empty
            }
          >
            <Text
              selectable
              style={
                styles.emptyTitle
              }
            >
              {query
                ? "No matching profiles"
                : mode ===
                    "following"
                  ? "Not following anyone yet"
                  : "No followers yet"}
            </Text>

            <Text
              selectable
              style={
                styles.emptyText
              }
            >
              Discover public creators and follow the people whose Scenes you want to revisit.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {visibleConnections.map(
              (
                connection,
              ) => {
                const {
                  profile,
                } =
                  connection;

                return (
                  <View
                    key={
                      profile.id
                    }
                    style={
                      styles.card
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/creator/[userId]",
                          params: {
                            userId:
                              profile.id,
                          },
                        })
                      }
                      style={
                        styles.profileButton
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
                          {connectionInitials(
                            connection,
                          )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.profileCopy
                        }
                      >
                        <View
                          style={
                            styles.nameRow
                          }
                        >
                          <Text
                            numberOfLines={
                              1
                            }
                            style={
                              styles.name
                            }
                          >
                            {
                              profile.displayName
                            }
                          </Text>

                          {profile.isCanal ||
                          profile.isVerified ? (
                            <Text
                              style={
                                styles.verified
                              }
                            >
                              {profile.isCanal
                                ? "CANAL"
                                : "VERIFIED"}
                            </Text>
                          ) : null}
                        </View>

                        <Text
                          style={
                            styles.handle
                          }
                        >
                          {
                            profile.handle
                          }
                        </Text>
                      </View>
                    </Pressable>

                    {profile.id !==
                    viewerId ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          Boolean(
                            operationId,
                          )
                        }
                        onPress={() =>
                          void toggleFollow(
                            connection,
                          )
                        }
                        style={[
                          styles.followButton,
                          connection
                            .viewerIsFollowing &&
                            styles.followButtonActive,
                        ]}
                      >
                        {operationId ===
                        profile.id ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFDF8"
                          />
                        ) : (
                          <Text
                            style={
                              styles.followText
                            }
                          >
                            {connection
                              .viewerIsFollowing
                              ? "Following"
                              : "Follow"}
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
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

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },
    page: {
      paddingHorizontal: 20,
      paddingBottom: 120,
      gap: 16,
    },
    header: {
      minHeight: 58,
      flexDirection:
        "row",
      alignItems:
        "center",
    },
    backButton: {
      width: 48,
      height: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 22,
      backgroundColor:
        "#F4EAE2",
    },
    backText: {
      color: canalDynamicColors.text,
      fontSize: 32,
      lineHeight: 34,
    },
    headerCopy: {
      flex: 1,
      alignItems:
        "center",
    },
    headerSpacer: {
      width: 44,
    },
    title: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 21,
      fontWeight: "900",
    },
    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 2,
    },
    segment: {
      flexDirection:
        "row",
      gap: 8,
      borderRadius: 16,
      padding: 4,
      backgroundColor:
        "#F1E7DF",
    },
    segmentButton: {
      minHeight: 48,
      justifyContent: "center",
      flex: 1,
      alignItems:
        "center",
      borderRadius: 12,
      paddingVertical: 11,
    },
    segmentButtonActive: {
      backgroundColor: canalDynamicColors.surface,
    },
    segmentText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    segmentTextActive: {
      color: canalDynamicColors.text,
    },
    search: {
      minHeight: 48,
      borderWidth: 1,
      borderColor:
        "#E7D8CC",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 14,
      paddingHorizontal: 16,
    },
    loading: {
      minHeight: 220,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    list: {
      gap: 10,
    },
    card: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      borderWidth: 1,
      borderColor:
        "#ECDDD2",
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      padding: 13,
    },
    profileButton: {
      flex: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
    },
    avatar: {
      width: 46,
      height: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 23,
      backgroundColor:
        "#4C46C8",
    },
    avatarText: {
      color: "#FFFDF8",
      fontSize: 13,
      fontWeight: "900",
    },
    profileCopy: {
      flex: 1,
      gap: 3,
    },
    nameRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 6,
    },
    name: {
      flexShrink: 1,
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    handle: {
      color: "#6D6B64",
      fontSize: 11,
    },
    verified: {
      borderRadius: 6,
      backgroundColor: canalDynamicColors.warningSurface,
      color: canalDynamicColors.gold,
      fontSize: 8,
      fontWeight: "900",
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    followButton: {
      minWidth: 78,
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor:
        "#4C46C8",
      paddingHorizontal: 12,
    },
    followButtonActive: {
      backgroundColor:
        "#51463E",
    },
    followText: {
      color: canalDynamicColors.text,
      fontSize: 11,
      fontWeight: "900",
    },
    error: {
      borderRadius: 16,
      backgroundColor:
        "#FCE7E5",
      padding: 14,
      gap: 10,
    },
    errorHeader: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 10,
    },
    dismissErrorButton: {
      width: 48,
      height: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop: -12,
      marginRight: -12,
    },
    dismissErrorText: {
      color: "#8D211C",
      fontSize: 25,
      lineHeight: 28,
      fontWeight: "700",
    },
    errorText: {
      flex: 1,
      color: "#9E3029",
      fontSize: 12,
      lineHeight: 18,
    },
    retryButton: {
      minHeight: 48,
      justifyContent: "center",
      alignSelf:
        "flex-start",
      borderRadius: 10,
      backgroundColor:
        "#9E3029",
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    retryText: {
      color: canalDynamicColors.text,
      fontSize: 10,
      fontWeight: "900",
    },
    empty: {
      alignItems:
        "center",
      borderWidth: 1,
      borderColor:
        "#ECDDD2",
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      padding: 28,
    },
    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },
    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign:
        "center",
      marginTop: 7,
    },
  });
