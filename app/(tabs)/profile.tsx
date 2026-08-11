import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";

import {
  PublicSnapshotGrid,
} from "../../components/PublicSnapshotCard";
import { VerifiedAccountBadge } from "../../components/verified-account-badge";
import { ProfileAvatar } from "../../components/profile-avatar";

import {
  CanalHeaderActions,
} from "../../components/canal-ui/canal-header-actions";

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
  listOwnSceneCollections,
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
  readScenes,
} from "../../lib/scenes";

import {
  readLocalSnapshotsWithStatus,
  readSnapshotsWithStatus,
} from "../../lib/snapshots";

import type {
  Snapshot,
} from "../../lib/snapshots";

import {
  supabase,
} from "../../lib/supabase";

import {
  removeOwnedProfileAvatar,
  uploadProfileAvatar,
} from "../../lib/profile-avatar";

import {
  CANAL_PROFILE_AVATARS,
  canalProfileAvatarImageSource,
} from "../../lib/canal-profile-avatars";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type ProfileForm = {
  avatarUrl: string;
  displayName: string;
  handle: string;
  bio: string;
  favoriteActivities: string;
  isPublic: boolean;
  isVerified: boolean;
  isCanal: boolean;
};

const EMPTY_PROFILE: ProfileForm = {
  avatarUrl: "",
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

type ProfileNetworkCacheEntry = Readonly<{
  summary: ProfileConnectionSummary;
  exports: ScenePlaylistExport[];
  cachedAt: number;
}>;

const PROFILE_NETWORK_CACHE_TTL_MS = 5 * 60 * 1_000;
const profileNetworkCache = new Map<string, ProfileNetworkCacheEntry>();

function readCachedProfileNetwork(userId: string | undefined): ProfileNetworkCacheEntry | null {
  if (!userId) return null;
  const entry = profileNetworkCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PROFILE_NETWORK_CACHE_TTL_MS) {
    profileNetworkCache.delete(userId);
    return null;
  }
  return entry;
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

  const initialNetworkCache = readCachedProfileNetwork(user?.id);

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
      initialNetworkCache?.summary ?? null,
    );

  const [
    playlistExports,
    setPlaylistExports,
  ] =
    useState<
      ScenePlaylistExport[]
    >(initialNetworkCache?.exports ?? []);

  const [
    soundscapeSnapshots,
    setSoundscapeSnapshots,
  ] =
    useState<
      Snapshot[]
    >([]);

  const [
    snapshotVisibilityFilter,
    setSnapshotVisibilityFilter,
  ] = useState<"all" | "public" | "private">("all");

  const [
    collections,
    setCollections,
  ] =
    useState<
      SceneCollectionSummary[]
    >([]);

  const [
    sceneDataResolved,
    setSceneDataResolved,
  ] = useState(Boolean(initialNetworkCache));

  const [
    snapshotDataResolved,
    setSnapshotDataResolved,
  ] = useState(false);

  const [
    collectionDataResolved,
    setCollectionDataResolved,
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
    pendingAvatar,
    setPendingAvatar,
  ] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const [avatarChooserOpen, setAvatarChooserOpen] = useState(false);
  const originalAvatarUrlRef = useRef("");

  const [
    removeAvatar,
    setRemoveAvatar,
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

  const snapshotRefreshRef = useRef<Promise<void> | null>(null);
  const hasRenderedProfileRef = useRef(Boolean(cachedAuthProfile));
  const hasNetworkDataRef = useRef(Boolean(initialNetworkCache));

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
            const cachedNetwork = readCachedProfileNetwork(user?.id);
            if (!hasRenderedProfileRef.current) setLoading(true);
            if (cachedNetwork) {
              setConnectionSummary(cachedNetwork.summary);
              setPlaylistExports(cachedNetwork.exports);
              hasNetworkDataRef.current = true;
            }
            setSocialDataResolved(
              Boolean(cachedNetwork) || hasNetworkDataRef.current,
            );
            setCollectionDataResolved(
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
                      "display_name, handle, avatar_url, bio, favorite_activities, is_public, is_verified, is_canal",
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
                  avatarUrl:
                    row?.avatar_url || "",
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
                hasRenderedProfileRef.current = true;

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
              readLocalSnapshotsWithStatus()
                .then(
                  (
                    snapshotResult,
                  ) => {
                    if (!isCurrent()) {
                      return;
                    }

                    setSoundscapeSnapshots(snapshotResult.value);

                    setSnapshotDataResolved(
                      true,
                    );

                    setSnapshotError(
                      snapshotResult.warning ??
                        null,
                    );

                    if (!snapshotRefreshRef.current) {
                      snapshotRefreshRef.current = readSnapshotsWithStatus()
                        .then((cloudResult) => {
                          if (!isCurrent()) return;
                          setSoundscapeSnapshots(cloudResult.value);
                          setSnapshotError(cloudResult.warning ?? null);
                        })
                        .catch((error: unknown) => {
                          if (isCurrent()) setSnapshotError(error);
                        })
                        .finally(() => {
                          snapshotRefreshRef.current = null;
                        });
                    }
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
                    profileNetworkCache.set(identityKey, {
                      summary: nextSummary,
                      exports: nextExports,
                      cachedAt: Date.now(),
                    });
                    hasNetworkDataRef.current = true;
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

            const collectionLoad =
              (
                user
                  ? listOwnSceneCollections()
                  : Promise.reject(
                      new Error(
                        "Sign in to refresh your Scene collections.",
                      ),
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
                    setCollectionDataResolved(
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

                    setCollectionDataResolved(
                      true,
                    );
                    setCollectionError(
                      error,
                    );
                  },
                );

            await Promise.all([
              profileLoad,
              sceneLoad,
              snapshotLoad,
              socialLoad,
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
            avatarUrl: "",
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

  const beginEditing =
    (): void => {
      if (!profile) {
        return;
      }

      setDraft({
        ...profile,
      });
      originalAvatarUrlRef.current = profile.avatarUrl;

      setMessage("");
      setFormErrorMessage(
        "",
      );
      setPendingAvatar(null);
      setRemoveAvatar(false);
      setAvatarChooserOpen(false);
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
      setPendingAvatar(null);
      setRemoveAvatar(false);
      setAvatarChooserOpen(false);
      setEditing(
        false,
      );
    };

  const chooseProfilePicture = async (
    source: "camera" | "library",
  ): Promise<void> => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Allow camera access in Settings to take a profile picture.");
        }
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            cameraType: ImagePicker.CameraType.front,
            mediaTypes: ["images"],
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ["images"],
            quality: 0.82,
          });

      if (!result.canceled && result.assets[0]) {
        setPendingAvatar(result.assets[0]);
        setRemoveAvatar(false);
        setAvatarChooserOpen(false);
        setFormErrorMessage("");
      }
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error ? error.message : "Canal could not open that photo.",
      );
    }
  };

  const selectCanalProfilePicture = (value: string): void => {
    setPendingAvatar(null);
    setRemoveAvatar(false);
    setDraft((current) => ({ ...current, avatarUrl: value }));
    setAvatarChooserOpen(false);
    setFormErrorMessage("");
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

      let uploadedAvatarUrl: string | null = null;
      let authenticatedUserId: string | null = null;

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
        authenticatedUserId = user.id;

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

        let avatarUrl = removeAvatar ? "" : draft.avatarUrl;
        if (pendingAvatar) {
          const uploaded = await uploadProfileAvatar(pendingAvatar, user.id);
          uploadedAvatarUrl = uploaded.publicUrl;
          avatarUrl = uploaded.publicUrl;
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

                avatar_url:
                  avatarUrl || null,

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
              "display_name, handle, avatar_url, bio, favorite_activities, is_public, is_verified, is_canal",
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
          avatarUrl:
            data.avatar_url || "",
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

        setPendingAvatar(null);
        setRemoveAvatar(false);
        setAvatarChooserOpen(false);

        setEditing(
          false,
        );

        const previousAvatarUrl = originalAvatarUrlRef.current;
        const replacedAvatar = previousAvatarUrl && previousAvatarUrl !== next.avatarUrl;
        if ((removeAvatar || replacedAvatar) && previousAvatarUrl) {
          try {
            await removeOwnedProfileAvatar(previousAvatarUrl, user.id);
          } catch {
            setMessage("Profile updated. Canal will retry cleaning up the previous photo later.");
            return;
          }
        }

        setMessage("Profile updated.");
      } catch (error) {
        if (uploadedAvatarUrl && authenticatedUserId) {
          try {
            await removeOwnedProfileAvatar(uploadedAvatarUrl, authenticatedUserId);
          } catch {
            // The failed upload is owner-scoped and can be retried by cleanup tooling.
          }
        }
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
      <CanalAmbientBackground />
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
            <Text style={styles.eyebrow}>YOUR SOUNDSCAPE</Text>
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
              The people, Scenes, and listening moments that shape your world.
            </Text>
          </View>

          <CanalHeaderActions />
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
            <View style={styles.identitySummary}>
              <ProfileAvatar
                avatarUrl={displayProfile.avatarUrl}
                displayName={displayProfile.displayName}
                size={88}
              />

              <View style={styles.identityCopy}>
                <View style={styles.profileNameRow}>
                  <Text numberOfLines={1} style={styles.profileName}>
                    {displayProfile.displayName}
                  </Text>
                  {displayProfile.isVerified ? <VerifiedAccountBadge size={19} /> : null}
                </View>

                <Text style={styles.handle}>{displayProfile.handle}</Text>

                <Text style={styles.soundscapeLabel}>CANAL LISTENER</Text>
              </View>

              {profile ? (
                <Pressable
                  accessibilityLabel="Edit Profile"
                  accessibilityHint="Change your picture, name, handle, bio, and visibility."
                  accessibilityRole="button"
                  onPress={beginEditing}
                  style={({ pressed }) => [styles.heroEditButton, pressed && styles.pressed]}
                >
                  <Text style={styles.heroEditText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={[styles.heroBio, !displayProfile.bio && styles.heroBioEmpty]}>
              {displayProfile.bio || "Add a short note about what moves you."}
            </Text>

            <View style={styles.identityMetaRow}>
              <View style={styles.visibilityBadge}>
                <Text style={styles.visibilityBadgeText}>
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

              {displayProfile.favoriteActivities ? (
                <Text numberOfLines={1} style={styles.favoriteActivityValue}>
                  {displayProfile.favoriteActivities}
                </Text>
              ) : null}
            </View>

            {user && socialDataResolved ? (
              <View style={styles.profileNetwork}>
                <Text style={styles.profileNetworkTitle}>Network</Text>
                <View style={styles.compactNetworkStats}>
                  <Pressable
                    accessibilityLabel="View following"
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/following", params: { profileId: user.id, mode: "following" } })}
                    style={styles.compactNetworkStat}
                  >
                    <Text style={styles.connectionValue}>{connectionSummary?.followingCount ?? 0}</Text>
                    <Text style={styles.connectionLabel}>Following</Text>
                  </Pressable>
                  <View style={styles.networkDivider} />
                  <Pressable
                    accessibilityLabel="View followers"
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/following", params: { profileId: user.id, mode: "followers" } })}
                    style={styles.compactNetworkStat}
                  >
                    <Text style={styles.connectionValue}>{connectionSummary?.followerCount ?? 0}</Text>
                    <Text style={styles.connectionLabel}>Followers</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

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

        <View style={styles.profileActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open My Stages"
            onPress={() => router.push("/managed-stages")}
            style={({ pressed }) => [styles.profileQuickAction, pressed && styles.pressed]}
          >
            <View style={styles.profileQuickIcon}>
              <Ionicons color={canalDynamicColors.mint} name="radio-outline" size={22} />
            </View>
            <View style={styles.profileQuickCopy}>
              <Text style={styles.profileActionTitle}>My Stages</Text>
              <Text numberOfLines={1} style={styles.profileActionCopy}>Manage live rooms</Text>
            </View>
            <Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={17} />
          </Pressable>

          {socialDataResolved ? <Pressable
            accessibilityHint="Opens exported playlists grouped by date."
            accessibilityLabel="View exported playlists"
            accessibilityRole="button"
            onPress={() => router.push("/exported-playlists")}
            style={({ pressed }) => [styles.profileQuickAction, pressed && styles.pressed]}
          >
            <View style={styles.profileQuickIcon}>
              <Ionicons color={canalDynamicColors.mint} name="musical-notes-outline" size={22} />
            </View>
            <View style={styles.profileQuickCopy}>
              <Text style={styles.profileActionTitle}>Playlists</Text>
              <Text numberOfLines={1} style={styles.profileActionCopy}>{playlistExports.length} exported</Text>
            </View>
            <Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={17} />
          </Pressable> : null}
        </View>

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
            <View
              style={
                styles.collectionSectionHeader
              }
            >
              <View
                style={
                  styles.collectionSectionCopy
                }
              >
                <Text
                  style={
                    styles.snapshotSectionTitle
                  }
                >
                  Scene Collections
                </Text>

                <Text
                  style={
                    styles.snapshotSectionSubtitle
                  }
                >
                  Curate ordered sets of your public Scenes.
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Create a Scene collection"
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/collections/new" as never,
                  )
                }
                style={
                  styles.collectionCreateButton
                }
              >
                <Text
                  style={
                    styles.collectionCreateText
                  }
                >
                  New
                </Text>
              </Pressable>
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
                            styles.collectionMeta
                          }
                        >
                          {
                            collection.sceneCount
                          }{" "}
                          {collection.sceneCount ===
                          1
                            ? "Scene"
                            : "Scenes"}{" "}
                          ·{" "}
                          {collection.isPublic
                            ? "Public"
                            : "Draft"}
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
            ) : collectionDataResolved &&
              !collectionIssue ? (
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
                  No Scene collections
                </Text>

                <Text
                  style={
                    styles.snapshotEmptyText
                  }
                >
                  Group your public Scenes into a shareable, ordered collection.
                </Text>
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
                  Your Soundscape
                </Text>

                <Text
                  style={
                    styles.snapshotSectionSubtitle
                  }
                >
                  Every Snapshot you create is saved here. Visibility only controls what other people can see.
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
                soundscapeSnapshots.length ===
                  0
                  ? "—"
                  : soundscapeSnapshots.length}
              </Text>
            </View>

            <View accessibilityRole="tablist" style={styles.snapshotVisibilityFilters}>
              {(["all", "public", "private"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: snapshotVisibilityFilter === value }}
                  onPress={() => setSnapshotVisibilityFilter(value)}
                  style={[
                    styles.snapshotVisibilityFilter,
                    snapshotVisibilityFilter === value && styles.snapshotVisibilityFilterSelected,
                  ]}
                >
                  <Text style={[
                    styles.snapshotVisibilityFilterText,
                    snapshotVisibilityFilter === value && styles.snapshotVisibilityFilterTextSelected,
                  ]}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </Text>
                </Pressable>
              ))}
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

            {soundscapeSnapshots.filter((snapshot) =>
              snapshotVisibilityFilter === "all" || snapshot.visibility === snapshotVisibilityFilter,
            ).length >
            0 ? (
              <PublicSnapshotGrid
                snapshots={
                  soundscapeSnapshots.filter((snapshot) =>
                    snapshotVisibilityFilter === "all" || snapshot.visibility === snapshotVisibilityFilter,
                  )
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
                  No {snapshotVisibilityFilter === "all" ? "Snapshots" : `${snapshotVisibilityFilter} Snapshots`}
                </Text>

                <Text
                  style={
                    styles.snapshotEmptyText
                  }
                >
                  Create a Snapshot from a Scene or Stage. It will be saved here automatically.
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

            <View style={styles.avatarEditor}>
              <Pressable
                accessibilityLabel="Change profile picture"
                accessibilityHint="Open choices for Photo Library, camera, and Canal profile pictures"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setAvatarChooserOpen(true)}
                style={({ pressed }) => [styles.avatarPreviewButton, pressed && styles.pressed]}
              >
                <ProfileAvatar
                  avatarUrl={pendingAvatar?.uri || (!removeAvatar ? draft.avatarUrl : "")}
                  displayName={draft.displayName}
                  size={76}
                />
                <View style={styles.avatarEditGlyph}>
                  <Ionicons color={canalDynamicColors.onAccent} name="camera-outline" size={15} />
                </View>
              </Pressable>
              <View style={styles.avatarEditorCopy}>
                <Text style={styles.avatarEditorTitle}>Profile picture</Text>
                <Text style={styles.avatarEditorHelp}>Tap the picture to upload, take a photo, or choose a Canal design.</Text>
                <Pressable
                  accessibilityLabel="Open profile picture choices"
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => setAvatarChooserOpen(true)}
                  style={({ pressed }) => [styles.avatarAction, pressed && styles.pressed]}
                >
                  <Text style={styles.avatarActionText}>{draft.avatarUrl || pendingAvatar ? "Change picture" : "Add picture"}</Text>
                </Pressable>
              </View>
            </View>

            <Modal
              animationType="slide"
              onRequestClose={() => setAvatarChooserOpen(false)}
              presentationStyle="pageSheet"
              visible={avatarChooserOpen}
            >
              <SafeAreaView style={styles.avatarChooserScreen}>
                <View style={styles.avatarChooserHeader}>
                  <Pressable
                    accessibilityLabel="Close profile picture choices"
                    accessibilityRole="button"
                    onPress={() => setAvatarChooserOpen(false)}
                    style={styles.avatarChooserClose}
                  >
                    <Ionicons color={canalDynamicColors.text} name="close" size={24} />
                  </Pressable>
                  <Text style={styles.avatarChooserTitle}>Profile picture</Text>
                  <View style={styles.avatarChooserClose} />
                </View>
                <ScrollView contentContainerStyle={styles.avatarChooserContent}>
                  <View style={styles.avatarSourceRow}>
                    <Pressable
                      accessibilityLabel="Choose profile picture from library"
                      accessibilityRole="button"
                      onPress={() => void chooseProfilePicture("library")}
                      style={({ pressed }) => [styles.avatarSourceAction, pressed && styles.pressed]}
                    >
                      <Ionicons color={canalDynamicColors.text} name="images-outline" size={25} />
                      <Text style={styles.avatarSourceText}>Photo Library</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Take a profile picture"
                      accessibilityRole="button"
                      onPress={() => void chooseProfilePicture("camera")}
                      style={({ pressed }) => [styles.avatarSourceAction, pressed && styles.pressed]}
                    >
                      <Ionicons color={canalDynamicColors.text} name="camera-outline" size={25} />
                      <Text style={styles.avatarSourceText}>Take Photo</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.canalAvatarTitle}>Canal profile pictures</Text>
                  <Text style={styles.canalAvatarHelp}>Ten color flows drawn from Canal’s Scene palettes.</Text>
                  <View style={styles.canalAvatarGrid}>
                    {CANAL_PROFILE_AVATARS.map((avatar) => {
                      const selected = !pendingAvatar && !removeAvatar && draft.avatarUrl === avatar.value;
                      return (
                        <Pressable
                          key={avatar.id}
                          accessibilityLabel={`Choose ${avatar.name} Canal profile picture`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => selectCanalProfilePicture(avatar.value)}
                          style={({ pressed }) => [styles.canalAvatarChoice, selected && styles.canalAvatarChoiceSelected, pressed && styles.pressed]}
                        >
                          <Image
                            contentFit="cover"
                            source={canalProfileAvatarImageSource(avatar.value) ?? undefined}
                            style={styles.canalAvatarImage}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  {draft.avatarUrl || pendingAvatar ? (
                    <Pressable
                      accessibilityLabel="Remove profile picture"
                      accessibilityRole="button"
                      onPress={() => {
                        setPendingAvatar(null);
                        setRemoveAvatar(true);
                        setDraft((current) => ({ ...current, avatarUrl: "" }));
                        setAvatarChooserOpen(false);
                      }}
                      style={styles.removeAvatarAction}
                    >
                      <Text style={styles.removeAvatarText}>Remove picture</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </SafeAreaView>
            </Modal>

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
              placeholderTextColor={canalDynamicColors.muted}
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
              placeholderTextColor={canalDynamicColors.muted}
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
              placeholderTextColor={canalDynamicColors.muted}
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
              placeholderTextColor={canalDynamicColors.muted}
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
        "transparent",
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
      alignItems: "stretch",
      justifyContent:
        "space-between",
      marginBottom: 4,
    },

    eyebrow: {
      color: canalDynamicColors.text,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2,
      marginBottom: 6,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 38,
      fontWeight: "500",
      letterSpacing: -1.1,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 18,
      maxWidth: 270,
      marginTop: 3,
    },

    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    activityButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#E2DAD4",
      borderRadius: 24,
      backgroundColor: canalDynamicColors.surface,
    },

    activityIcon: {
      width: 22,
      height: 24,
      alignItems: "center",
      justifyContent: "flex-end",
    },

    activityBellDome: {
      width: 16,
      height: 15,
      borderWidth: 1.75,
      borderBottomWidth: 0,
      borderColor: "#4C46C8",
      borderTopLeftRadius: 9,
      borderTopRightRadius: 9,
    },

    activityBellLip: {
      width: 20,
      height: 5,
      borderWidth: 1.75,
      borderColor: "#4C46C8",
      borderTopWidth: 0,
      borderBottomLeftRadius: 7,
      borderBottomRightRadius: 7,
    },

    activityBellClapper: {
      width: 4,
      height: 3,
      marginTop: 1,
      borderRadius: 2,
      backgroundColor: "#4C46C8",
    },

    settingsButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    settingsText: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
    },

    identityCard: {
      backgroundColor: canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 28,
      borderCurve: "continuous",
      padding: 18,
      gap: 14,
      overflow: "hidden",
    },

    identitySummary: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
    },

    identityCopy: {
      flex: 1,
      alignItems: "flex-start",
      minWidth: 0,
    },

    localLibraryTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    localLibraryText: {
      maxWidth: 300,
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 6,
    },

    avatar: {
      width: "100%",
      height: "100%",
      borderRadius: 24,
      borderCurve: "continuous",
      overflow: "hidden",
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: "rgba(82, 110, 208, 0.84)",
    },

    avatarText: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "900",
    },

    avatarImage: {
      width: "100%",
      height: "100%",
      borderRadius: 24,
    },

    profileName: {
      flexShrink: 1,
      color: canalDynamicColors.text,
      fontSize: 26,
      fontFamily: "Georgia",
      fontWeight: "500",
      letterSpacing: -0.5,
    },

    profileNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },

    heroEditButton: {
      minWidth: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },

    heroEditText: {
      color: canalDynamicColors.mint,
      fontSize: 12,
      fontWeight: "900",
    },

    heroBio: {
      color: canalDynamicColors.text,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 360,
    },

    heroBioEmpty: {
      color: canalDynamicColors.muted,
      fontStyle: "italic",
    },

    handle: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      marginTop: 2,
    },

    soundscapeLabel: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 8,
    },

    identityMetaRow: {
      width: "100%",
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    visibilityBadge: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    visibilityBadgeText: {
      color: canalDynamicColors.mint,
      fontSize: 10,
      fontWeight: "900",
    },

    stats: {
      width: "100%",
      flexDirection: "row",
      marginTop: 2,
      paddingTop: 14,
      borderTopWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    stat: {
      flex: 1,
      alignItems:
        "center",
    },

    statValue: {
      color: canalDynamicColors.text,
      fontSize: 21,
      fontWeight: "900",
    },

    statLabel: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },

    favoriteActivityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 34,
      paddingTop: 2,
    },

    favoriteActivityLabel: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    favoriteActivityValue: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 12,
      textAlign: "right",
    },

    profileActions: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 2,
    },

    profileQuickAction: {
      flex: 1,
      minWidth: 0,
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: canalDynamicColors.line,
      backgroundColor: "transparent",
    },

    profileQuickIcon: {
      width: 36,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    profileQuickCopy: {
      flex: 1,
      minWidth: 0,
    },

    profileAction: {
      flex: 1,
      minHeight: 116,
      justifyContent: "space-between",
      padding: 14,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    profileActionIconSurface: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: "rgba(141, 229, 210, 0.12)",
      marginBottom: 10,
    },

    profileActionIcon: {
      width: 20,
      height: 20,
    },

    profileActionTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    profileActionCopy: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 2,
    },

    profileNetwork: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: canalDynamicColors.line,
      gap: 5,
    },

    profileNetworkTitle: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },

    compactNetworkStats: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: "transparent",
    },

    compactNetworkStat: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    networkDivider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: 10,
      backgroundColor: canalDynamicColors.line,
    },

    connectionCard: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
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
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
    },

    connectionSubtitle: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },

    discoverText: {
      color: canalDynamicColors.mint,
      fontSize: 11,
      fontWeight: "900",
      paddingVertical: 14,
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
      backgroundColor: canalDynamicColors.elevated,
    },

    connectionValue: {
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    connectionIcon: {
      width: 19,
      height: 19,
    },

    connectionLabel: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "800",
      marginTop: 4,
    },

    playlistCard: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 17,
      gap: 14,
    },

    playlistButton: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    playlistButtonIcon: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    playlistButtonCopy: {
      flex: 1,
      minWidth: 0,
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
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
    },

    playlistSubtitle: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },

    playlistCount: {
      color: canalDynamicColors.mint,
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
      backgroundColor: canalDynamicColors.elevated,
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

    playlistSymbol: {
      width: 20,
      height: 20,
    },

    playlistCopy: {
      flex: 1,
    },

    playlistName: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
    },

    playlistMeta: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      marginTop: 3,
    },

    playlistArrow: {
      color: "#1DB954",
      fontSize: 24,
    },

    playlistEmpty: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 17,
    },

    avatarEditor: {
      minHeight: 96,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 14,
      borderRadius: 20,
      backgroundColor: canalDynamicColors.surface,
    },

    avatarPreviewButton: {
      width: 76,
      height: 76,
      borderRadius: 38,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },

    avatarEditGlyph: {
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 27,
      height: 27,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: canalDynamicColors.mint,
      borderWidth: 2,
      borderColor: canalDynamicColors.baseCanvas,
    },

    avatarEditorCopy: {
      flex: 1,
      gap: 4,
    },

    avatarEditorTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "800",
    },

    avatarEditorHelp: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 16,
    },

    avatarAction: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: canalDynamicColors.elevated,
    },

    avatarActionText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "800",
    },

    avatarChooserScreen: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },

    avatarChooserHeader: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: canalDynamicColors.line,
    },

    avatarChooserClose: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    avatarChooserTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 20,
    },

    avatarChooserContent: {
      gap: 14,
      padding: 20,
      paddingBottom: 48,
    },

    avatarSourceRow: {
      flexDirection: "row",
      gap: 12,
    },

    avatarSourceAction: {
      flex: 1,
      minHeight: 76,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },

    avatarSourceText: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "700",
    },

    canalAvatarTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 21,
      marginTop: 8,
    },

    canalAvatarHelp: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    canalAvatarGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 15,
    },

    canalAvatarChoice: {
      width: 62,
      height: 62,
      borderRadius: 31,
      padding: 3,
    },

    canalAvatarChoiceSelected: {
      borderWidth: 2,
      borderColor: canalDynamicColors.mint,
    },

    canalAvatarImage: {
      width: "100%",
      height: "100%",
      borderRadius: 28,
    },

    removeAvatarAction: {
      alignSelf: "flex-start",
      minHeight: 48,
      justifyContent: "center",
      marginTop: 6,
    },

    removeAvatarText: {
      color: canalDynamicColors.danger,
      fontSize: 13,
      fontWeight: "700",
    },

    infoCard: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      borderCurve: "continuous",
      padding: 18,
    },

    sectionLabel: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    sectionValue: {
      color: canalDynamicColors.text,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
    },

    emptyValue: {
      color: canalDynamicColors.muted,
      fontStyle: "italic",
    },

    divider: {
      height: 1,
      backgroundColor:
        canalDynamicColors.line,
      marginVertical: 17,
    },

    collectionSectionHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      marginTop: 4,
    },

    collectionSectionCopy: {
      flex: 1,
    },

    collectionCreateButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 13,
      backgroundColor: "rgba(141, 229, 210, 0.16)",
      paddingHorizontal: 16,
    },

    collectionCreateText: {
      color: canalDynamicColors.mint,
      fontSize: 11,
      fontWeight: "900",
    },

    collectionList: {
      gap: 9,
    },

    collectionCard: {
      minHeight: 68,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },

    collectionCopy: {
      flex: 1,
    },

    collectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    collectionMeta: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },

    collectionArrow: {
      color: canalDynamicColors.mint,
      fontSize: 24,
      marginLeft: 10,
    },

    snapshotSectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 4,
    },

    templateSection: {
      minHeight: 94,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 14,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 16,
    },

    templateSectionCopy: {
      flex: 1,
      gap: 3,
    },

    templateTitleRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 9,
    },

    defaultTemplateText: {
      color: canalDynamicColors.gold,
      fontSize: 10,
      fontWeight: "900",
      marginTop: 5,
    },

    manageTemplateButton: {
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 13,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.warningSurface,
      paddingHorizontal: 13,
    },

    manageTemplateText: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
    },

    snapshotSectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    snapshotSectionSubtitle: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 3,
    },

    snapshotCount: {
      color: canalDynamicColors.mint,
      fontSize: 13,
      fontWeight: "900",
    },

    snapshotVisibilityFilters: {
      minHeight: 48,
      flexDirection: "row",
      padding: 4,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
    },

    snapshotVisibilityFilter: {
      flex: 1,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
    },

    snapshotVisibilityFilterSelected: {
      backgroundColor: canalDynamicColors.warningSurface,
    },

    snapshotVisibilityFilterText: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
    },

    snapshotVisibilityFilterTextSelected: {
      color: canalDynamicColors.text,
    },

    snapshotEmpty: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 18,
    },

    snapshotEmptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    snapshotEmptyText: {
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.text,
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
      backgroundColor: "rgba(141, 229, 210, 0.17)",
      borderWidth: 1,
      borderColor: "rgba(141, 229, 210, 0.25)",
    },

    editButtonText: {
      color: canalDynamicColors.mint,
      fontSize: 15,
      fontWeight: "900",
    },

    editCard: {
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      borderCurve: "continuous",
      padding: 18,
    },

    editTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
      marginBottom: 2,
    },

    fieldLabel: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 13,
      marginBottom: 6,
    },

    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius: 15,
      backgroundColor: canalDynamicColors.elevated,
      color: canalDynamicColors.text,
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
        canalDynamicColors.line,
      marginTop: 18,
      paddingTop: 16,
    },

    publicCopy: {
      flex: 1,
      paddingRight: 12,
    },

    publicTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    publicDescription: {
      color: canalDynamicColors.muted,
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
        canalDynamicColors.line,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cancelText: {
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    pressed: {
      opacity: 0.7,
    },

    managedStagesLink: {
      minHeight: 82,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    managedStagesTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    managedStagesCopy: {
      maxWidth: 290,
      paddingTop: 4,
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 18,
    },

    managedStagesArrow: {
      color: canalDynamicColors.mint,
      fontSize: 34,
      fontWeight: "400",
    },

    successBox: {
      backgroundColor: canalDynamicColors.successSurface,
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
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 13,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
  });
