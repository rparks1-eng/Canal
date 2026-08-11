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
  Linking,
  Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../providers/auth-provider";

import {
    RecoveryNotice,
} from "../../components/recovery-notice";
import { SnapshotComposition } from "../../components/snapshot-composition";
import { ProfileAvatar } from "../../components/profile-avatar";
import {
    useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import { shareFinishedSnapshot } from "../../lib/snapshot-media-production";
import { canalCanonicalUrl } from "../../lib/canal-share";
import {
    classifyRecoveryIssue,
} from "../../lib/recovery-issue";
import {
    deleteSnapshotWithStatus,
    readSnapshotWithStatus,
    Snapshot,
    updateSnapshotWithStatus,
} from "../../lib/snapshots";
import {
    readSoundscape,
    saveSoundscape,
    SoundscapeProfile,
} from "../../lib/soundscape";
import {
    snapshotReturnAction,
} from "../../lib/snapshot-navigation";
import {
  useConnectivity,
} from "../../providers/connectivity-provider";

import { canonicalSpotifyTrackUrl } from "../../lib/spotify-track-links";

import {
  addSnapshotComment,
  loadSnapshotSocial,
  setSnapshotCommentLike,
  setSnapshotLike,
  subscribeSnapshotSocial,
} from "../../lib/snapshot-social";

import type {
  SnapshotComment,
  SnapshotSocialState,
} from "../../lib/snapshot-social";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { PublicPreviewActions, PublicPreviewState } from "../../components/public-preview";
import { getOrCreatePublicSnapshotShareId, getPublicSnapshotLinkPreview, type PublicLinkPreview } from "../../lib/public-link-previews";

function closeSnapshot(): void {
  const action =
    snapshotReturnAction(
      router.canGoBack(),
    );

  if (action === "back") {
    router.back();

    return;
  }

  router.replace(
    action,
  );
}

export default function SnapshotDetailScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const params = useLocalSearchParams();
  const snapshotId = firstParam(params.snapshotId);

  const isPublicShareId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(snapshotId);
  if (isPublicShareId) {
    return <SnapshotUuidRoute signedIn={Boolean(user)} snapshotId={snapshotId} />;
  }
  if (!user) {
    return <PublicSnapshotPreview signedIn={Boolean(user)} snapshotId={snapshotId} />;
  }

  return (
    <SnapshotDetailContent
      key={`${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}:${snapshotId}`}
    />
  );
}

function SnapshotUuidRoute({ signedIn, snapshotId }: { signedIn: boolean; snapshotId: string }) {
  const [internalSnapshot, setInternalSnapshot] = useState<boolean | null>(signedIn ? null : false);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!signedIn) {
      setInternalSnapshot(false);
      return () => { active = false; };
    }
    setInternalSnapshot(null);
    void readSnapshotWithStatus(snapshotId)
      .then((result) => { if (active) setInternalSnapshot(Boolean(result.value)); })
      .catch(() => { if (active) setInternalSnapshot(false); });
    return () => { active = false; };
  }, [signedIn, snapshotId]));

  if (internalSnapshot === null) {
    return <SafeAreaView style={publicStyles.safe}><PublicPreviewState status="loading" /></SafeAreaView>;
  }
  return internalSnapshot
    ? <SnapshotDetailContent />
    : <PublicSnapshotPreview signedIn={signedIn} snapshotId={snapshotId} />;
}

function PublicSnapshotPreview({ signedIn, snapshotId }: { signedIn: boolean; snapshotId: string }) {
  const [preview, setPreview] = useState<PublicLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void getPublicSnapshotLinkPreview(snapshotId)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setPreview(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [snapshotId]));

  if (loading) return <SafeAreaView style={publicStyles.safe}><PublicPreviewState status="loading" /></SafeAreaView>;
  if (!preview) return <SafeAreaView style={publicStyles.safe}><PublicPreviewState status="not-found" /></SafeAreaView>;

  const sceneName = typeof preview.sceneName === "string" ? preview.sceneName : "Canal Snapshot";
  const trackTitle = typeof preview.trackTitle === "string" ? preview.trackTitle : "A Scene moment";
  const trackArtist = typeof preview.trackArtist === "string" ? preview.trackArtist : "";
  const creator = typeof preview.ownerDisplayName === "string" ? preview.ownerDisplayName : "Canal listener";

  return (
    <SafeAreaView style={publicStyles.safe}>
      <View style={publicStyles.content}>
        <Text style={publicStyles.eyebrow}>PUBLIC SNAPSHOT</Text>
        <Text accessibilityRole="header" style={publicStyles.title}>{sceneName}</Text>
        <Text style={publicStyles.track}>{trackTitle}{trackArtist ? ` · ${trackArtist}` : ""}</Text>
        <Text style={publicStyles.byline}>Captured by {creator}</Text>
        <PublicPreviewActions destination={`/snapshots/${snapshotId}`} signedIn={signedIn} primaryLabel="Open Snapshots" onPrimary={() => router.push("/snapshots")} />
      </View>
    </SafeAreaView>
  );
}

