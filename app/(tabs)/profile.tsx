import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
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
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  readScenePlaylistExports,
} from "../../lib/playlist-exports";

import type {
  ScenePlaylistExport,
} from "../../lib/playlist-exports";

import {
  loadProfileConnectionSummary,
} from "../../lib/profile-social";

import type {
  ProfileConnectionSummary,
} from "../../lib/profile-social";

import {
  readScenes,
} from "../../lib/scenes";

import {
  readSnapshotsWithStatus,
} from "../../lib/snapshots";

import type {
  Snapshot,
} from "../../lib/snapshots";

import {
  supabase,
} from "../../lib/supabase";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type ProfileForm = {
  displayName: string;
  handle: string;
  bio: string;
  favoriteActivities: string;
  isPublic: boolean;
  isVerified: boolean;
  isCanal: boolean;
};

const EMPTY_PROFILE: ProfileForm = {
  displayName: "",
  handle: "",
  bio: "",
  favoriteActivities: "",
  isPublic: true,
  isVerified: false,
  isCanal: false,
};

function normalizeHandle(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /^@+/,
      "",
    )
    .replace(
      /[^a-z0-9_]/g,
      "",
    )
    .slice(
      0,
      24,
    );
}

function fallbackHandle(
  userId: string,
): string {
  return (
    "canal_" +
    userId
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        10,
      )
  );
}

