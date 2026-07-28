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
  followUser,
  unfollowUser,
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
    followBusy,
    setFollowBusy,
  ] = useState(false);

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
            setConnectionSummary(
              null,
            );
            setFollowBusy(
              false,
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
                    if (!isCurrent()) {
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
                    if (!isCurrent()) {
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
                    if (!isCurrent()) {
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
                    if (!isCurrent()) {
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
                    if (!isCurrent()) {
                      return;
                    }

                    setConnectionSummary(
                      result,
                    );
                  },
                )
                .catch(
                  () => {
                    if (!isCurrent()) {
                      return;
                    }

                    setConnectionSummary(
                      null,
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
                    if (!isCurrent()) {
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
                    if (!isCurrent()) {
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

  const toggleFollow =
    async (): Promise<void> => {
      if (
        !profile ||
        !connectionSummary ||
        connectionSummary
          .isOwnProfile ||
        followBusy
      ) {
        return;
      }

      setFollowBusy(
        true,
      );
      setSaveErrorMessage(
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

        if (
          connectionSummary
            .viewerIsFollowing
        ) {
          await unfollowUser(
            normalizedHandle,
            profile.displayName,
            profile.id,
          );
        } else {
          await followUser(
            normalizedHandle,
            profile.displayName,
            profile.id,
          );
        }

        setConnectionSummary(
          (current) =>
            current
              ? {
                  ...current,
                  viewerIsFollowing:
                    !current
                      .viewerIsFollowing,
                  followerCount:
                    Math.max(
                      0,
                      current
                        .followerCount +
                        (
                          current
                            .viewerIsFollowing
                            ? -1
                            : 1
                        ),
                    ),
                }
              : current,
        );

        setMessage(
          connectionSummary
            .viewerIsFollowing
            ? `Unfollowed ${profile.displayName}.`
            : `Following ${profile.displayName}.`,
        );
      } catch (error) {
        setSaveErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not update this follow.",
        );
      } finally {
        setFollowBusy(
          false,
        );
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
          {profileIssue ? (
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
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        followBusy
                      }
                      onPress={() =>
                        void toggleFollow()
                      }
                      style={[
                        styles.followButton,
                        connectionSummary
                          .viewerIsFollowing &&
                          styles.followButtonActive,
                      ]}
                    >
                      {followBusy ? (
                        <ActivityIndicator
                          color="#FFFFFF"
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
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {message ? (
            <View
              style={
                styles.successBox
              }
            >
              <Text
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
                            color="#FFFFFF"
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
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
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
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
    },

    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
    },

    headerTitle: {
      color: "#1B1B1B",
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
      backgroundColor:
        "#FFFFFF",
      borderRadius: 24,
      padding: 22,
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
        "#F47A24",
    },

    avatarText: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "900",
    },

    name: {
      color: "#1B1B1B",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 12,
    },

    handle: {
      color: "#817972",
      fontSize: 13,
      marginTop: 3,
    },

    verifiedBadge: {
      borderRadius: 9,
      backgroundColor:
        "#FFF0E5",
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginTop: 8,
    },

    verifiedBadgeText: {
      color: "#B9500B",
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

    activitiesBox: {
      width: "100%",
      backgroundColor:
        "#FFF9F4",
      borderRadius: 16,
      padding: 14,
      marginTop: 15,
    },

    activitiesLabel: {
      color: "#A09993",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    activitiesText: {
      color: "#4F4944",
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
      backgroundColor:
        "#FFF7F1",
    },

    connectionValue: {
      color: "#241B16",
      fontSize: 18,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    connectionLabel: {
      color: "#817972",
      fontSize: 9,
      fontWeight: "800",
      marginTop: 4,
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
        "#F47A24",
      marginTop: 12,
    },

    followButtonActive: {
      backgroundColor:
        "#51463E",
    },

    followButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
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
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    sceneCount: {
      color: "#F47A24",
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
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },

    collectionCopy: {
      flex: 1,
    },

    collectionTitle: {
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "900",
    },

    collectionDescription: {
      color: "#6F6862",
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },

    collectionMeta: {
      color: "#F47A24",
      fontSize: 9,
      fontWeight: "900",
      marginTop: 7,
    },

    collectionArrow: {
      color: "#F47A24",
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
      backgroundColor:
        "#FFFFFF",
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
      backgroundColor:
        "#FFF0E5",
      marginRight: 11,
    },

    sceneArtworkText: {
      color: "#F47A24",
      fontSize: 21,
      fontWeight: "900",
    },

    sceneText: {
      flex: 1,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#817972",
      fontSize: 10,
      marginTop: 4,
    },

    saveButton: {
      minWidth: 65,
      minHeight: 38,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginLeft: 10,
      paddingHorizontal: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        "#CFC7C0",
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 19,
      padding: 18,
    },

    emptyText: {
      color: "#746D67",
      fontSize: 13,
      lineHeight: 19,
    },

    successBox: {
      backgroundColor:
        "#EAF9EF",
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
      backgroundColor:
        "#FFF0EF",
      borderRadius: 15,
      padding: 13,
      marginTop: 14,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

  });