const publicStyles = StyleSheet.create({
  safe: { backgroundColor: "#0A2030", flex: 1 },
  content: { flex: 1, gap: 13, justifyContent: "center", padding: 28 },
  eyebrow: { color: "#72D8C4", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "700" },
  track: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  byline: { color: "rgba(255,255,255,.68)", fontSize: 14, marginBottom: 8 },
});

function SnapshotDetailContent() {
  const { user } = useAuth();
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams();

  const snapshotId =
    firstParam(
      params.snapshotId,
    );
  const compositionRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);

  const loadRequestId =
    useRef(0);

  const snapshotIdRef =
    useRef(
      snapshotId,
    );

  snapshotIdRef.current =
    snapshotId;

  const [
    snapshot,
    setSnapshot,
  ] = useState<Snapshot | null>(
    null,
  );

  const [
    soundscape,
    setSoundscape,
  ] =
    useState<SoundscapeProfile | null>(
      null,
    );

  const [note, setNote] =
    useState("");

  const [mood, setMood] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    activeAction,
    setActiveAction,
  ] = useState<
    | "save"
    | "visibility"
    | "delete"
    | ""
  >("");

  const [
    cloudWarning,
    setCloudWarning,
  ] = useState("");

  const [
    loadError,
    setLoadError,
  ] = useState<unknown>(
    null,
  );

  const [social, setSocial] = useState<SnapshotSocialState>({
    summary: { likeCount: 0, commentCount: 0, likedByMe: false },
    comments: [],
  });
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialAction, setSocialAction] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<SnapshotComment | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  const loadSnapshot =
    useCallback(async () => {
      if (
        snapshotIdRef.current !==
        snapshotId
      ) {
        return;
      }

      const requestId =
        loadRequestId.current +
        1;

      loadRequestId.current =
        requestId;

      const isCurrentRequest =
        (): boolean => {
          return (
            loadRequestId.current ===
              requestId &&
            snapshotIdRef.current ===
              snapshotId
          );
        };

      try {
        setIsLoading(true);
        setLoadError(
          null,
        );

        const snapshotResult =
          await readSnapshotWithStatus(
            snapshotId,
          );

        if (
          !isCurrentRequest()
        ) {
          return;
        }

        let storedSoundscape:
          SoundscapeProfile | null =
            null;

        try {
          storedSoundscape =
            await readSoundscape();
        } catch (error) {
          console.warn(
            "Snapshot loaded, but Soundscape membership could not be read:",
            error,
          );
        }

        if (
          !isCurrentRequest()
        ) {
          return;
        }

        setSnapshot(
          snapshotResult.value,
        );

        setCloudWarning(
          snapshotResult.warning ??
          "",
        );

        setNote(
          snapshotResult.value?.note ??
            "",
        );

        setMood(
          snapshotResult.value?.mood ??
            "",
        );

        setSoundscape(
          storedSoundscape,
        );

        if (
          !snapshotResult.value &&
          snapshotResult.warning
        ) {
          setLoadError(
            new Error(
              snapshotResult.warning,
            ),
          );
        }
      } catch (error) {
        if (
          !isCurrentRequest()
        ) {
          return;
        }

        console.error(
          "Unable to load Snapshot:",
          error,
        );

        const loadFailure =
          error ??
          new Error(
            "Canal could not load this Snapshot.",
          );

        setSnapshot(
          null,
        );

        setLoadError(
          () =>
            loadFailure,
        );
      } finally {
        if (
          isCurrentRequest()
        ) {
          setIsLoading(
            false,
          );
        }
      }
    }, [snapshotId]);

  const loadSocial = useCallback(async () => {
    if (!snapshotId || !user?.id) {
      setSocialLoading(false);
      return;
    }

    try {
      setSocialLoading(true);
      setSocial(await loadSnapshotSocial(snapshotId, user.id));
    } catch (error) {
      console.warn("Unable to load Snapshot conversation:", error);
    } finally {
      setSocialLoading(false);
    }
  }, [snapshotId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadSnapshot();
      void loadSocial();

      return () => {
        loadRequestId.current +=
          1;
      };
    }, [loadSnapshot, loadSocial]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!snapshotId || !user?.id) return;
      return subscribeSnapshotSocial(snapshotId, () => {
        void loadSocial();
      });
    }, [loadSocial, snapshotId, user?.id]),
  );

  useReconnectReload(
    loadSnapshot,
  );

  const loadIssue =
    loadError
      ? classifyRecoveryIssue(
          loadError,
          {
            service:
              "canal",
            connectivityStatus,
          },
        )
      : null;

  const recoverSnapshot =
    async (): Promise<void> => {
      if (
        loadIssue?.action ===
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
        await loadSnapshot();
      }
    };

  async function saveChanges() {
    if (!snapshot) {
      return;
    }

    try {
      setActiveAction("save");

      const result =
        await updateSnapshotWithStatus(
          snapshot.id,
          {
            note,
            mood,
          },
        );

      setSnapshot(
        result.value,
      );

      setCloudWarning(
        result.warning ?? "",
      );

      if (result.warning) {
        Alert.alert(
          "Saved on this device",
          result.warning,
        );
      } else {
        Alert.alert(
          "Snapshot updated",
          "Your note and mood were saved to Canal.",
        );
      }
    } catch (error) {
      console.error(
        "Unable to save Snapshot:",
        error,
      );

      Alert.alert(
        "Unable to save",
        error instanceof Error
          ? error.message
          : "Canal could not update this Snapshot.",
      );
    } finally {
      setActiveAction("");
    }
  }

  async function toggleLike() {
    if (!user?.id || socialAction) {
      return;
    }

    const nextLiked = !social.summary.likedByMe;
    setSocialAction("snapshot-like");
    setSocial((current) => ({
      ...current,
      summary: {
        ...current.summary,
        likedByMe: nextLiked,
        likeCount: Math.max(0, current.summary.likeCount + (nextLiked ? 1 : -1)),
      },
    }));

    try {
      await setSnapshotLike(snapshotId, nextLiked, user.id);
    } catch (error) {
      await loadSocial();
      Alert.alert("Unable to update like", error instanceof Error ? error.message : "Try again shortly.");
    } finally {
      setSocialAction("");
    }
  }

  async function submitComment() {
    const body = commentText.trim();
    if (!user?.id || !body || socialAction) {
      return;
    }

    try {
      setSocialAction("comment");
      await addSnapshotComment(snapshotId, body, user.id, replyingTo?.id);
      setCommentText("");
      setReplyingTo(null);
      await loadSocial();
    } catch (error) {
      Alert.alert("Unable to post comment", error instanceof Error ? error.message : "Try again shortly.");
    } finally {
      setSocialAction("");
    }
  }

  async function toggleCommentLike(comment: SnapshotComment) {
    if (!user?.id || socialAction) {
      return;
    }

    try {
      setSocialAction(`comment-like:${comment.id}`);
      await setSnapshotCommentLike(snapshotId, comment.id, !comment.likedByMe, user.id);
      await loadSocial();
    } catch (error) {
      Alert.alert("Unable to update comment", error instanceof Error ? error.message : "Try again shortly.");
    } finally {
      setSocialAction("");
    }
  }

  async function toggleVisibility(
    makePublic: boolean,
  ) {
    if (!snapshot) {
      return;
    }

    try {
      setActiveAction(
        "visibility",
      );

      const result =
        await updateSnapshotWithStatus(
          snapshot.id,
          {
            visibility:
              makePublic
                ? "public"
                : "private",
          },
        );

      setSnapshot(
        result.value,
      );

      setCloudWarning(
        result.warning ?? "",
      );

      if (result.warning) {
        Alert.alert(
          "Visibility pending",
          result.warning,
        );
      }
    } catch (error) {
      console.error(
        "Unable to update visibility:",
        error,
      );

      Alert.alert(
        "Unable to update",
        error instanceof Error
          ? error.message
          : "Canal could not change the Snapshot visibility.",
      );
    } finally {
      setActiveAction("");
    }
  }

  async function handleShare() {
    if (!snapshot) {
      return;
    }

    try {
      const publicShareId = snapshot.visibility === "public"
        ? await getOrCreatePublicSnapshotShareId(snapshot.id)
        : null;
      await shareFinishedSnapshot({
        mediaUri: snapshot.mediaUri,
        mediaType: snapshot.mediaType,
        compositionRef,
        overlayRef,
        dialogTitle: `Snapshot from ${snapshot.sceneName}`,
        canonicalUrl:
          publicShareId
            ? canalCanonicalUrl(`/snapshots/${encodeURIComponent(publicShareId)}`)
            : undefined,
      });
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share this Snapshot.",
      );
    }
  }

  async function openSpotify() {
    const spotifyUrl = canonicalSpotifyTrackUrl(snapshot?.spotifyUrl);
    if (!spotifyUrl) return;

    try {
      await Linking.openURL(spotifyUrl);
    } catch {
      Alert.alert("Unable to open Spotify", "Canal could not open this track.");
    }
  }

  function confirmDelete() {
    if (!snapshot) {
      return;
    }

    Alert.alert(
      "Delete this Snapshot?",
      "This removes the Snapshot from your device and Soundscape.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void handleDelete();
          },
        },
      ],
    );
  }

  async function handleDelete() {
    if (!snapshot) {
      return;
    }

    try {
      setActiveAction(
        "delete",
      );

      const result =
        await deleteSnapshotWithStatus(
        snapshot.id,
      );

      if (soundscape) {
        await saveSoundscape({
          ...soundscape,

          snapshotIds:
            soundscape.snapshotIds.filter(
              (id) =>
                id !==
                snapshot.id,
            ),
        });
      }

      if (result.warning) {
        Alert.alert(
          "Deleted on this device",
          result.warning,
        );
      }

      router.replace(
        "/snapshots",
      );
    } catch (error) {
      console.error(
        "Unable to delete Snapshot:",
        error,
      );

      Alert.alert(
        "Unable to delete",
        error instanceof Error
          ? error.message
          : "Canal could not delete this Snapshot.",
      );
    } finally {
      setActiveAction("");
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

  if (!snapshot) {
    if (loadIssue) {
      return (
        <SafeAreaView
          style={styles.screen}
        >
          <View
            style={styles.centered}
          >
            <View
              style={styles.recovery}
            >
              <RecoveryNotice
                issue={
                  loadIssue
                }
                onAction={
                  recoverSnapshot
                }
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={
                closeSnapshot
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.recoveryReturnButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Return to Snapshots
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
        <View
          style={styles.centered}
        >
          <Ionicons
            name="camera-outline"
            size={42}
            color={canalDynamicColors.gold}
          />

          <Text
            style={
              styles.notFoundTitle
            }
          >
            Snapshot not found
          </Text>

          <Text
            selectable
            style={
              styles.notFoundText
            }
          >
            It may have been deleted
            from this device.
          </Text>

          <Pressable
            accessibilityLabel="Share Snapshot"
            accessibilityRole="button"
            onPress={
              closeSnapshot
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
              Return to Snapshots
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canEdit =
    snapshot.isMine !==
    false;

  const hasUnsavedChanges =
    note.trim() !==
      snapshot.note ||
    mood.trim() !==
      (snapshot.mood ?? "");

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
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
            accessibilityLabel="Go back"
            onPress={
              closeSnapshot
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.backText}
            >
              ‹ Snapshots
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Snapshot
          </Text>

          {canEdit ? (
            <Pressable
              accessibilityLabel="Manage Snapshot"
              accessibilityHint="Shows edit, visibility, and delete options"
              accessibilityRole="button"
              accessibilityState={{ expanded: showManagement }}
              onPress={() => setShowManagement(true)}
              style={({ pressed }) => [styles.headerMenuButton, pressed && styles.pressed]}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={canalDynamicColors.text} />
            </Pressable>
          ) : <View style={styles.headerMenuButton} />}
        </View>

        <View pointerEvents="none" style={styles.exportSurface}>
          <SnapshotComposition
            exportBrand
            snapshot={snapshot}
            ref={compositionRef}
            overlayRef={overlayRef}
            height={500}
          />
        </View>

        <SnapshotComposition snapshot={snapshot} height={500} playVideo />

        <View style={styles.socialBar}>
          <Pressable
            accessibilityLabel={social.summary.likedByMe ? "Unlike Snapshot" : "Like Snapshot"}
            accessibilityRole="button"
            accessibilityState={{ selected: social.summary.likedByMe, busy: socialAction === "snapshot-like" }}
            onPress={() => { void toggleLike(); }}
            style={({ pressed }) => [styles.socialActionButton, pressed && styles.pressed]}
          >
            <Ionicons
              name={social.summary.likedByMe ? "heart" : "heart-outline"}
              size={24}
              color={social.summary.likedByMe ? "#ff667a" : canalDynamicColors.text}
            />
            <Text style={styles.socialActionCount}>{social.summary.likeCount}</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={`${social.summary.commentCount} comments`}
            accessibilityHint={showConversation ? "Hides the Snapshot conversation" : "Shows the Snapshot conversation"}
            accessibilityRole="button"
            accessibilityState={{ expanded: showConversation }}
            onPress={() => setShowConversation((value) => !value)}
            style={({ pressed }) => [styles.socialActionButton, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubble-outline" size={22} color={canalDynamicColors.text} />
            <Text style={styles.socialActionCount}>{social.summary.commentCount}</Text>
          </Pressable>

          {canonicalSpotifyTrackUrl(snapshot.spotifyUrl) ? (
            <Pressable
              accessibilityLabel="Open captured track in Spotify"
              accessibilityRole="link"
              onPress={() => { void openSpotify(); }}
              style={({ pressed }) => [styles.socialActionButton, pressed && styles.pressed]}
            >
              <Ionicons name="musical-notes-outline" size={22} color={canalDynamicColors.text} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="Share Snapshot"
            accessibilityRole="button"
            onPress={() => { void handleShare(); }}
            style={({ pressed }) => [styles.socialActionButton, styles.shareSocialAction, pressed && styles.pressed]}
          >
            <Ionicons name="paper-plane-outline" size={22} color={canalDynamicColors.text} />
          </Pressable>
        </View>

        <View style={styles.captionBlock}>
          <Text style={styles.captionText}>
            <Text style={styles.captionAuthor}>{snapshot.isMine === false ? "Canal creator" : "You"} </Text>
            {snapshot.note || snapshot.sceneName}
          </Text>
          <Text style={styles.captionMeta}>
            {[snapshot.mood, formatSnapshotDate(snapshot.createdAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>

        {cloudWarning ? (
          <View
            accessibilityRole="alert"
            style={styles.syncWarning}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={canalDynamicColors.gold}
            />

            <View
              style={styles.syncWarningCopy}
            >
              <Text
                style={styles.syncWarningTitle}
              >
                Cloud sync needs attention
              </Text>

              <Text
                style={styles.syncWarningText}
              >
                {cloudWarning}
              </Text>
            </View>
          </View>
        ) : null}

        {showConversation ? <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Conversation</Text>
          {socialLoading ? <ActivityIndicator color="#ff7a1a" /> : null}
          {!socialLoading && social.comments.length === 0 ? (
            <Text style={styles.emptyComments}>Start the conversation around this moment.</Text>
          ) : null}
          {social.comments.map((comment) => (
            <View key={comment.id} style={[styles.commentRow, comment.parentCommentId && styles.replyRow]}>
              <ProfileAvatar
                avatarUrl={comment.avatarUrl}
                displayName={comment.displayName || comment.handle || "Canal listener"}
                size={36}
              />
              <View style={styles.commentContent}>
                <Text style={styles.commentName}>{comment.displayName || comment.handle || "Canal listener"}</Text>
                <Text style={styles.commentBody}>{comment.body}</Text>
                <View style={styles.commentActions}>
                  <Pressable
                    accessibilityLabel={comment.likedByMe ? "Unlike comment" : "Like comment"}
                    accessibilityRole="button"
                    onPress={() => { void toggleCommentLike(comment); }}
                    style={({ pressed }) => [styles.commentAction, pressed && styles.pressed]}
                  >
                    <Ionicons name={comment.likedByMe ? "heart" : "heart-outline"} size={16} color={comment.likedByMe ? "#ff667a" : canalDynamicColors.muted} />
                    <Text style={styles.commentActionText}>{comment.likeCount || "Like"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Reply to ${comment.displayName || comment.handle || "comment"}`}
                    accessibilityRole="button"
                    onPress={() => setReplyingTo(comment)}
                    style={({ pressed }) => [styles.commentAction, pressed && styles.pressed]}
                  >
                    <Text style={styles.commentActionText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {replyingTo ? (
            <View style={styles.replyTarget}>
              <Text style={styles.replyTargetText}>Replying to {replyingTo.displayName || replyingTo.handle || "comment"}</Text>
              <Pressable accessibilityLabel="Cancel reply" accessibilityRole="button" onPress={() => setReplyingTo(null)} style={styles.replyCancel}>
                <Ionicons name="close" size={18} color={canalDynamicColors.text} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.commentComposer}>
            <TextInput
              accessibilityLabel={replyingTo ? "Write a reply" : "Write a comment"}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyingTo ? "Write a reply…" : "Add a comment…"}
              placeholderTextColor={canalDynamicColors.muted}
              maxLength={500}
              multiline
              style={styles.commentInput}
            />
            <Pressable
              accessibilityLabel={replyingTo ? "Post reply" : "Post comment"}
              accessibilityRole="button"
              accessibilityState={{ disabled: !commentText.trim() || socialAction === "comment", busy: socialAction === "comment" }}
              disabled={!commentText.trim() || socialAction === "comment"}
              onPress={() => { void submitComment(); }}
              style={({ pressed }) => [styles.postCommentButton, (!commentText.trim() || socialAction === "comment") && styles.disabled, pressed && styles.pressed]}
            >
              {socialAction === "comment" ? <ActivityIndicator color={canalDynamicColors.text} /> : <Ionicons name="arrow-up" size={20} color={canalDynamicColors.text} />}
            </Pressable>
          </View>
        </View> : null}

        {canEdit && showManagement ? (
          <Modal
            animationType="slide"
            transparent
            visible
            onRequestClose={() => setShowManagement(false)}
          >
            <Pressable
              onPress={() => setShowManagement(false)}
              style={styles.managementBackdrop}
            >
              <Pressable
                accessibilityRole="none"
                onPress={(event) => event.stopPropagation()}
                style={styles.managementSheet}
              >
                <View style={styles.managementHeader}>
                  <View>
                    <Text style={styles.managementEyebrow}>SNAPSHOT OPTIONS</Text>
                    <Text style={styles.managementTitle}>Edit your moment</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Close Snapshot options"
                    accessibilityRole="button"
                    onPress={() => setShowManagement(false)}
                    style={styles.managementClose}
                  >
                    <Ionicons name="close" size={21} color={canalDynamicColors.text} />
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={styles.managementContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >

        <View
          style={
            styles.visibilityCard
          }
        >
          <View
            style={
              styles.visibilityCopy
            }
          >
            <Text
              style={
                styles.visibilityTitle
              }
            >
              Public Snapshot
            </Text>

            <Text
              style={
                styles.visibilityText
              }
            >
              Public Snapshots may be
              shared outside your
              Soundscape.
            </Text>
          </View>

          {activeAction ===
          "visibility" ? (
            <ActivityIndicator
              color="#ff7a1a"
            />
          ) : (
            <Switch
              disabled={!canEdit}
              value={
                snapshot.visibility ===
                "public"
              }
              onValueChange={(value) => {
                void toggleVisibility(
                  value,
                );
              }}
              trackColor={{
                false: "#3c4540",
                true: "#ff7a1a",
              }}
              thumbColor="#ffffff"
            />
          )}
        </View>

        <View style={styles.formCard}>
          <View style={styles.field}>
            <Text
              style={styles.label}
            >
              Mood
            </Text>

            <TextInput
              editable={canEdit}
              value={mood}
              onChangeText={setMood}
              placeholder="Calm · reflective"
              placeholderTextColor={canalDynamicColors.muted}
              maxLength={120}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text
              style={styles.label}
            >
              Note
            </Text>

            <TextInput
              editable={canEdit}
              value={note}
              onChangeText={setNote}
              placeholder="Why did this moment matter?"
              placeholderTextColor={canalDynamicColors.muted}
              multiline
              textAlignVertical="top"
              maxLength={500}
              style={[
                styles.input,
                styles.noteInput,
              ]}
            />

            <Text
              style={styles.counter}
            >
              {note.length}/500
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Save Snapshot changes"
            accessibilityRole="button"
            accessibilityState={{
              busy: activeAction === "save",
              disabled: !hasUnsavedChanges || !canEdit || activeAction === "save",
            }}
            disabled={
              !hasUnsavedChanges ||
              !canEdit ||
              activeAction ===
                "save"
            }
            onPress={() => {
              void saveChanges();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              (!hasUnsavedChanges ||
                !canEdit ||
                activeAction ===
                  "save") &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {activeAction ===
            "save" ? (
              <ActivityIndicator
                color="#17110c"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Save Changes
              </Text>
            )}
          </Pressable>
        </View>

        <View accessibilityLabel="Saved to your Soundscape" style={[styles.soundscapeButton, styles.onSoundscapeButton]}>
          <Ionicons name="checkmark-circle" size={21} color="#9ff3b5" />
          <Text style={[styles.soundscapeButtonText, styles.onSoundscapeButtonText]}>
            Saved to your Soundscape
          </Text>
        </View>

          <Pressable
          accessibilityLabel="Share Snapshot"
          accessibilityRole="button"
          onPress={() => {
            void handleShare();
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
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
            style={
              styles.secondaryButtonText
            }
          >
            Share Snapshot
          </Text>
        </Pressable>

        {canEdit ? (
          <Pressable
            accessibilityLabel="Delete Snapshot"
            accessibilityRole="button"
            accessibilityState={{
              busy: activeAction === "delete",
              disabled: activeAction === "delete",
            }}
            disabled={
              activeAction ===
              "delete"
            }
            onPress={
              confirmDelete
            }
            style={({ pressed }) => [
              styles.deleteButton,
              activeAction ===
                "delete" &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {activeAction ===
            "delete" ? (
              <ActivityIndicator
                color="#ff9187"
              />
            ) : (
              <Text
                style={
                  styles.deleteButtonText
                }
              >
                Delete Snapshot
              </Text>
            )}
          </Pressable>
        ) : null}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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

function formatSnapshotDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return date.toLocaleString(
    undefined,
    {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

const styles = StyleSheet.create({
  exportSurface: {
    position: "absolute",
    left: -10_000,
    top: 0,
    width: 420,
  },

  screen: {
    flex: 1,
    backgroundColor: "#161513",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 27,
  },

  notFoundTitle: {
    color: canalDynamicColors.text,
    fontSize: 24,
    fontWeight: "700",
  },

  notFoundText: {
    color: canalDynamicColors.muted,
    fontSize: 14,
    textAlign: "center",
  },

  recovery: {
    width: "100%",
    maxWidth: 520,
  },

  recoveryReturnButton: {
    width: "100%",
    maxWidth: 520,
  },

  page: {
    paddingHorizontal: 23,
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
    width: 91,
    minHeight: 48,
    justifyContent: "center",
  },

  backText: {
    color: canalDynamicColors.muted,
    fontSize: 14,
    fontWeight: "600",
  },

  headerTitle: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 22,
    fontWeight: "400",
  },

  headerAction: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  headerMenuButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },

  socialBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  socialActionButton: {
    minWidth: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  socialActionCount: {
    color: canalDynamicColors.text,
    fontSize: 13,
    fontWeight: "700",
  },

  shareSocialAction: {
    marginLeft: "auto",
  },

  captionBlock: {
    gap: 5,
    marginTop: -14,
  },

  captionText: {
    color: canalDynamicColors.text,
    fontSize: 14,
    lineHeight: 20,
  },

  captionAuthor: {
    fontWeight: "800",
  },

  captionMeta: {
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  commentsSection: {
    gap: 12,
    marginTop: 4,
    padding: 15,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 22,
    backgroundColor: "rgba(7, 43, 63, 0.34)",
  },

  commentsTitle: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 21,
  },

  emptyComments: {
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },

  commentRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: canalDynamicColors.line,
  },

  replyRow: {
    marginLeft: 34,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: canalDynamicColors.line,
  },

  commentAvatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: canalDynamicColors.elevated,
  },

  commentAvatarText: {
    color: canalDynamicColors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  commentContent: {
    flex: 1,
    gap: 3,
  },

  commentName: {
    color: canalDynamicColors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  commentBody: {
    color: canalDynamicColors.text,
    fontSize: 13,
    lineHeight: 19,
  },

  commentActions: {
    flexDirection: "row",
    gap: 6,
  },

  commentAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
  },

  commentActionText: {
    color: canalDynamicColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  replyTarget: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderRadius: 12,
    backgroundColor: canalDynamicColors.elevated,
  },

  replyTargetText: {
    flex: 1,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  replyCancel: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  commentComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },

  commentInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 18,
    backgroundColor: canalDynamicColors.elevated,
    color: canalDynamicColors.text,
    fontSize: 13,
  },

  postCommentButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: canalDynamicColors.mint,
  },

  manageButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 16,
    backgroundColor: canalDynamicColors.elevated,
  },

  manageButtonText: {
    flex: 1,
    color: canalDynamicColors.text,
    fontSize: 13,
    fontWeight: "800",
  },

  managementBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(2, 12, 18, 0.58)",
  },

  managementSheet: {
    maxHeight: "86%",
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    backgroundColor: canalDynamicColors.surface,
  },

  managementHeader: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: canalDynamicColors.line,
  },

  managementEyebrow: {
    color: canalDynamicColors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  managementTitle: {
    marginTop: 3,
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 20,
  },

  managementClose: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },

  managementContent: {
    padding: 16,
    paddingBottom: 30,
    gap: 16,
  },

  hero: {
    alignItems: "center",
  },

  snapshotArtwork: {
    width: 146,
    height: 146,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 42,
    backgroundColor: "#2b1d14",
  },

  artworkBrand: {
    position: "absolute",
    left: 13,
    right: 13,
    bottom: 13,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
    textTransform: "uppercase",
  },

  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#2d332f",
  },

  publicBadge: {
    backgroundColor: "#1d5b32",
  },

  visibilityBadgeText: {
    color: "#c5cbc6",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  heading: {
    marginTop: 10,
    color: canalDynamicColors.text,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },

  dateText: {
    marginTop: 7,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  templateProvenance: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#343A36",
    borderRadius: 18,
    borderCurve:
      "continuous",
    backgroundColor: "#171B18",
    padding: 13,
  },

  templateProvenanceMark: {
    width: 8,
    alignSelf: "stretch",
    borderRadius: 4,
  },

  templateProvenanceCopy: {
    flex: 1,
    gap: 3,
  },

  templateProvenanceLabel: {
    color: canalDynamicColors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  templateProvenanceName: {
    color: canalDynamicColors.text,
    fontSize: 15,
    fontWeight: "900",
  },

  syncWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: "#6d472c",
    borderRadius: 18,
    backgroundColor: "#241a13",
  },

  syncWarningCopy: {
    flex: 1,
  },

  syncWarningTitle: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  syncWarningText: {
    marginTop: 4,
    color: "#d5c1b2",
    fontSize: 11,
    lineHeight: 17,
  },

  readOnlyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2d6540",
    borderRadius: 18,
    backgroundColor: "#14251a",
  },

  readOnlyText: {
    flex: 1,
    color: canalDynamicColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  trackCard: {
    minHeight: 91,
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 20,
    backgroundColor: canalDynamicColors.surface,
  },

  trackIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: "#2b1d14",
  },

  trackCopy: {
    flex: 1,
  },

  trackLabel: {
    color: canalDynamicColors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  trackTitle: {
    marginTop: 5,
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  trackArtist: {
    marginTop: 4,
    color: "#aeb6b0",
    fontSize: 12,
  },

  spotifyButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#1ed760",
  },

  spotifyButtonText: {
    color: "#07130b",
    fontSize: 12,
    fontWeight: "900",
  },

  visibilityCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 19,
    backgroundColor: canalDynamicColors.surface,
  },

  visibilityCopy: {
    flex: 1,
    paddingRight: 12,
  },

  visibilityTitle: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  visibilityText: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  formCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  field: {
    gap: 9,
  },

  label: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  input: {
    minHeight: 53,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 15,
    backgroundColor: "#111613",
    color: canalDynamicColors.text,
    fontSize: 14,
  },

  noteInput: {
    minHeight: 115,
    paddingTop: 14,
    paddingBottom: 14,
  },

  counter: {
    color: "#777f79",
    fontSize: 10,
    textAlign: "right",
  },

  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  soundscapeButton: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 16,
    backgroundColor: "#211810",
  },

  onSoundscapeButton: {
    borderColor: "#31523a",
    backgroundColor: "#142119",
  },

  soundscapeButtonText: {
    color: canalDynamicColors.gold,
    fontSize: 13,
    fontWeight: "700",
  },

  onSoundscapeButtonText: {
    color: canalDynamicColors.mint,
  },

  secondaryButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 16,
    backgroundColor: canalDynamicColors.surface,
  },

  secondaryButtonText: {
    color: canalDynamicColors.gold,
    fontSize: 13,
    fontWeight: "700",
  },

  deleteButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4f302d",
    borderRadius: 16,
    backgroundColor: "#1d1514",
  },

  deleteButtonText: {
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