function initials(
  value: string,
): string {
  return (
    value
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

export default function ProfileScreen() {
  const {
    user,
  } =
    useAuth();

  return (
    <ProfileScreenContent
      key={
        user?.id ??
        "signed-out"
      }
    />
  );
}

function ProfileScreenContent() {
  const {
    user,
    profile:
      cachedAuthProfile,
  } =
    useAuth();

  const {
    status:
      connectivityStatus,
    refresh:
      refreshConnectivity,
  } =
    useConnectivity();

  const identityKey =
    user?.id ??
    "signed-out";

  const [
    profile,
    setProfile,
  ] =
    useState<ProfileForm | null>(
      null,
    );

  const [
    draft,
    setDraft,
  ] =
    useState<ProfileForm>(
      EMPTY_PROFILE,
    );

  const [
    sceneCount,
    setSceneCount,
  ] = useState(0);

  const [
    publicCount,
    setPublicCount,
  ] = useState(0);

  const [
    savedCount,
    setSavedCount,
  ] = useState(0);

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
    playlistExports,
    setPlaylistExports,
  ] =
    useState<
      ScenePlaylistExport[]
    >([]);

  const [
    publicSnapshots,
    setPublicSnapshots,
  ] =
    useState<
      Snapshot[]
    >([]);

  const [
    sceneDataResolved,
    setSceneDataResolved,
  ] = useState(false);

  const [
    snapshotDataResolved,
    setSnapshotDataResolved,
  ] = useState(false);

  const [
    socialDataResolved,
    setSocialDataResolved,
  ] = useState(false);

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    formErrorMessage,
    setFormErrorMessage,
  ] = useState("");

  const [
    profileError,
    setProfileError,
  ] =
    useState<unknown | null>(
      null,
    );

  const [
    sceneError,
    setSceneError,
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
            setPlaylistExports(
              [],
            );
            setSocialDataResolved(
              false,
            );

            const profileLoad =
              (async (): Promise<void> => {
                if (!user) {
                  throw new Error(
                    "Your Canal account session is missing. Sign in to refresh your profile.",
                  );
                }

                const profileResult =
                  await supabase
                    .from(
                      "profiles",
                    )
                    .select(
                      "display_name, handle, bio, favorite_activities, is_public, is_verified, is_canal",
                    )
                    .eq(
                      "id",
                      user.id,
                    )
                    .maybeSingle();

                if (
                  profileResult.error
                ) {
                  throw profileResult.error;
                }

                if (!isCurrent()) {
                  return;
                }

                const row =
                  profileResult.data;

                const next: ProfileForm = {
                  displayName:
                    row?.display_name ||
                    user.user_metadata
                      ?.display_name ||
                    user.email?.split(
                      "@",
                    )[0] ||
                    "Canal Listener",

                  handle:
                    `@${row?.handle || user.user_metadata?.handle || fallbackHandle(user.id)}`,

                  bio:
                    row?.bio ||
                    "",

                  favoriteActivities:
                    row
                      ?.favorite_activities ||
                    "",

                  isPublic:
                    row?.is_public !==
                    false,

                  isVerified:
                    row?.is_verified ===
                    true,

                  isCanal:
                    row?.is_canal ===
                    true,
                };

                setProfile(
                  next,
                );

                setDraft(
                  next,
                );

                setProfileError(
                  null,
                );
              })().catch(
                (error: unknown) => {
                  if (!isCurrent()) {
                    return;
                  }

                  setProfileError(
                    error,
                  );
                },
              );

            const sceneLoad =
              readScenes()
                .then(
                  (scenes) => {
                    if (!isCurrent()) {
                      return;
                    }

                    setSceneCount(
                      scenes.length,
                    );

                    setPublicCount(
                      scenes.filter(
                        (scene) =>
                          scene.libraryType !==
                            "saved" &&
                          scene.visibility ===
                            "public",
                      ).length,
                    );

                    setSavedCount(
                      scenes.filter(
                        (scene) =>
                          scene.libraryType ===
                          "saved",
                      ).length,
                    );

                    setSceneDataResolved(
                      true,
                    );

                    setSceneError(
                      null,
                    );
                  },
                )
                .catch(
                  (error: unknown) => {
                    if (!isCurrent()) {
                      return;
                    }

                    setSceneError(
                      error,
                    );
                  },
                );

            const snapshotLoad =
              readSnapshotsWithStatus()
                .then(
                  (
                    snapshotResult,
                  ) => {
                    if (!isCurrent()) {
                      return;
                    }

                    setPublicSnapshots(
                      snapshotResult.value.filter(
                        (snapshot) =>
                          snapshot.visibility ===
                          "public",
                      ),
                    );

                    setSnapshotDataResolved(
                      true,
                    );

                    setSnapshotError(
                      snapshotResult.warning ??
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

            const socialLoad =
              (
                user
                  ? Promise.all([
                      loadProfileConnectionSummary(
                        user.id,
                      ),
                      readScenePlaylistExports({
                        limit:
                          5,
                      }),
                    ])
                  : Promise.reject(
                      new Error(
                        "Sign in to refresh your profile connections.",
                      ),
                    )
              )
                .then(
                  ([
                    nextSummary,
                    nextExports,
                  ]) => {
                    if (!isCurrent()) {
                      return;
                    }

                    setConnectionSummary(
                      nextSummary,
                    );
                    setPlaylistExports(
                      nextExports,
                    );
                    setSocialDataResolved(
                      true,
                    );
                  },
                )
                .catch(
                  () => {
                    if (!isCurrent()) {
                      return;
                    }

                    setSocialDataResolved(
                      true,
                    );
                  },
                );

            await Promise.all([
              profileLoad,
              sceneLoad,
              snapshotLoad,
              socialLoad,
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
        user,
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

  const displayProfile =
    profile ??
    (
      cachedAuthProfile
        ? {
            displayName:
              cachedAuthProfile.displayName,

            handle:
              cachedAuthProfile.handle,

            bio:
              cachedAuthProfile.bio,

            favoriteActivities:
              cachedAuthProfile.favoriteActivities,

            /*
             * Visibility is only rendered from
             * the remote profile below.
             */
            isPublic:
              true,

            isVerified:
              false,

            isCanal:
              false,
          }
        : null
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

  const sceneIssue =
    useMemo(
      () =>
        sceneError
          ? classifyRecoveryIssue(
              sceneError,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            )
          : null,
      [
        connectivityStatus,
        sceneError,
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

  const beginEditing =
    (): void => {
      if (!profile) {
        return;
      }

      setDraft({
        ...profile,
      });

      setMessage("");
      setFormErrorMessage(
        "",
      );
      setEditing(
        true,
      );
    };

  const cancelEditing =
    (): void => {
      if (!profile) {
        setEditing(
          false,
        );

        return;
      }

      setDraft({
        ...profile,
      });

      setFormErrorMessage(
        "",
      );
      setEditing(
        false,
      );
    };

  const save =
    async (): Promise<void> => {
      if (saving) {
        return;
      }

      setSaving(
        true,
      );

      setMessage("");
      setFormErrorMessage(
        "",
      );

      try {
        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "Your Canal account session expired.",
          );
        }

        const displayName =
          draft.displayName
            .trim()
            .slice(
              0,
              60,
            );

        const handle =
          normalizeHandle(
            draft.handle,
          );

        if (!displayName) {
          throw new Error(
            "Enter a display name.",
          );
        }

        if (
          handle.length <
          3
        ) {
          throw new Error(
            "Your handle must contain at least three letters, numbers, or underscores.",
          );
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "profiles",
            )
            .upsert(
              {
                id:
                  user.id,

                display_name:
                  displayName,

                handle,

                bio:
                  draft.bio
                    .trim()
                    .slice(
                      0,
                      300,
                    ),

                favorite_activities:
                  draft
                    .favoriteActivities
                    .trim()
                    .slice(
                      0,
                      300,
                    ),

                is_public:
                  draft.isPublic,

                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "id",
              },
            )
            .select(
              "display_name, handle, bio, favorite_activities, is_public, is_verified, is_canal",
            )
            .single();

        if (error) {
          if (
            error.message
              .toLowerCase()
              .includes(
                "duplicate",
              )
          ) {
            throw new Error(
              "That Canal handle is already in use.",
            );
          }

          throw error;
        }

        const next: ProfileForm = {
          displayName:
            data.display_name,

          handle:
            `@${data.handle}`,

          bio:
            data.bio ||
            "",

          favoriteActivities:
            data
              .favorite_activities ||
            "",

          isPublic:
            data.is_public !==
            false,

          isVerified:
            data.is_verified ===
            true,

          isCanal:
            data.is_canal ===
            true,
        };

        setProfile(
          next,
        );

        setDraft(
          next,
        );

        setEditing(
          false,
        );

        setMessage(
          "Profile updated.",
        );
      } catch (error) {
        setFormErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save your profile.",
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  const avatarText =
    useMemo(
      () =>
        initials(
          displayProfile
            ?.displayName ??
            "",
        ),
      [
        displayProfile
          ?.displayName,
      ],
    );

  if (
    loading &&
    !displayProfile &&
    !sceneDataResolved &&
    !snapshotDataResolved
  ) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
      ]}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.header
          }
        >
          <View>
            <Text
              style={
                styles.title
              }
            >
              Profile
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Your Canal identity.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/settings" as never,
              )
            }
            style={
              styles.settingsButton
            }
          >
            <Text
              style={
                styles.settingsText
              }
            >
              Settings
            </Text>
          </Pressable>
        </View>

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

        {sceneIssue ? (
          <RecoveryNotice
            busy={
              loading
            }
            issue={
              sceneIssue
            }
            onAction={() =>
              recoverRead(
                sceneIssue,
              )
            }
          />
        ) : null}

        {displayProfile ? (
          <View
            style={
              styles.identityCard
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
                {avatarText}
              </Text>
            </View>

            <Text
              style={
                styles.profileName
              }
            >
              {
                displayProfile.displayName
              }
            </Text>

            <Text
              style={
                styles.handle
              }
            >
              {
                displayProfile.handle
              }
            </Text>

            <View
              style={
                styles.visibilityBadge
              }
            >
              <Text
                style={
                  styles.visibilityBadgeText
                }
              >
                {displayProfile
                  .isCanal
                  ? "Canal profile"
                  : displayProfile
                      .isVerified
                    ? "Verified profile"
                    : profile
                      ? profile.isPublic
                        ? "Public profile"
                        : "Private profile"
                      : "Saved profile details"}
              </Text>
            </View>

            {sceneDataResolved ? (
              <View
                style={
                  styles.stats
                }
              >
                <Stat
                  value={
                    sceneCount
                  }
                  label="Library"
                />

                <Stat
                  value={
                    publicCount
                  }
                  label="Public"
                />

                <Stat
                  value={
                    savedCount
                  }
                  label="Saved"
                />
              </View>
            ) : null}
          </View>
        ) : sceneDataResolved ? (
          <View
            style={
              styles.identityCard
            }
          >
            <Text
              selectable
              style={
                styles.localLibraryTitle
              }
            >
              Your local Library
            </Text>

            <Text
              selectable
              style={
                styles.localLibraryText
              }
            >
              Your saved Scenes remain available while Canal refreshes your profile.
            </Text>

            <View
              style={
                styles.stats
              }
            >
              <Stat
                value={
                  sceneCount
                }
                label="Library"
              />

              <Stat
                value={
                  publicCount
                }
                label="Public"
              />

              <Stat
                value={
                  savedCount
                }
                label="Saved"
              />
            </View>
          </View>
        ) : null}

        {user &&
        socialDataResolved ? (
          <View
            style={
              styles.connectionCard
            }
          >
            <View
              style={
                styles.connectionHeader
              }
            >
              <View>
                <Text
                  selectable
                  style={
                    styles.connectionTitle
                  }
                >
                  Your network
                </Text>

                <Text
                  selectable
                  style={
                    styles.connectionSubtitle
                  }
                >
                  People and creators you connect with.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/(tabs)/explore",
                  )
                }
              >
                <Text
                  style={
                    styles.discoverText
                  }
                >
                  Discover
                </Text>
              </Pressable>
            </View>

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
                        user.id,
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
                  {connectionSummary
                    ?.followingCount ??
                    0}
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
                        user.id,
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
                  {connectionSummary
                    ?.followerCount ??
                    0}
                </Text>

                <Text
                  style={
                    styles.connectionLabel
                  }
                >
                  Followers
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/activity",
                  )
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
                  ↗
                </Text>

                <Text
                  style={
                    styles.connectionLabel
                  }
                >
                  Activity
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {socialDataResolved ? (
          <View
            style={
              styles.playlistCard
            }
          >
            <View
              style={
                styles.playlistHeader
              }
            >
              <View>
                <Text
                  selectable
                  style={
                    styles.playlistTitle
                  }
                >
                  Spotify playlists
                </Text>

                <Text
                  selectable
                  style={
                    styles.playlistSubtitle
                  }
                >
                  Created from your Canal Scenes.
                </Text>
              </View>

              <Text
                style={
                  styles.playlistCount
                }
              >
                {
                  playlistExports.length
                }
              </Text>
            </View>

            {playlistExports.length >
            0 ? (
              <View
                style={
                  styles.playlistList
                }
              >
                {playlistExports.map(
                  (
                    playlist,
                  ) => (
                    <Pressable
                      key={
                        playlist.id
                      }
                      accessibilityRole={
                        playlist
                          .spotifyPlaylistUrl
                          ? "link"
                          : "button"
                      }
                      disabled={
                        !playlist
                          .spotifyPlaylistUrl
                      }
                      onPress={() => {
                        if (
                          playlist
                            .spotifyPlaylistUrl
                        ) {
                          void Linking.openURL(
                            playlist
                              .spotifyPlaylistUrl,
                          );
                        }
                      }}
                      style={
                        styles.playlistRow
                      }
                    >
                      <View
                        style={
                          styles.playlistIcon
                        }
                      >
                        <Text
                          style={
                            styles.playlistIconText
                          }
                        >
                          ♪
                        </Text>
                      </View>

                      <View
                        style={
                          styles.playlistCopy
                        }
                      >
                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.playlistName
                          }
                        >
                          {
                            playlist.sceneName
                          }
                        </Text>

                        <Text
                          style={
                            styles.playlistMeta
                          }
                        >
                          {
                            playlist.trackCount
                          }{" "}
                          tracks · Spotify
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.playlistArrow
                        }
                      >
                        ›
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            ) : (
              <Text
                selectable
                style={
                  styles.playlistEmpty
                }
              >
                Create a Spotify playlist from any Scene and it will appear here.
              </Text>
            )}
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

        {formErrorMessage ? (
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
                formErrorMessage
              }
            </Text>
          </View>
        ) : null}

        {!editing ? (
          <>
            {displayProfile ? (
              <View
                style={
                  styles.infoCard
                }
              >
                <ProfileSection
                  label="BIO"
                  value={
                    displayProfile.bio
                  }
                  empty="No bio added yet."
                />

                <View
                  style={
                    styles.divider
                  }
                />

                <ProfileSection
                  label="FAVORITE ACTIVITIES"
                  value={
                    displayProfile.favoriteActivities
                  }
                  empty="No favorite activities added yet."
                />
              </View>
            ) : null}

            <View
              style={
                styles.snapshotSectionHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.snapshotSectionTitle
                  }
                >
                  Public Snapshots
                </Text>

                <Text
                  style={
                    styles.snapshotSectionSubtitle
                  }
                >
                  Moments visible on your profile.
                </Text>
              </View>

              <Text
                style={
                  styles.snapshotCount
                }
              >
                {(
                  !snapshotDataResolved ||
                  snapshotIssue
                ) &&
                publicSnapshots.length ===
                  0
                  ? "—"
                  : publicSnapshots.length}
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

            {publicSnapshots.length >
            0 ? (
              <PublicSnapshotGrid
                snapshots={
                  publicSnapshots
                }
              />
            ) : snapshotDataResolved &&
              !snapshotIssue ? (
              <View
                style={
                  styles.snapshotEmpty
                }
              >
                <Text
                  style={
                    styles.snapshotEmptyTitle
                  }
                >
                  No public Snapshots
                </Text>

                <Text
                  style={
                    styles.snapshotEmptyText
                  }
                >
                  Publish a Snapshot from a Scene to add it to your profile.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push(
                      "/snapshots" as never,
                    )
                  }
                  style={
                    styles.snapshotAction
                  }
                >
                  <Text
                    style={
                      styles.snapshotActionText
                    }
                  >
                    Open Snapshots
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {profile ? (
              <Pressable
                accessibilityRole="button"
                onPress={
                  beginEditing
                }
                style={
                  styles.editButton
                }
              >
                <Text
                  style={
                    styles.editButtonText
                  }
                >
                  Edit Profile
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View
            style={
              styles.editCard
            }
          >
            <Text
              style={
                styles.editTitle
              }
            >
              Edit profile
            </Text>

            <FieldLabel
              text="Display name"
            />

            <TextInput
              value={
                draft.displayName
              }
              onChangeText={(
                value,
              ) =>
                setDraft(
                  (current) => ({
                    ...current,

                    displayName:
                      value,
                  }),
                )
              }
              placeholder="Your name"
              placeholderTextColor="#9A938C"
              maxLength={60}
              style={
                styles.input
              }
            />

            <FieldLabel
              text="Handle"
            />

            <TextInput
              value={
                draft.handle
              }
              onChangeText={(
                value,
              ) =>
                setDraft(
                  (current) => ({
                    ...current,

                    handle:
                      value,
                  }),
                )
              }
              placeholder="@yourhandle"
              placeholderTextColor="#9A938C"
              autoCapitalize="none"
              autoCorrect={
                false
              }
              maxLength={25}
              style={
                styles.input
              }
            />

            <FieldLabel
              text="Bio"
            />

            <TextInput
              value={
                draft.bio
              }
              onChangeText={(
                value,
              ) =>
                setDraft(
                  (current) => ({
                    ...current,

                    bio:
                      value,
                  }),
                )
              }
              placeholder="Tell people about your music taste."
              placeholderTextColor="#9A938C"
              multiline
              maxLength={300}
              style={[
                styles.input,
                styles.multiline,
              ]}
            />

            <FieldLabel
              text="Favorite activities"
            />

            <TextInput
              value={
                draft.favoriteActivities
              }
              onChangeText={(
                value,
              ) =>
                setDraft(
                  (current) => ({
                    ...current,

                    favoriteActivities:
                      value,
                  }),
                )
              }
              placeholder="Driving, studying, working out..."
              placeholderTextColor="#9A938C"
              multiline
              maxLength={300}
              style={[
                styles.input,
                styles.multiline,
              ]}
            />

            <View
              style={
                styles.publicRow
              }
            >
              <View
                style={
                  styles.publicCopy
                }
              >
                <Text
                  style={
                    styles.publicTitle
                  }
                >
                  Public profile
                </Text>

                <Text
                  style={
                    styles.publicDescription
                  }
                >
                  Other signed-in users can see your profile, public Scenes, and public Snapshots.
                </Text>
              </View>

              <Switch
                value={
                  draft.isPublic
                }
                onValueChange={(
                  value,
                ) =>
                  setDraft(
                    (current) => ({
                      ...current,

                      isPublic:
                        value,
                    }),
                  )
                }
              />
            </View>

            <View
              style={
                styles.editActions
              }
            >
              <Pressable
                accessibilityRole="button"
                disabled={
                  saving
                }
                onPress={
                  cancelEditing
                }
                style={
                  styles.cancelButton
                }
              >
                <Text
                  style={
                    styles.cancelText
                  }
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={
                  saving
                }
                onPress={() =>
                  void save()
                }
                style={
                  styles.saveButton
                }
              >
                {saving ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.saveText
                    }
                  >
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat(
  props: {
    value: number;
    label: string;
  },
) {
  return (
    <View
      style={
        styles.stat
      }
    >
      <Text
        style={
          styles.statValue
        }
      >
        {props.value}
      </Text>

      <Text
        style={
          styles.statLabel
        }
      >
        {props.label}
      </Text>
    </View>
  );
}

function ProfileSection(
  props: {
    label: string;
    value: string;
    empty: string;
  },
) {
  return (
    <View>
      <Text
        style={
          styles.sectionLabel
        }
      >
        {props.label}
      </Text>

      <Text
        style={[
          styles.sectionValue,

          !props.value &&
            styles.emptyValue,
        ]}
      >
        {props.value ||
          props.empty}
      </Text>
    </View>
  );
}

function FieldLabel(
  props: {
    text: string;
  },
) {
  return (
    <Text
      style={
        styles.fieldLabel
      }
    >
      {props.text}
    </Text>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
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
      paddingTop: 10,
      paddingBottom: 120,
      gap: 14,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },

    title: {
      color: "#181818",
      fontSize: 30,
      fontWeight: "900",
    },

    subtitle: {
      color: "#746D67",
      fontSize: 13,
      marginTop: 3,
    },

    settingsButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    settingsText: {
      color: "#F47A24",
      fontSize: 12,
      fontWeight: "900",
    },

    identityCard: {
      alignItems:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 24,
      padding: 22,
    },

    localLibraryTitle: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    localLibraryText: {
      maxWidth: 300,
      color: "#746D67",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 6,
    },

    avatar: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    avatarText: {
      color: "#FFFFFF",
      fontSize: 26,
      fontWeight: "900",
    },

    profileName: {
      color: "#1B1B1B",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 11,
    },

    handle: {
      color: "#817972",
      fontSize: 13,
      marginTop: 3,
    },

    visibilityBadge: {
      backgroundColor:
        "#FFF0E5",
      borderRadius: 11,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 10,
    },

    visibilityBadgeText: {
      color: "#F47A24",
      fontSize: 10,
      fontWeight: "900",
    },

    stats: {
      width: "100%",
      flexDirection: "row",
      marginTop: 19,
    },

    stat: {
      flex: 1,
      alignItems:
        "center",
    },

    statValue: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    statLabel: {
      color: "#817972",
      fontSize: 10,
      marginTop: 3,
    },

    connectionCard: {
      borderWidth: 1,
      borderColor:
        "#ECDDD2",
      borderRadius: 22,
      backgroundColor:
        "#FFFFFF",
      padding: 17,
      gap: 16,
    },

    connectionHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    connectionTitle: {
      color: "#1B1B1B",
      fontSize: 17,
      fontWeight: "900",
    },

    connectionSubtitle: {
      color: "#817972",
      fontSize: 10,
      marginTop: 3,
    },

    discoverText: {
      color: "#F47A24",
      fontSize: 11,
      fontWeight: "900",
    },

    connectionStats: {
      flexDirection:
        "row",
      gap: 8,
    },

    connectionStat: {
      flex: 1,
      minHeight: 66,
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
      fontSize: 17,
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

    playlistCard: {
      borderWidth: 1,
      borderColor:
        "#DCE9DE",
      borderRadius: 22,
      backgroundColor:
        "#F7FCF7",
      padding: 17,
      gap: 14,
    },

    playlistHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },

    playlistTitle: {
      color: "#17241A",
      fontSize: 17,
      fontWeight: "900",
    },

    playlistSubtitle: {
      color: "#6E7B70",
      fontSize: 10,
      marginTop: 3,
    },

    playlistCount: {
      color: "#1DB954",
      fontSize: 14,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    playlistList: {
      gap: 8,
    },

    playlistRow: {
      minHeight: 58,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      padding: 10,
    },

    playlistIcon: {
      width: 38,
      height: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 10,
      backgroundColor:
        "#1DB954",
    },

    playlistIconText: {
      color: "#07130B",
      fontSize: 17,
      fontWeight: "900",
    },

    playlistCopy: {
      flex: 1,
    },

    playlistName: {
      color: "#17241A",
      fontSize: 12,
      fontWeight: "900",
    },

    playlistMeta: {
      color: "#6E7B70",
      fontSize: 9,
      marginTop: 3,
    },

    playlistArrow: {
      color: "#1DB954",
      fontSize: 24,
    },

    playlistEmpty: {
      color: "#6E7B70",
      fontSize: 11,
      lineHeight: 17,
    },

    infoCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 18,
    },

    sectionLabel: {
      color: "#A09993",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    sectionValue: {
      color: "#393532",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
    },

    emptyValue: {
      color: "#99918A",
      fontStyle: "italic",
    },

    divider: {
      height: 1,
      backgroundColor:
        "#F0ECE8",
      marginVertical: 17,
    },

    snapshotSectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 4,
    },

    snapshotSectionTitle: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    snapshotSectionSubtitle: {
      color: "#817972",
      fontSize: 11,
      marginTop: 3,
    },

    snapshotCount: {
      color: "#F47A24",
      fontSize: 13,
      fontWeight: "900",
    },

    snapshotEmpty: {
      borderWidth: 1,
      borderColor:
        "#EEE5DE",
      borderRadius: 20,
      backgroundColor:
        "#FFFFFF",
      padding: 18,
    },

    snapshotEmptyTitle: {
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "900",
    },

    snapshotEmptyText: {
      color: "#746D67",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    snapshotAction: {
      alignSelf:
        "flex-start",
      borderRadius: 12,
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 12,
    },

    snapshotActionText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    editButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    editButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    editCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 18,
    },

    editTitle: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
      marginBottom: 2,
    },

    fieldLabel: {
      color: "#5E5752",
      fontSize: 11,
      fontWeight: "800",
      marginTop: 13,
      marginBottom: 6,
    },

    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 15,
      backgroundColor:
        "#FFFDFC",
      color: "#1B1B1B",
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },

    multiline: {
      minHeight: 88,
      textAlignVertical:
        "top",
    },

    publicRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      marginTop: 18,
      paddingTop: 16,
    },

    publicCopy: {
      flex: 1,
      paddingRight: 12,
    },

    publicTitle: {
      color: "#2A2623",
      fontSize: 14,
      fontWeight: "900",
    },

    publicDescription: {
      color: "#817972",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 4,
    },

    editActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },

    cancelButton: {
      flex: 1,
      minHeight: 51,
      borderWidth: 1,
      borderColor:
        "#DAD2CC",
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cancelText: {
      color: "#625B55",
      fontSize: 14,
      fontWeight: "900",
    },

    saveButton: {
      flex: 1.3,
      minHeight: 51,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    saveText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    successBox: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 15,
      padding: 13,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    errorBox: {
      backgroundColor:
        "#FFF0EF",
      borderRadius: 15,
      padding: 13,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
  });
