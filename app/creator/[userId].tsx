import {
  useCallback,
  useEffect,
  useMemo,
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

import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  PublicSnapshotGrid,
} from "../../components/PublicSnapshotCard";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  loadPublicProfileSnapshots,
} from "../../lib/public-snapshots";

import type {
  PublicCanalSnapshot,
} from "../../lib/public-snapshots";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  listPublicSceneCollections,
} from "../../lib/scene-collections";

import type {
  SceneCollectionSummary,
} from "../../lib/scene-collections";

import {
  loadProfileConnectionSummary,
} from "../../lib/profile-social";

import type {
  ProfileConnectionSummary,
} from "../../lib/profile-social";

import {
  blockUser,
  followUser,
  readBlockedUserReferences,
  unblockUser,
  unfollowUser,
} from "../../lib/relationships";

import type {
  BlockedUserReference,
} from "../../lib/relationships";

import {
  loadPublicProfile,
  savePublicSceneToLibrary,
} from "../../lib/social";

import type {
  PublicCanalProfile,
  PublicCanalScene,
} from "../../lib/social";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

function safeBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/explore" as never,
  );
}

function creatorInitials(
  profile: PublicCanalProfile,
): string {
  return profile.displayName
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
    .join("") || "C";
}

export default function CreatorProfileScreen() {
  const {
    user,
  } =
    useAuth();

  const params =
    useLocalSearchParams<{
      userId?: string;
    }>();

  const userId =
    typeof params.userId ===
      "string"
      ? params.userId
      : "";

  const viewerId =
    user?.id ??
    null;

  const identityKey =
    `${viewerId ?? "signed-out"}:${userId}`;

  return (
    <CreatorProfileScreenContent
      key={
        identityKey
      }
      identityKey={
        identityKey
      }
      userId={
        userId
      }
      viewerId={
        viewerId
      }
    />
  );
}

function CreatorProfileScreenContent(
  props: {
    identityKey: string;
    userId: string;
    viewerId:
      | string
      | null;
  },
) {
  const {
    status:
      connectivityStatus,
    refresh:
      refreshConnectivity,
  } =
    useConnectivity();

  const {
    identityKey,
    userId,
    viewerId,
  } =
    props;

  const [
    profile,
    setProfile,
  ] =
    useState<
      PublicCanalProfile | null
    >(
      null,
    );

  const [
    scenes,
    setScenes,
  ] =
    useState<
      PublicCanalScene[]
    >([]);

  const [
    snapshots,
    setSnapshots,
  ] =
    useState<
      PublicCanalSnapshot[]
    >([]);

  const [
    collections,
    setCollections,
  ] =
    useState<
      SceneCollectionSummary[]
    >([]);

  const [
    profileResolved,
    setProfileResolved,
  ] = useState(false);

  const [
    connectionSummary,
    setConnectionSummary,
  ] =
    useState<
      ProfileConnectionSummary | null
    >(
      null,
    );

  const [
    isBlocked,
    setIsBlocked,
  ] = useState(false);

  const [
    blockStateResolved,
    setBlockStateResolved,
  ] = useState(false);

  const [
    blockedReference,
    setBlockedReference,
  ] =
    useState<
      BlockedUserReference | null
    >(
      null,
    );

  const [
    relationshipOperation,
    setRelationshipOperation,
  ] =
    useState<
      | "follow"
      | "block"
      | "unblock"
      | null
    >(
      null,
    );

  const [
    snapshotsResolved,
    setSnapshotsResolved,
  ] = useState(false);

  const [
    collectionsResolved,
    setCollectionsResolved,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingKey,
    setSavingKey,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    routeErrorMessage,
    setRouteErrorMessage,
  ] = useState("");

  const [
    saveErrorMessage,
    setSaveErrorMessage,
  ] = useState("");

  const [
    relationshipErrorMessage,
    setRelationshipErrorMessage,
  ] = useState("");

  const [
    profileError,
    setProfileError,
  ] =
    useState<unknown | null>(
      null,
    );

  const [
    snapshotError,
    setSnapshotError,
  ] =
    useState<unknown | null>(
      null,
    );

  const [
    collectionError,
    setCollectionError,
  ] =
    useState<unknown | null>(
      null,
    );

  const [
    blockStateError,
    setBlockStateError,
  ] =
    useState<unknown | null>(
      null,
    );

  const loadPromiseRef =
    useRef<
      {
        key: string;
        promise:
          Promise<void>;
      } | null
    >(
      null,
    );

  const mountedRef =
    useRef(
      true,
    );

  const identityKeyRef =
    useRef(
      identityKey,
    );

  const relationshipVersionRef =
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

  const load =
    useCallback(
      async (): Promise<void> => {
        const requestKey =
          identityKey;
        const relationshipVersion =
          relationshipVersionRef.current;

        if (!userId) {
          setRouteErrorMessage(
            "The creator ID is missing.",
          );

          setLoading(
            false,
          );

          return;
        }

        if (
          loadPromiseRef.current
            ?.key ===
          requestKey
        ) {
          return loadPromiseRef.current
            .promise;
        }

        const isCurrent =
          (): boolean =>
            mountedRef.current &&
            requestKey ===
              identityKeyRef.current;

        const nextLoad =
          (async (): Promise<void> => {
            setLoading(
              true,
            );
            setBlockStateResolved(
              false,
            );
            setBlockStateError(
              null,
            );
            setRelationshipErrorMessage(
              "",
            );
            setCollections(
              [],
            );
            setCollectionsResolved(
              false,
            );

            setRouteErrorMessage(
              "",
            );

            const sessionError =
              !viewerId
                ? new Error(
                    "Your Canal account session is missing. Sign in to browse creator profiles.",
                  )
                : null;

            const profileLoad =
              (
                sessionError
                  ? Promise.reject(
                      sessionError,
                    )
                  : loadPublicProfile(
                      userId,
                    )
                )
                .then(
                  (result) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setProfile(
                      result.profile,
                    );

                    setScenes(
                      result.scenes,
                    );

                    setProfileResolved(
                      true,
                    );

                    setProfileError(
                      null,
                    );
                  },
                )
                .catch(
                  (error: unknown) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setProfileError(
                      error,
                    );
                  },
                );

            const snapshotLoad =
              (
                sessionError
                  ? Promise.reject(
                      sessionError,
                    )
                  : loadPublicProfileSnapshots(
                      userId,
                    )
                )
                .then(
                  (result) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setSnapshots(
                      result,
                    );

                    setSnapshotsResolved(
                      true,
                    );

                    setSnapshotError(
                      null,
                    );
                  },
                )
                .catch(
                  (error: unknown) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setSnapshotError(
                      error,
                    );
                  },
                );

            const connectionLoad =
              (
                sessionError
                  ? Promise.reject(
                      sessionError,
                    )
                  : loadProfileConnectionSummary(
                      userId,
                    )
              )
                .then(
                  (result) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setConnectionSummary(
                      result,
                    );
                  },
                )
                .catch(
                  () => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setConnectionSummary(
                      null,
                    );
                  },
                );

            const blockStateLoad =
              (
                sessionError
                  ? Promise.reject(
                      sessionError,
                    )
                  : readBlockedUserReferences()
              )
                .then(
                  (references) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    const matchingReference =
                      references.find(
                        (reference) =>
                          reference
                            .targetUserId ===
                          userId,
                      ) ??
                      null;

                    setBlockedReference(
                      matchingReference,
                    );
                    setIsBlocked(
                      matchingReference !==
                        null,
                    );
                    setBlockStateResolved(
                      true,
                    );
                    setBlockStateError(
                      null,
                    );
                  },
                )
                .catch(
                  (error: unknown) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setBlockStateResolved(
                      false,
                    );
                    setBlockStateError(
                      error,
                    );
                  },
                );

            const collectionLoad =
              (
                sessionError
                  ? Promise.reject(
                      sessionError,
                    )
                  : listPublicSceneCollections(
                      userId,
                    )
              )
                .then(
                  (
                    nextCollections,
                  ) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setCollections(
                      nextCollections,
                    );
                    setCollectionsResolved(
                      true,
                    );
                    setCollectionError(
                      null,
                    );
                  },
                )
                .catch(
                  (error: unknown) => {
                    if (
                      !isCurrent() ||
                      relationshipVersion !==
                        relationshipVersionRef.current
                    ) {
                      return;
                    }

                    setCollectionsResolved(
                      true,
                    );
                    setCollectionError(
                      error,
                    );
                  },
                );

            await Promise.all([
              profileLoad,
              snapshotLoad,
              connectionLoad,
              blockStateLoad,
              collectionLoad,
            ]);

            if (isCurrent()) {
              setLoading(
                false,
              );
            }
          })();

        loadPromiseRef.current =
          {
            key:
              requestKey,
            promise:
              nextLoad,
          };

        try {
          await nextLoad;
        } finally {
          if (
            loadPromiseRef.current
              ?.key ===
              requestKey &&
            loadPromiseRef.current
              .promise ===
              nextLoad
          ) {
            loadPromiseRef.current =
              null;
          }
        }
      },
      [
        identityKey,
        userId,
        viewerId,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();
      },
      [
        load,
      ],
    ),
  );

  useReconnectReload(
    load,
  );

  const profileIssue =
    useMemo(
      () =>
        profileError
          ? classifyRecoveryIssue(
              profileError,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            )
          : null,
      [
        connectivityStatus,
        profileError,
      ],
    );

  const snapshotIssue =
    useMemo(
      () =>
        snapshotError
          ? classifyRecoveryIssue(
              snapshotError,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            )
          : null,
      [
        connectivityStatus,
        snapshotError,
      ],
    );

  const collectionIssue =
    useMemo(
      () =>
        collectionError
          ? classifyRecoveryIssue(
              collectionError,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            )
          : null,
      [
        collectionError,
        connectivityStatus,
      ],
    );

  const blockStateIssue =
    useMemo(
      () =>
        blockStateError
          ? classifyRecoveryIssue(
              blockStateError,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            )
          : null,
      [
        blockStateError,
        connectivityStatus,
      ],
    );

  const recoverRead =
    async (
      issue: RecoveryIssue,
    ): Promise<void> => {
      if (
        issue.action ===
        "sign-in"
      ) {
        router.push(
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
        await load();
      }
    };

  const initials =
    useMemo(
      () =>
        profile
          ? creatorInitials(
              profile,
            )
          : "C",
      [
        profile,
      ],
    );

  const save =
    async (
      scene: PublicCanalScene,
    ): Promise<void> => {
      const key =
        `${scene.ownerId}:${scene.sceneId}`;

      setSavingKey(
        key,
      );

      setMessage("");
      setSaveErrorMessage(
        "",
      );

      try {
        await savePublicSceneToLibrary(
          scene,
        );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.sceneId ===
                  scene.sceneId
                  ? {
                      ...candidate,

                      savedByMe:
                        true,
                    }
                  : candidate,
            ),
        );

        setMessage(
          `"${scene.scene.name}" was saved to your Library.`,
        );
      } catch (error) {
        setSaveErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save this Scene.",
        );
      } finally {
        setSavingKey(
          "",
        );
      }
    };

  const relationshipBusy =
    relationshipOperation !==
    null;

  const followBusy =
    relationshipOperation ===
    "follow";

  const blockBusy =
    relationshipOperation ===
      "block" ||
    relationshipOperation ===
      "unblock";

  const isCurrentIdentity =
    (
      requestKey: string,
    ): boolean =>
      mountedRef.current &&
      requestKey ===
        identityKeyRef.current;

  const toggleFollow =
    async (): Promise<void> => {
      const requestKey =
        identityKey;

      if (
        !isCurrentIdentity(
          requestKey,
        ) ||
        !profile ||
        !connectionSummary ||
        connectionSummary
          .isOwnProfile ||
        !blockStateResolved ||
        isBlocked ||
        relationshipBusy
      ) {
        return;
      }

      const wasFollowing =
        connectionSummary
          .viewerIsFollowing;

      relationshipVersionRef.current +=
        1;

      setRelationshipOperation(
        "follow",
      );
      setRelationshipErrorMessage(
        "",
      );
      setMessage(
        "",
      );

      try {
        const normalizedHandle =
          profile.handle.replace(
            /^@+/,
            "",
          );

        const state =
          wasFollowing
            ? await unfollowUser(
                normalizedHandle,
                profile.displayName,
                profile.id,
              )
            : await followUser(
                normalizedHandle,
                profile.displayName,
                profile.id,
              );

        if (
          !isCurrentIdentity(
            requestKey,
          )
        ) {
          return;
        }

        relationshipVersionRef.current +=
          1;

        setConnectionSummary(
          (current) =>
            current
              ? {
                  ...current,
                  viewerIsFollowing:
                    !wasFollowing,
                  followerCount:
                    Math.max(
                      0,
                      current
                        .followerCount +
                        (
                          wasFollowing
                            ? -1
                            : 1
                        ),
                    ),
                }
              : current,
        );

        setMessage(
          state.syncStatus ===
            "pending"
            ? connectivityStatus ===
                "offline"
              ? `Your ${wasFollowing ? "unfollow" : "follow"} is saved on this device while you are offline. Canal will sync it when the connection returns.`
              : `Your ${wasFollowing ? "unfollow" : "follow"} is saved on this device and pending sync.`
            : wasFollowing
              ? `Unfollowed ${profile.displayName}.`
              : `Following ${profile.displayName}.`,
        );
      } catch (error) {
        if (
          !isCurrentIdentity(
            requestKey,
          )
        ) {
          return;
        }

        relationshipVersionRef.current +=
          1;

        setRelationshipErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not update this follow.",
        );
      } finally {
        if (
          isCurrentIdentity(
            requestKey,
          )
        ) {
          setRelationshipOperation(
            null,
          );
        }
      }
    };

  const confirmBlockChange =
    (): void => {
      if (
        !profile ||
        !connectionSummary ||
        connectionSummary
          .isOwnProfile ||
        !blockStateResolved ||
        relationshipBusy
      ) {
        return;
      }

      const nextBlocked =
        !isBlocked;

      Alert.alert(
        nextBlocked
          ? `Block ${profile.displayName}?`
          : `Unblock ${profile.displayName}?`,
        nextBlocked
          ? `${profile.handle} will be removed from Following and hidden across Canal.`
          : `${profile.handle} can appear in Discover, search, and Following again.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text:
              nextBlocked
                ? "Block"
                : "Unblock",
            style:
              nextBlocked
                ? "destructive"
                : "default",
            onPress: () => {
              void updateBlockedState(
                nextBlocked,
              );
            },
          },
        ],
      );
    };

  const confirmBlockedReferenceUnblock =
    (
      reference:
        BlockedUserReference,
    ): void => {
      if (
        !blockStateResolved ||
        relationshipBusy ||
        !reference.targetUserId ||
        reference.targetUserId !==
          userId
      ) {
        return;
      }

      Alert.alert(
        `Unblock @${reference.username}?`,
        `@${reference.username} can appear in Discover, search, and Following again.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Unblock",
            style: "default",
            onPress: () => {
              void updateBlockedState(
                false,
                reference,
              );
            },
          },
        ],
      );
    };

  const updateBlockedState =
    async (
      nextBlocked: boolean,
      referenceOnlyTarget?:
        BlockedUserReference,
    ): Promise<void> => {
      const requestKey =
        identityKey;

      if (
        !isCurrentIdentity(
          requestKey,
        ) ||
        !blockStateResolved ||
        relationshipBusy ||
        nextBlocked ===
          isBlocked
      ) {
        return;
      }

      const referenceTarget =
        referenceOnlyTarget ??
        blockedReference;

      const stableTargetUserId =
        profile?.id ??
        referenceTarget
          ?.targetUserId;

      if (
        !stableTargetUserId ||
        stableTargetUserId !==
          userId ||
        (
          nextBlocked &&
          (
            !profile ||
            !connectionSummary ||
            connectionSummary
              .isOwnProfile
          )
        )
      ) {
        return;
      }

      if (
        nextBlocked &&
        !profile
      ) {
        return;
      }

      relationshipVersionRef.current +=
        1;

      setRelationshipOperation(
        nextBlocked
          ? "block"
          : "unblock",
      );
      setRelationshipErrorMessage(
        "",
      );
      setMessage(
        "",
      );

      try {
        const normalizedHandle =
          profile
            ? profile.handle.replace(
                /^@+/,
                "",
              )
            : referenceTarget
                ?.username ??
              "";

        const targetDisplayName =
          profile?.displayName ??
          `@${normalizedHandle}`;

        let state:
          Awaited<
            ReturnType<
              typeof blockUser
            >
          >;

        if (nextBlocked) {
          if (!profile) {
            return;
          }

          state =
            await blockUser(
              normalizedHandle,
              targetDisplayName,
              profile.id,
            );
        } else if (profile) {
          state =
            await unblockUser(
              normalizedHandle,
              targetDisplayName,
              profile.id,
            );
        } else {
          state =
            await unblockUser(
              normalizedHandle,
              targetDisplayName,
              stableTargetUserId,
            );
        }

        if (
          !isCurrentIdentity(
            requestKey,
          )
        ) {
          return;
        }

        relationshipVersionRef.current +=
          1;

        setIsBlocked(
          nextBlocked,
        );
        setBlockStateResolved(
          true,
        );
        setBlockedReference(
          nextBlocked
            ? {
                username:
                  normalizedHandle,
                targetUserId:
                  stableTargetUserId,
              }
            : null,
        );

        if (nextBlocked) {
          setConnectionSummary(
            (current) =>
              current
                ? {
                    ...current,
                    followerCount:
                      Math.max(
                        0,
                        current
                          .followerCount -
                          (
                            current
                              .viewerIsFollowing
                              ? 1
                              : 0
                          ),
                      ),
                    viewerIsFollowing:
                      false,
                  }
                : current,
          );

          setScenes(
            [],
          );
          setSnapshots(
            [],
          );
          setCollections(
            [],
          );
          setSnapshotsResolved(
            true,
          );
          setCollectionsResolved(
            true,
          );
          setSnapshotError(
            null,
          );
          setCollectionError(
            null,
          );
        }

        setMessage(
          state.syncStatus ===
            "pending"
            ? connectivityStatus ===
                "offline"
              ? `${targetDisplayName} is ${nextBlocked ? "blocked" : "unblocked"} on this device while you are offline. Canal will sync the change when the connection returns.`
              : `${targetDisplayName} is ${nextBlocked ? "blocked" : "unblocked"} on this device and the change is pending sync.`
            : nextBlocked
              ? `Blocked ${targetDisplayName}.`
              : `Unblocked ${targetDisplayName}.`,
        );
      } catch (error) {
        if (
          !isCurrentIdentity(
            requestKey,
          )
        ) {
          return;
        }

        relationshipVersionRef.current +=
          1;
        setBlockStateResolved(
          true,
        );
        setRelationshipErrorMessage(
          error instanceof Error
            ? error.message
            : nextBlocked
              ? "Canal could not block this creator."
              : "Canal could not unblock this creator.",
        );
      } finally {
        if (
          isCurrentIdentity(
            requestKey,
          )
        ) {
          setRelationshipOperation(
            null,
          );
        }
      }
    };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "bottom",
      ]}
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={
            safeBack
          }
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

        <Text
          style={
            styles.headerTitle
          }
        >
          Creator
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      {loading &&
      !profile &&
      !profileResolved &&
      !snapshotsResolved &&
      scenes.length ===
        0 &&
      snapshots.length ===
        0 ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {profileIssue &&
          !(
            blockStateResolved &&
            blockedReference
          ) ? (
            <RecoveryNotice
              busy={
                loading
              }
              issue={
                profileIssue
              }
              onAction={() =>
                recoverRead(
                  profileIssue,
                )
              }
            />
          ) : null}

          {blockStateIssue ? (
            <RecoveryNotice
              busy={
                loading
              }
              issue={
                blockStateIssue
              }
              onAction={() =>
                recoverRead(
                  blockStateIssue,
                )
              }
            />
          ) : null}

          {profile ? (
            <View
              style={
                styles.profileCard
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
                  {initials}
                </Text>
              </View>

              <Text
                style={
                  styles.name
                }
              >
                {profile.displayName}
              </Text>

              <Text
                style={
                  styles.handle
                }
              >
                {profile.handle}
              </Text>

              {profile.isCanal ||
              profile.isVerified ? (
                <View
                  style={
                    styles.verifiedBadge
                  }
                >
                  <Text
                    style={
                      styles.verifiedBadgeText
                    }
                  >
                    {profile.isCanal
                      ? "CANAL CREATOR"
                      : "VERIFIED CREATOR"}
                  </Text>
                </View>
              ) : null}

              {profile.bio ? (
                <Text
                  style={
                    styles.bio
                  }
                >
                  {profile.bio}
                </Text>
              ) : null}

              {profile.favoriteActivities ? (
                <View
                  style={
                    styles.activitiesBox
                  }
                >
                  <Text
                    style={
                      styles.activitiesLabel
                    }
                  >
                    FAVORITE ACTIVITIES
                  </Text>

                  <Text
                    style={
                      styles.activitiesText
                    }
                  >
                    {profile.favoriteActivities}
                  </Text>
                </View>
              ) : null}

              {connectionSummary ? (
                <>
                  <View
                    style={
                      styles.connectionStats
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/following",
                          params: {
                            profileId:
                              profile.id,
                            mode:
                              "following",
                          },
                        })
                      }
                      style={
                        styles.connectionStat
                      }
                    >
                      <Text
                        style={
                          styles.connectionValue
                        }
                      >
                        {
                          connectionSummary.followingCount
                        }
                      </Text>

                      <Text
                        style={
                          styles.connectionLabel
                        }
                      >
                        Following
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/following",
                          params: {
                            profileId:
                              profile.id,
                            mode:
                              "followers",
                          },
                        })
                      }
                      style={
                        styles.connectionStat
                      }
                    >
                      <Text
                        style={
                          styles.connectionValue
                        }
                      >
                        {
                          connectionSummary.followerCount
                        }
                      </Text>

                      <Text
                        style={
                          styles.connectionLabel
                        }
                      >
                        Followers
                      </Text>
                    </Pressable>
                  </View>

                  {!connectionSummary
                    .isOwnProfile ? (
                    !blockStateResolved ? (
                      blockStateIssue ? null : (
                        <View
                          accessibilityLiveRegion="polite"
                          style={
                            styles.relationshipStatus
                          }
                        >
                          <ActivityIndicator
                            size="small"
                            color="#4C46C8"
                          />

                          <Text
                            style={
                              styles.relationshipStatusText
                            }
                          >
                            Loading relationship status…
                          </Text>
                        </View>
                      )
                    ) : isBlocked ? (
                      <Pressable
                        accessibilityLabel={`Unblock ${profile.displayName}`}
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            blockBusy,
                          disabled:
                            relationshipBusy,
                        }}
                        disabled={
                          relationshipBusy
                        }
                        onPress={
                          confirmBlockChange
                        }
                        style={[
                          styles.unblockButton,
                          relationshipBusy &&
                            styles.relationshipButtonDisabled,
                        ]}
                      >
                        {blockBusy ? (
                          <ActivityIndicator
                            color="#8E322B"
                          />
                        ) : (
                          <Text
                            style={
                              styles.unblockButtonText
                            }
                          >
                            Unblock Creator
                          </Text>
                        )}
                      </Pressable>
                    ) : (
                      <View
                        style={
                          styles.relationshipActions
                        }
                      >
                        <Pressable
                          accessibilityLabel={
                            connectionSummary
                              .viewerIsFollowing
                              ? `Unfollow ${profile.displayName}`
                              : `Follow ${profile.displayName}`
                          }
                          accessibilityRole="button"
                          accessibilityState={{
                            busy:
                              followBusy,
                            disabled:
                              relationshipBusy,
                          }}
                          disabled={
                            relationshipBusy
                          }
                          onPress={() =>
                            void toggleFollow()
                          }
                          style={[
                            styles.followButton,
                            connectionSummary
                              .viewerIsFollowing &&
                              styles.followButtonActive,
                            relationshipBusy &&
                              styles.relationshipButtonDisabled,
                          ]}
                        >
                          {followBusy ? (
                            <ActivityIndicator
                              color="#FFFDF8"
                            />
                          ) : (
                            <Text
                              style={
                                styles.followButtonText
                              }
                            >
                              {connectionSummary
                                .viewerIsFollowing
                                ? "Following"
                                : "Follow Creator"}
                            </Text>
                          )}
                        </Pressable>

                        <Pressable
                          accessibilityLabel={`Block ${profile.displayName}`}
                          accessibilityRole="button"
                          accessibilityState={{
                            busy:
                              blockBusy,
                            disabled:
                              relationshipBusy,
                          }}
                          disabled={
                            relationshipBusy
                          }
                          onPress={
                            confirmBlockChange
                          }
                          style={[
                            styles.blockButton,
                            relationshipBusy &&
                              styles.relationshipButtonDisabled,
                          ]}
                        >
                          {blockBusy ? (
                            <ActivityIndicator
                              color="#A62E27"
                            />
                          ) : (
                            <Text
                              style={
                                styles.blockButtonText
                              }
                            >
                              Block Creator
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {blockStateResolved &&
          blockedReference &&
          (
            !profile ||
            !connectionSummary
          ) ? (
            <View
              style={
                styles.blockedFallbackCard
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
                  {blockedReference
                    .username
                    .slice(
                      0,
                      2,
                    )
                    .toUpperCase()}
                </Text>
              </View>

              <Text
                style={
                  styles.name
                }
              >
                Blocked creator
              </Text>

              <Text
                selectable
                style={
                  styles.handle
                }
              >
                @{blockedReference.username}
              </Text>

              <Text
                style={
                  styles.blockedFallbackText
                }
              >
                This creator is hidden,
                but you can still remove
                the block by its stable
                account ID.
              </Text>

              <Pressable
                accessibilityLabel={`Unblock @${blockedReference.username}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    blockBusy,
                  disabled:
                    relationshipBusy,
                }}
                disabled={
                  relationshipBusy
                }
                onPress={() =>
                  confirmBlockedReferenceUnblock(
                    blockedReference,
                  )
                }
                style={[
                  styles.unblockButton,
                  relationshipBusy &&
                    styles.relationshipButtonDisabled,
                ]}
              >
                {blockBusy ? (
                  <ActivityIndicator
                    color="#8E322B"
                  />
                ) : (
                  <Text
                    style={
                      styles.unblockButtonText
                    }
                  >
                    Unblock Creator
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {message ? (
            <View
              accessibilityLiveRegion="polite"
              style={
                styles.successBox
              }
            >
              <Text
                selectable
                style={
                  styles.successText
                }
              >
                {message}
              </Text>
            </View>
          ) : null}

          {routeErrorMessage ? (
            <View
              style={
                styles.errorBox
              }
            >
              <Text
                selectable
                style={
                  styles.errorText
                }
              >
                {
                  routeErrorMessage
                }
              </Text>
            </View>
          ) : null}

          {saveErrorMessage ? (
            <View
              style={
                styles.errorBox
              }
            >
              <Text
                selectable
                style={
                  styles.errorText
                }
              >
                {
                  saveErrorMessage
                }
              </Text>
            </View>
          ) : null}

          {relationshipErrorMessage ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={
                styles.errorBox
              }
            >
              <Text
                selectable
                style={
                  styles.errorText
                }
              >
                {
                  relationshipErrorMessage
                }
              </Text>
            </View>
          ) : null}

          {blockStateResolved &&
          !isBlocked ? (
            <>
          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Public Snapshots
            </Text>

            <Text
              style={
                styles.sceneCount
              }
            >
              {(
                !snapshotsResolved ||
                snapshotIssue
              ) &&
              snapshots.length ===
                0
                ? "—"
                : snapshots.length}
            </Text>
          </View>

          {snapshotIssue ? (
            <RecoveryNotice
              busy={
                loading
              }
              issue={
                snapshotIssue
              }
              onAction={() =>
                recoverRead(
                  snapshotIssue,
                )
              }
            />
          ) : null}

          {snapshots.length >
          0 ? (
            <PublicSnapshotGrid
              snapshots={
                snapshots
              }
            />
          ) : snapshotsResolved &&
            !snapshotIssue ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                This creator has no public Snapshots.
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Scene Collections
            </Text>

            <Text
              style={
                styles.sceneCount
              }
            >
              {(
                !collectionsResolved ||
                collectionIssue
              ) &&
              collections.length ===
                0
                ? "—"
                : collections.length}
            </Text>
          </View>

          {collectionIssue ? (
            <RecoveryNotice
              busy={
                loading
              }
              issue={
                collectionIssue
              }
              onAction={() =>
                recoverRead(
                  collectionIssue,
                )
              }
            />
          ) : null}

          {collections.length >
          0 ? (
            <View
              style={
                styles.collectionList
              }
            >
              {collections.map(
                (collection) => (
                  <Pressable
                    key={
                      collection.id
                    }
                    accessibilityLabel={`Open ${collection.title} Scene collection`}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname:
                          "/collections/[collectionId]",

                        params: {
                          collectionId:
                            collection.id,
                        },
                      } as never)
                    }
                    style={
                      styles.collectionCard
                    }
                  >
                    <View
                      style={
                        styles.collectionCopy
                      }
                    >
                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.collectionTitle
                        }
                      >
                        {
                          collection.title
                        }
                      </Text>

                      <Text
                        numberOfLines={
                          2
                        }
                        style={
                          styles.collectionDescription
                        }
                      >
                        {collection.description ||
                          "A curated set of public Scenes."}
                      </Text>

                      <Text
                        style={
                          styles.collectionMeta
                        }
                      >
                        {
                          collection.sceneCount
                        }{" "}
                        {collection.sceneCount ===
                        1
                          ? "Scene"
                          : "Scenes"}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.collectionArrow
                      }
                    >
                      ›
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          ) : collectionsResolved &&
            !collectionIssue ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                This creator has no public Scene collections.
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Public Scenes
            </Text>

            <Text
              style={
                styles.sceneCount
              }
            >
              {(
                !profileResolved ||
                profileIssue
              ) &&
              scenes.length ===
                0
                ? "—"
                : scenes.length}
            </Text>
          </View>

          {scenes.length >
          0 ? (
            <View
              style={
                styles.list
              }
            >
              {scenes.map(
                (scene) => {
                  const key =
                    `${scene.ownerId}:${scene.sceneId}`;

                  return (
                    <View
                      key={
                        key
                      }
                      style={
                        styles.sceneCard
                      }
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname:
                              "/public-scene",

                            params: {
                              ownerId:
                                scene.ownerId,

                              sceneId:
                                scene.sceneId,
                            },
                          } as never)
                        }
                        style={
                          styles.scenePressable
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
                            {scene.scene.name
                              .charAt(
                                0,
                              )
                              .toUpperCase()}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.sceneText
                          }
                        >
                          <Text
                            numberOfLines={
                              1
                            }
                            style={
                              styles.sceneName
                            }
                          >
                            {scene.scene.name}
                          </Text>

                          <Text
                            style={
                              styles.sceneMeta
                            }
                          >
                            {scene.scene.activity ||
                              "Any activity"}{" "}
                            ·{" "}
                            {scene.scene.tracks.length}{" "}
                            tracks
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          scene.isMine ||
                          scene.savedByMe ||
                          savingKey ===
                            key
                        }
                        onPress={() =>
                          void save(
                            scene,
                          )
                        }
                        style={[
                          styles.saveButton,

                          (
                            scene.isMine ||
                            scene.savedByMe ||
                            savingKey ===
                              key
                          ) &&
                            styles.saveButtonDisabled,
                        ]}
                      >
                        {savingKey ===
                        key ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFDF8"
                          />
                        ) : (
                          <Text
                            style={
                              styles.saveButtonText
                            }
                          >
                            {scene.isMine
                              ? "Yours"
                              : scene.savedByMe
                                ? "Saved"
                                : "Save"}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                },
              )}
            </View>
          ) : profileResolved &&
            !profileIssue ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                This creator has no public Scenes.
              </Text>
            </View>
          ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },

    backButton: {
      width: 48,
      height: 48,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
    },

    headerTitle: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    headerSpacer: {
      width: 42,
    },

    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
    },

    profileCard: {
      alignItems:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 24,
      padding: 22,
    },

    blockedFallbackCard: {
      alignItems:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 24,
      padding: 22,
      marginTop: 14,
    },

    avatar: {
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
    },

    avatarText: {
      color: "#FFFDF8",
      fontSize: 27,
      fontWeight: "900",
    },

    name: {
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
      marginTop: 12,
    },

    handle: {
      color: "#6D6B64",
      fontSize: 13,
      marginTop: 3,
    },

    verifiedBadge: {
      borderRadius: 9,
      backgroundColor: canalDynamicColors.warningSurface,
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginTop: 8,
    },

    verifiedBadgeText: {
      color: canalDynamicColors.gold,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    bio: {
      color: "#4F4944",
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 14,
    },

    blockedFallbackText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 14,
    },

    activitiesBox: {
      width: "100%",
      backgroundColor: canalDynamicColors.baseCanvas,
      borderRadius: 16,
      padding: 14,
      marginTop: 15,
    },

    activitiesLabel: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    activitiesText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    connectionStats: {
      width: "100%",
      flexDirection:
        "row",
      gap: 9,
      marginTop: 16,
    },

    connectionStat: {
      flex: 1,
      minHeight: 64,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 15,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: "rgba(226, 255, 249, 0.10)",
    },

    connectionValue: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    connectionLabel: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "800",
      marginTop: 4,
    },

    relationshipStatus: {
      width: "100%",
      minHeight: 48,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 9,
      marginTop: 12,
    },

    relationshipStatusText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "700",
    },

    relationshipActions: {
      width: "100%",
      gap: 10,
    },

    followButton: {
      width: "100%",
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 15,
      backgroundColor:
        "#4C46C8",
      marginTop: 12,
    },

    followButtonActive: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: "rgba(7, 43, 63, 0.42)",
    },

    followButtonText: {
      color: "#FFFDF8",
      fontSize: 12,
      fontWeight: "900",
    },

    blockButton: {
      width: "100%",
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#E6B8B4",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.dangerSurface,
    },

    blockButtonText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      fontWeight: "900",
    },

    unblockButton: {
      width: "100%",
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#E6B8B4",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.dangerSurface,
      marginTop: 12,
    },

    unblockButtonText: {
      color: "#8E322B",
      fontSize: 12,
      fontWeight: "900",
    },

    relationshipButtonDisabled: {
      opacity: 0.55,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 20,
      marginBottom: 11,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    sceneCount: {
      color: canalDynamicColors.lavender,
      fontSize: 13,
      fontWeight: "900",
    },

    collectionList: {
      gap: 10,
    },

    collectionCard: {
      minHeight: 86,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderWidth: 1,
      borderColor:
        "#EEE5DE",
      borderRadius: 19,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },

    collectionCopy: {
      flex: 1,
    },

    collectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    collectionDescription: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },

    collectionMeta: {
      color: canalDynamicColors.lavender,
      fontSize: 9,
      fontWeight: "900",
      marginTop: 7,
    },

    collectionArrow: {
      color: canalDynamicColors.lavender,
      fontSize: 26,
      marginLeft: 12,
    },

    list: {
      gap: 12,
    },

    sceneCard: {
      flexDirection: "row",
      alignItems:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 19,
      padding: 13,
    },

    scenePressable: {
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
    },

    sceneArtwork: {
      width: 52,
      height: 52,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.warningSurface,
      marginRight: 11,
    },

    sceneArtworkText: {
      color: canalDynamicColors.lavender,
      fontSize: 21,
      fontWeight: "900",
    },

    sceneText: {
      flex: 1,
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    sceneMeta: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 4,
    },

    saveButton: {
      minWidth: 65,
      minHeight: 48,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
      marginLeft: 10,
      paddingHorizontal: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        "#CFC7C0",
    },

    saveButtonText: {
      color: "#FFFDF8",
      fontSize: 10,
      fontWeight: "900",
    },

    emptyCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 19,
      padding: 18,
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 19,
    },

    successBox: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 15,
      padding: 13,
      marginTop: 14,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 13,
      marginTop: 14,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

  });
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
