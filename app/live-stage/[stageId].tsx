import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  Stack,
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
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";
import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import {
  shareStageInvite,
} from "../../lib/canal-invites";
import {
  advanceLiveStageTrack,
  endLiveStage,
  getCurrentLiveStageTrack,
  getLiveStageTrackImageUrl,
  getLiveStageTrackSpotifyUrl,
  joinLiveStage,
  joinLiveStageByCode,
  leaveLiveStage,
  LiveStage,
  LiveStageMessage,
  LiveStageSubscriptionStatus,
  readLiveStageRoom,
  sendLiveStageMessage,
  subscribeToLiveStage,
} from "../../lib/live-stages";
import {
  createSnapshot,
} from "../../lib/snapshots";
import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";
import {
  useAuth,
} from "../../providers/auth-provider";
import {
  useConnectivity,
} from "../../providers/connectivity-provider";

function getStageKind(
  stage: LiveStage,
): LiveStage["stageKind"] {
  return stage.stageKind;
}

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(
    value,
  )
    ? value[0] ?? ""
    : value ?? "";
}

function chatTime(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

function MessageRow(
  props: {
    message:
      LiveStageMessage;
  },
) {
  return (
    <View
      style={[
        styles.messageRow,
        props.message
          .isMine &&
          styles.messageRowMine,
      ]}
    >
      {!props.message
        .isMine ? (
        <View
          style={
            styles.messageAvatar
          }
        >
          <Text
            style={
              styles.messageInitials
            }
          >
            {
              props.message
                .initials
            }
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.messageContent,
          props.message
            .isMine &&
            styles.messageContentMine,
        ]}
      >
        {!props.message
          .isMine ? (
          <View
            style={
              styles.messageMeta
            }
          >
            <Text
              numberOfLines={1}
              style={
                styles.messageAuthor
              }
            >
              {
                props.message
                  .displayName
              }
            </Text>

            <Text
              style={
                styles.messageTime
              }
            >
              {chatTime(
                props.message
                  .createdAt,
              )}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.messageBubble,
            props.message
              .isMine &&
              styles.messageBubbleMine,
          ]}
        >
          <Text
            selectable
            style={[
              styles.messageBody,
              props.message
                .isMine &&
                styles.messageBodyMine,
            ]}
          >
            {
              props.message
                .body
            }
          </Text>
        </View>

        {props.message
          .isMine ? (
          <Text
            style={
              styles.messageTimeMine
            }
          >
            {chatTime(
              props.message
                .createdAt,
            )}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function LiveStageScreen() {
  const {
    configured,
    profile,
    user,
  } = useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } = useConnectivity();

  const params =
    useLocalSearchParams<{
      stageId?:
        | string
        | string[];
      code?:
        | string
        | string[];
    }>();

  const stageId =
    firstParam(
      params.stageId,
    );

  const inviteCode =
    firstParam(
      params.code,
    );

  const accountKey =
    user?.id ??
    (
      configured
        ? "configured:signed-out"
        : `local:${profile?.createdAt ?? "default"}:${profile?.handle ?? ""}`
    );

  const roomKey = [
    accountKey,
    stageId,
    inviteCode,
  ].join(
    "\u0000",
  );

  const insets =
    useSafeAreaInsets();

  const listRef =
    useRef<
      FlatList<LiveStageMessage>
    >(null);

  const roomKeyRef =
    useRef(
      roomKey,
    );

  const roomRequestIdRef =
    useRef(0);

  const focusedRef =
    useRef(false);

  const roomCacheRef =
    useRef<{
      roomKey: string;
      stage: LiveStage | null;
    }>({
      roomKey: "",
      stage: null,
    });

  const updatingRef =
    useRef(false);

  const updateOperationIdRef =
    useRef(0);

  const sendingRef =
    useRef(false);

  const sendOperationIdRef =
    useRef(0);

  const snapshotRef =
    useRef(false);

  const snapshotOperationIdRef =
    useRef(0);

  roomKeyRef.current =
    roomKey;

  const [
    storedStage,
    setStage,
  ] = useState<
    LiveStage | null
  >(null);

  const [
    storedMessages,
    setMessages,
  ] = useState<
    LiveStageMessage[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    updating,
    setUpdating,
  ] = useState(false);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    capturingSnapshot,
    setCapturingSnapshot,
  ] = useState(false);

  const [
    messageBody,
    setMessageBody,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    realtimeStatus,
    setRealtimeStatus,
  ] =
    useState<LiveStageSubscriptionStatus>(
      "connecting",
    );

  const [
    newSnapshotId,
    setNewSnapshotId,
  ] = useState("");

  const [
    committedRoomKey,
    setCommittedRoomKey,
  ] = useState("");

  const [
    subscriptionRetryEpoch,
    setSubscriptionRetryEpoch,
  ] = useState(0);

  const stage =
    committedRoomKey ===
    roomKey
      ? storedStage
      : null;

  const messages =
    committedRoomKey ===
    roomKey
      ? storedMessages
      : [];

  const loadRoom =
    useCallback(
      async (
        showLoading =
          false,
      ) => {
        if (!focusedRef.current) {
          return;
        }

        const requestId =
          roomRequestIdRef
            .current +
          1;

        roomRequestIdRef.current =
          requestId;

        const requestedRoomKey =
          roomKey;

        const hasCachedStage =
          roomCacheRef.current
            .roomKey ===
            requestedRoomKey &&
          Boolean(
            roomCacheRef.current
              .stage,
          );

        if (
          showLoading &&
          !hasCachedStage
        ) {
          setLoading(
            true,
          );
        }

        try {
          let room =
            await readLiveStageRoom(
              stageId,
            );

          if (
            requestId !==
              roomRequestIdRef
                .current ||
            requestedRoomKey !==
              roomKeyRef.current ||
            !focusedRef.current
          ) {
            return;
          }

          if (
            !room.stage &&
            inviteCode
          ) {
            const joined =
              await joinLiveStageByCode(
                inviteCode,
                stageId,
              );

            if (joined) {
              if (
                joined.id !==
                stageId
              ) {
                throw new Error(
                  "This Stage invitation does not match the room link. Ask the host for a new invitation.",
                );
              }

              room =
                await readLiveStageRoom(
                  joined.id,
                );
            }
          }

          if (
            requestId !==
              roomRequestIdRef
                .current ||
            requestedRoomKey !==
              roomKeyRef.current ||
            !focusedRef.current
          ) {
            return;
          }

          roomCacheRef.current = {
            roomKey:
              requestedRoomKey,
            stage:
              room.stage,
          };

          setStage(
            room.stage,
          );
          setMessages(
            room.messages,
          );
          setCommittedRoomKey(
            requestedRoomKey,
          );
          setError("");
        } catch (
          loadError
        ) {
          if (
            requestId !==
              roomRequestIdRef
                .current ||
            requestedRoomKey !==
              roomKeyRef.current ||
            !focusedRef.current
          ) {
            return;
          }

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Canal could not load this Stage.",
          );
        } finally {
          if (
            requestId !==
              roomRequestIdRef
                .current ||
            requestedRoomKey !==
              roomKeyRef.current ||
            !focusedRef.current
          ) {
            return;
          }

          setLoading(
            false,
          );
        }
      },
      [
        inviteCode,
        roomKey,
        stageId,
      ],
    );

  useEffect(() => {
    roomRequestIdRef.current +=
      1;
    updateOperationIdRef
      .current +=
      1;
    sendOperationIdRef
      .current +=
      1;
    snapshotOperationIdRef
      .current +=
      1;

    updatingRef.current =
      false;
    sendingRef.current =
      false;
    snapshotRef.current =
      false;

    setUpdating(
      false,
    );
    setSending(
      false,
    );
    setCapturingSnapshot(
      false,
    );
    setLoading(
      true,
    );
    setError("");
    setMessageBody("");
    setNewSnapshotId("");
    setRealtimeStatus(
      "connecting",
    );
  }, [
    roomKey,
  ]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current =
        true;
      void loadRoom(true);

      return () => {
        focusedRef.current =
          false;
        roomRequestIdRef
          .current +=
          1;
      };
    }, [
      loadRoom,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!stage?.id) {
        return;
      }

      if (
        subscriptionRetryEpoch >
        0
      ) {
        setRealtimeStatus(
          "connecting",
        );
      }

      const subscriptionRoomKey =
        roomKey;

      return subscribeToLiveStage(
        stage.id,
        () => {
          void loadRoom();
        },
        (status) => {
          if (
            focusedRef.current &&
            roomKeyRef.current ===
              subscriptionRoomKey
          ) {
            setRealtimeStatus(
              status,
            );
          }
        },
      );
    }, [
      loadRoom,
      roomKey,
      stage?.id,
      subscriptionRetryEpoch,
    ]),
  );

  const reloadAfterReconnect =
    useCallback(
      async (): Promise<void> => {
        setSubscriptionRetryEpoch(
          (current) =>
            current + 1,
        );
        await loadRoom();
      },
      [
        loadRoom,
      ],
    );

  useReconnectReload(
    reloadAfterReconnect,
  );

  const currentTrack =
    useMemo(
      () =>
        stage
          ? getCurrentLiveStageTrack(
              stage,
            )
          : null,
      [stage],
    );

  const currentTrackSpotifyUrl =
    useMemo(
      () =>
        getLiveStageTrackSpotifyUrl(
          currentTrack,
        ),
      [currentTrack],
    );

  const currentTrackImageUrl =
    useMemo(
      () =>
        getLiveStageTrackImageUrl(
          currentTrack,
        ),
      [currentTrack],
    );

  const stageKind =
    stage
      ? getStageKind(
          stage,
        )
      : "community";

  const provenanceLabel =
    stageKind ===
    "canal"
      ? "Canal original"
      : stageKind ===
          "verified"
        ? "Verified creator"
        : "Community host";

  const provenanceCopy =
    stageKind ===
    "canal"
      ? "Produced by Canal."
      : stageKind ===
          "verified"
        ? "Hosted by a verified Canal creator."
        : "Hosted by a member of the Canal community.";

  const isHost =
    stage?.membershipRole ===
    "host";

  const isMember =
    Boolean(
      stage?.membershipRole,
    );

  const isEnded =
    stage?.status ===
    "ended";

  const cloudIsOffline =
    configured &&
    connectivityStatus ===
      "offline";

  async function joinStage() {
    if (
      !stage ||
      updatingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    updatingRef.current =
      true;

    const operationId =
      updateOperationIdRef
        .current +
      1;

    updateOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setUpdating(
        true,
      );
      setError("");

      const updated =
        await joinLiveStage(
          stage.id,
        );

      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      if (updated) {
        roomCacheRef.current = {
          roomKey:
            operationRoomKey,
          stage:
            updated,
        };
        setStage(
          updated,
        );
      }

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .notificationAsync(
            Haptics
              .NotificationFeedbackType
              .Success,
          );
      }

      await loadRoom();
    } catch (
      joinError
    ) {
      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        joinError instanceof
          Error
          ? joinError.message
          : "Canal could not join this Stage.",
      );
    } finally {
      if (
        operationId !==
          updateOperationIdRef
            .current
      ) {
        return;
      }

      updatingRef.current =
        false;
      setUpdating(
        false,
      );
    }
  }

  async function leaveStage() {
    if (
      !stage ||
      updatingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    updatingRef.current =
      true;

    const operationId =
      updateOperationIdRef
        .current +
      1;

    updateOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setUpdating(
        true,
      );

      await leaveLiveStage(
        stage,
      );

      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      router.replace(
        "/(tabs)/live",
      );
    } catch (
      leaveError
    ) {
      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        leaveError instanceof
          Error
          ? leaveError.message
          : "Canal could not leave this Stage.",
      );
    } finally {
      if (
        operationId !==
          updateOperationIdRef
            .current
      ) {
        return;
      }

      updatingRef.current =
        false;
      setUpdating(
        false,
      );
    }
  }

  async function advanceTrack() {
    if (
      !stage ||
      updatingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    updatingRef.current =
      true;

    const operationId =
      updateOperationIdRef
        .current +
      1;

    updateOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setUpdating(
        true,
      );

      const updated =
        await advanceLiveStageTrack(
          stage,
        );

      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      if (updated) {
        roomCacheRef.current = {
          roomKey:
            operationRoomKey,
          stage:
            updated,
        };
        setStage(
          updated,
        );
      }

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .impactAsync(
            Haptics
              .ImpactFeedbackStyle
              .Light,
          );
      }
    } catch (
      updateError
    ) {
      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        updateError instanceof
          Error
          ? updateError.message
          : "Canal could not advance the Stage.",
      );
    } finally {
      if (
        operationId !==
          updateOperationIdRef
            .current
      ) {
        return;
      }

      updatingRef.current =
        false;
      setUpdating(
        false,
      );
    }
  }

  function confirmEndStage() {
    if (
      updatingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    Alert.alert(
      "End this Stage?",
      "The queue and chat will become read-only for everyone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "End Stage",
          style:
            "destructive",
          onPress: () => {
            void finishStage();
          },
        },
      ],
    );
  }

  async function finishStage() {
    if (
      !stage ||
      updatingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    updatingRef.current =
      true;

    const operationId =
      updateOperationIdRef
        .current +
      1;

    updateOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setUpdating(
        true,
      );

      const updated =
        await endLiveStage(
          stage,
        );

      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      if (updated) {
        roomCacheRef.current = {
          roomKey:
            operationRoomKey,
          stage:
            updated,
        };
        setStage(
          updated,
        );
      }

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .notificationAsync(
            Haptics
              .NotificationFeedbackType
              .Success,
          );
      }
    } catch (
      endError
    ) {
      if (
        operationId !==
          updateOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        endError instanceof
          Error
          ? endError.message
          : "Canal could not end this Stage.",
      );
    } finally {
      if (
        operationId !==
          updateOperationIdRef
            .current
      ) {
        return;
      }

      updatingRef.current =
        false;
      setUpdating(
        false,
      );
    }
  }

  async function sendMessage() {
    if (
      !stage ||
      !messageBody.trim() ||
      sendingRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    sendingRef.current =
      true;

    const operationId =
      sendOperationIdRef
        .current +
      1;

    sendOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    const submittedBody =
      messageBody;

    try {
      setSending(
        true,
      );
      setError("");

      const message =
        await sendLiveStageMessage(
          stage.id,
          submittedBody,
        );

      if (
        operationId !==
          sendOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setMessages(
        (current) =>
          current.some(
            (item) =>
              item.id ===
              message.id,
          )
            ? current
            : [
                ...current,
                message,
              ],
      );
      setMessageBody(
        (current) =>
          current ===
          submittedBody
            ? ""
            : current,
      );
      requestAnimationFrame(
        () => {
          listRef.current
            ?.scrollToEnd({
              animated: true,
            });
        },
      );

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .selectionAsync();
      }
    } catch (
      sendError
    ) {
      if (
        operationId !==
          sendOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        sendError instanceof
          Error
          ? sendError.message
          : "Canal could not send this message.",
      );
    } finally {
      if (
        operationId !==
          sendOperationIdRef
            .current
      ) {
        return;
      }

      sendingRef.current =
        false;
      setSending(
        false,
      );
    }
  }

  async function shareStage() {
    if (!stage) {
      return;
    }

    try {
      await shareStageInvite(
        stage,
      );
    } catch (
      shareError
    ) {
      setError(
        shareError instanceof
          Error
          ? shareError.message
          : "Canal could not share this Stage.",
      );
    }
  }

  async function captureSnapshot() {
    if (
      !stage ||
      snapshotRef.current
    ) {
      return;
    }

    snapshotRef.current =
      true;

    const operationId =
      snapshotOperationIdRef
        .current +
      1;

    snapshotOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setCapturingSnapshot(
        true,
      );

      const snapshot =
        await createSnapshot({
          sceneId:
            stage.sceneId ??
            `stage-${stage.id}`,
          sceneName:
            stage.name,
          trackId:
            currentTrack?.id,
          trackTitle:
            currentTrack?.title,
          trackArtist:
            currentTrack?.artist,
          spotifyUrl:
            currentTrackSpotifyUrl ??
            undefined,
          positionMs: 0,
          note:
            "Captured during a live Canal Stage.",
          mood:
            stage.activity,
          visibility:
            stage.visibility,
        });

      if (
        operationId !==
          snapshotOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setNewSnapshotId(
        snapshot.id,
      );

      Alert.alert(
        "Snapshot captured",
        "This live moment is now in your Snapshots.",
      );
    } catch (
      snapshotError
    ) {
      if (
        operationId !==
          snapshotOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        snapshotError instanceof
          Error
          ? snapshotError.message
          : "Canal could not capture this moment.",
      );
    } finally {
      if (
        operationId !==
          snapshotOperationIdRef
            .current
      ) {
        return;
      }

      snapshotRef.current =
        false;
      setCapturingSnapshot(
        false,
      );
    }
  }

  async function openCurrentTrack() {
    if (
      !currentTrackSpotifyUrl
    ) {
      return;
    }

    try {
      await Linking.openURL(
        currentTrackSpotifyUrl,
      );
    } catch {
      setError(
        "Canal could not open this track in Spotify.",
      );
    }
  }

  const recoveryIssue =
    useMemo(
      () => {
        if (error) {
          return classifyRecoveryIssue(
            error,
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        if (
          configured &&
          connectivityStatus ===
          "offline"
        ) {
          return classifyRecoveryIssue(
            new Error(
              "This Stage is offline.",
            ),
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        if (
          realtimeStatus ===
          "error"
        ) {
          return classifyRecoveryIssue(
            new Error(
              "Canal Live lost its realtime connection.",
            ),
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        return null;
      },
      [
        configured,
        connectivityStatus,
        error,
        realtimeStatus,
      ],
    );

  const recoverRoom =
    useCallback(
      async (): Promise<void> => {
        if (
          recoveryIssue
            ?.action ===
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
          setSubscriptionRetryEpoch(
            (current) =>
              current + 1,
          );
          await loadRoom(true);
        }
      },
      [
        loadRoom,
        recoveryIssue,
        refreshConnectivity,
      ],
    );

  const header =
    stage ? (
      <View
        style={
          styles.roomHeader
        }
      >
        <View
          style={
            styles.stageIdentity
          }
        >
          <View
            style={
              styles.stageStatusRow
            }
          >
            <View
              style={[
                styles.statusPill,
                isEnded &&
                  styles.statusPillEnded,
              ]}
            >
              <View
                style={[
                  styles.liveDot,
                  isEnded &&
                    styles.liveDotEnded,
                ]}
              />

              <Text
                style={[
                  styles.statusPillText,
                  isEnded &&
                    styles.statusPillTextEnded,
                ]}
              >
                {isEnded
                  ? "ENDED"
                  : "LIVE"}
              </Text>
            </View>

            <View
              style={
                styles.realtimeStatus
              }
            >
              <View
                style={[
                  styles.realtimeDot,
                  realtimeStatus ===
                    "connected" &&
                    styles.realtimeDotConnected,
                  realtimeStatus ===
                    "error" &&
                    styles.realtimeDotError,
                ]}
              />

              <Text
                style={
                  styles.realtimeText
                }
              >
                {realtimeStatus ===
                "connected"
                  ? "Synced"
                  : realtimeStatus ===
                      "error"
                    ? "Reconnecting"
                    : "Connecting"}
              </Text>
            </View>
          </View>

          <Text
            selectable
            style={
              styles.stageName
            }
          >
            {stage.name}
          </Text>

          <Text
            selectable
            style={
              styles.stageMeta
            }
          >
            Hosted by @
            {stage.hostUsername} ·{" "}
            {stage.activity}
          </Text>

          <View
            accessible
            accessibilityLabel={`${provenanceLabel}. ${provenanceCopy}`}
            style={[
              styles.provenance,
              stageKind ===
                "canal"
                ? styles.provenanceCanal
                : stageKind ===
                    "verified"
                  ? styles.provenanceVerified
                  : styles.provenanceCommunity,
            ]}
          >
            <Text
              style={[
                styles.provenanceLabel,
                stageKind ===
                  "canal"
                  ? styles.provenanceLabelCanal
                  : stageKind ===
                      "verified"
                    ? styles.provenanceLabelVerified
                    : styles.provenanceLabelCommunity,
              ]}
            >
              {provenanceLabel.toUpperCase()}
            </Text>

            <Text
              selectable
              style={
                styles.provenanceCopy
              }
            >
              {provenanceCopy}
            </Text>
          </View>
        </View>

        {isMember &&
        !isEnded ? (
          <View
            style={
              styles.stageCodeRow
            }
          >
            <View>
              <Text
                style={
                  styles.codeLabel
                }
              >
                STAGE CODE
              </Text>

              <Text
                selectable
                accessibilityLabel={`Stage code ${stage.code
                  .split("")
                  .join(" ")}`}
                style={
                  styles.stageCode
                }
              >
                {stage.code}
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Invite people to this Stage"
              accessibilityRole="button"
              onPress={() => {
                void shareStage();
              }}
              style={({
                pressed,
              }) => [
                styles.shareButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.shareIcon
                }
              >
                ↗
              </Text>

              <Text
                style={
                  styles.shareText
                }
              >
                Invite
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={
            styles.nowPlayingCard
          }
        >
          {currentTrackImageUrl ? (
            <Image
              source={
                currentTrackImageUrl
              }
              contentFit="cover"
              transition={180}
              style={
                styles.artwork
              }
            />
          ) : (
            <View
              style={
                styles.artworkFallback
              }
            >
              <Text
                style={
                  styles.artworkNote
                }
              >
                ♪
              </Text>
            </View>
          )}

          <View
            style={
              styles.nowPlayingCopy
            }
          >
            <Text
              style={
                styles.nowPlayingLabel
              }
            >
              NOW PLAYING
            </Text>

            <Text
              selectable
              numberOfLines={1}
              style={
                styles.trackTitle
              }
            >
              {currentTrack?.title ??
                "Queue ready"}
            </Text>

            <Text
              selectable
              numberOfLines={1}
              style={
                styles.trackArtist
              }
            >
              {currentTrack?.artist ??
                "The host has not selected a track"}
            </Text>

            <Text
              style={
                styles.trackProgress
              }
            >
              {stage.tracks.length >
              0
                ? `${
                    stage
                      .currentTrackIndex +
                    1
                  } of ${
                    stage.tracks
                      .length
                  }`
                : "No tracks"}
            </Text>
          </View>

          {currentTrackSpotifyUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open current track in Spotify"
              onPress={() => {
                void openCurrentTrack();
              }}
              style={({
                pressed,
              }) => [
                styles.openTrackButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.openTrackText
                }
              >
                ↗
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={
            styles.quickActions
          }
        >
          {!isEnded ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  capturingSnapshot,
                disabled:
                  capturingSnapshot,
              }}
              disabled={
                capturingSnapshot
              }
              onPress={() => {
                void captureSnapshot();
              }}
              style={({
                pressed,
              }) => [
                styles.quickAction,
                capturingSnapshot &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.quickActionIcon
                }
              >
                ◫
              </Text>

              <Text
                style={
                  styles.quickActionText
                }
              >
                {capturingSnapshot
                  ? "Capturing…"
                  : "Snapshot"}
              </Text>
            </Pressable>
          ) : null}

          {newSnapshotId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                router.push({
                  pathname:
                    "/snapshots/[snapshotId]",
                  params: {
                    snapshotId:
                      newSnapshotId,
                  },
                });
              }}
              style={({
                pressed,
              }) => [
                styles.quickAction,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.quickActionText
                }
              >
                View capture
              </Text>
            </Pressable>
          ) : null}

          {isHost &&
          !isEnded ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                updating ||
                cloudIsOffline
              }
              onPress={() => {
                void advanceTrack();
              }}
              style={({
                pressed,
              }) => [
                styles.quickAction,
                styles.hostAction,
                (
                  updating ||
                  cloudIsOffline
                ) &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.hostActionText
                }
              >
                Next track →
              </Text>
            </Pressable>
          ) : null}
        </View>

        {stage.tracks.length >
        1 ? (
          <View
            style={
              styles.queueSection
            }
          >
            <Text
              selectable
              style={
                styles.sectionEyebrow
              }
            >
              UP NEXT
            </Text>

            {stage.tracks
              .slice(
                stage
                  .currentTrackIndex +
                  1,
                stage
                  .currentTrackIndex +
                  4,
              )
              .map(
                (
                  track,
                  index,
                ) => (
                  <View
                    key={
                      track.id
                    }
                    style={
                      styles.queueRow
                    }
                  >
                    <Text
                      style={
                        styles.queueNumber
                      }
                    >
                      {index + 1}
                    </Text>

                    <View
                      style={
                        styles.queueCopy
                      }
                    >
                      <Text
                        selectable
                        numberOfLines={
                          1
                        }
                        style={
                          styles.queueTitle
                        }
                      >
                        {
                          track.title
                        }
                      </Text>

                      <Text
                        selectable
                        numberOfLines={
                          1
                        }
                        style={
                          styles.queueArtist
                        }
                      >
                        {
                          track.artist
                        }
                      </Text>
                    </View>
                  </View>
                ),
              )}
          </View>
        ) : null}

        <View
          style={
            styles.peopleSection
          }
        >
          <View
            style={
              styles.sectionTitleRow
            }
          >
            <View>
              <Text
                selectable
                style={
                  styles.sectionTitle
                }
              >
                In the room
              </Text>

              <Text
                style={
                  styles.sectionSubtitle
                }
              >
                {
                  stage
                    .participantCount
                }{" "}
                connected
              </Text>
            </View>

            {!isMember &&
            !isEnded ? (
              <Pressable
                accessibilityRole="button"
                disabled={
                  updating ||
                  cloudIsOffline
                }
                onPress={() => {
                  void joinStage();
                }}
                style={({
                  pressed,
                }) => [
                  styles.joinRoomButton,
                  (
                    updating ||
                    cloudIsOffline
                  ) &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.joinRoomText
                  }
                >
                  Join room
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View
            style={
              styles.peopleList
            }
          >
            {stage.participants.map(
              (participant) => (
                <Pressable
                  key={
                    participant
                      .userId ??
                    participant
                      .username
                  }
                  accessibilityRole="button"
                  onPress={() => {
                    router.push({
                      pathname:
                        "/friend/[username]",
                      params: {
                        username:
                          participant.username,
                      },
                    });
                  }}
                  style={({
                    pressed,
                  }) => [
                    styles.person,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={
                      styles.personAvatar
                    }
                  >
                    <Text
                      style={
                        styles.personInitials
                      }
                    >
                      {
                        participant
                          .initials
                      }
                    </Text>
                  </View>

                  <Text
                    numberOfLines={1}
                    style={
                      styles.personName
                    }
                  >
                    {
                      participant
                        .displayName
                    }
                  </Text>

                  <Text
                    style={
                      styles.personRole
                    }
                  >
                    {participant.role.toUpperCase()}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        </View>

        {recoveryIssue ? (
          <RecoveryNotice
            busy={
              loading ||
              updating ||
              sending ||
              capturingSnapshot
            }
            issue={
              recoveryIssue
            }
            onAction={
              recoverRoom
            }
          />
        ) : null}

        {isHost ? (
          <Pressable
            accessibilityRole="button"
            disabled={
              updating ||
              isEnded ||
              cloudIsOffline
            }
            onPress={
              confirmEndStage
            }
            style={({
              pressed,
            }) => [
              styles.endButton,
              (
                isEnded ||
                cloudIsOffline
              ) &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.endButtonText
              }
            >
              {isEnded
                ? "Stage ended"
                : "End Stage"}
            </Text>
          </Pressable>
        ) : isMember ? (
          <Pressable
            accessibilityRole="button"
            disabled={
              updating ||
              cloudIsOffline
            }
            onPress={() => {
              void leaveStage();
            }}
            style={({
              pressed,
            }) => [
              styles.leaveButton,
              (
                updating ||
                cloudIsOffline
              ) &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.leaveButtonText
              }
            >
              Leave Stage
            </Text>
          </Pressable>
        ) : null}

        <View
          style={
            styles.chatHeader
          }
        >
          <View>
            <Text
              selectable
              style={
                styles.chatTitle
              }
            >
              Stage chat
            </Text>

            <Text
              selectable
              style={
                styles.chatSubtitle
              }
            >
              {isEnded
                ? "Chat is read-only."
                : isMember
                  ? "You’re live with the room."
                  : "Join the room to send messages."}
            </Text>
          </View>

          <Text
            style={
              styles.chatCount
            }
          >
            {messages.length}
          </Text>
        </View>
      </View>
    ) : null;

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown:
              true,
            title:
              "Live Stage",
            headerBackTitle:
              "Live",
            headerShadowVisible:
              false,
            headerStyle: {
              backgroundColor:
                "#100D0B",
            },
            headerTintColor:
              "#FFFFFF",
          }}
        />

        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
            color="#F47A24"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Entering the Stage…
          </Text>
        </View>
      </>
    );
  }

  if (!stage) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown:
              true,
            title:
              "Live Stage",
            headerBackTitle:
              "Live",
            headerShadowVisible:
              false,
            headerStyle: {
              backgroundColor:
                "#100D0B",
            },
            headerTintColor:
              "#FFFFFF",
          }}
        />

        <View
          style={
            styles.notFound
          }
        >
          <View
            style={
              styles.notFoundIcon
            }
          >
            <Text
              style={
                styles.notFoundIconText
              }
            >
              ◌
            </Text>
          </View>

          <Text
            selectable
            style={
              styles.notFoundTitle
            }
          >
            Stage unavailable
          </Text>

          {recoveryIssue ? (
            <RecoveryNotice
              busy={
                loading
              }
              issue={
                recoveryIssue
              }
              onAction={
                recoverRoom
              }
            />
          ) : (
            <Text
              selectable
              style={
                styles.notFoundText
              }
            >
              This private Stage
              needs its invitation
              code, or the host may
              have removed it.
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.replace(
                "/join-stage",
              );
            }}
            style={({
              pressed,
            }) => [
              styles.notFoundButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.notFoundButtonText
              }
            >
              Enter a Stage code
            </Text>
          </Pressable>
        </View>
      </>
    );
  }

  const canChat =
    isMember &&
    !isEnded;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:
            true,
          title:
            stage.name,
          headerBackTitle:
            "Live",
          headerShadowVisible:
            false,
          headerStyle: {
            backgroundColor:
              "#100D0B",
          },
          headerTintColor:
            "#FFFFFF",
          headerTitleStyle: {
            fontWeight:
              "800",
          },
        }}
      />

      <KeyboardAvoidingView
        behavior={
          process.env
            .EXPO_OS ===
          "ios"
            ? "padding"
            : undefined
        }
        keyboardVerticalOffset={
          process.env
            .EXPO_OS ===
          "ios"
            ? 88
            : 0
        }
        style={styles.screen}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={
            (message) =>
              message.id
          }
          renderItem={({
            item,
          }) => (
            <MessageRow
              message={item}
            />
          )}
          ListHeaderComponent={
            header
          }
          ListEmptyComponent={
            <View
              style={
                styles.emptyChat
              }
            >
              <Text
                selectable
                style={
                  styles.emptyChatTitle
                }
              >
                Start the conversation
              </Text>

              <Text
                selectable
                style={
                  styles.emptyChatText
                }
              >
                Reactions, track
                notes, and room plans
                will appear here.
              </Text>
            </View>
          }
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.listContent
          }
        />

        <View
          style={[
            styles.composer,
            {
              paddingBottom:
                Math.max(
                  insets.bottom,
                  10,
                ),
            },
          ]}
        >
          {canChat ? (
            <>
              <View
                style={
                  styles.inputWrap
                }
              >
                <TextInput
                  value={
                    messageBody
                  }
                  onChangeText={
                    setMessageBody
                  }
                  onSubmitEditing={() => {
                    void sendMessage();
                  }}
                  accessibilityLabel="Message Stage chat"
                  placeholder="Message the Stage…"
                  placeholderTextColor="#8B7E76"
                  maxLength={500}
                  multiline
                  returnKeyType="send"
                  blurOnSubmit={
                    false
                  }
                  style={
                    styles.messageInput
                  }
                />

                {messageBody.length >
                420 ? (
                  <Text
                    style={
                      styles.messageCounter
                    }
                  >
                    {
                      messageBody.length
                    }
                    /500
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={
                  sending ||
                  !messageBody.trim() ||
                  cloudIsOffline
                }
                onPress={() => {
                  void sendMessage();
                }}
                style={({
                  pressed,
                }) => [
                  styles.sendButton,
                  (
                    sending ||
                    !messageBody.trim() ||
                    cloudIsOffline
                  ) &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.sendText
                    }
                  >
                    ↑
                  </Text>
                )}
              </Pressable>
            </>
          ) : !isEnded ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                updating ||
                cloudIsOffline
              }
              onPress={() => {
                void joinStage();
              }}
              style={({
                pressed,
              }) => [
                styles.joinComposerButton,
                (
                  updating ||
                  cloudIsOffline
                ) &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.joinComposerText
                }
              >
                Join Stage to chat
              </Text>
            </Pressable>
          ) : (
            <Text
              selectable
              style={
                styles.readOnlyText
              }
            >
              This Stage has ended.
              Chat is read-only.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#100D0B",
    },

    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      backgroundColor:
        "#100D0B",
    },

    loadingText: {
      color: "#A99C94",
      fontSize: 14,
      fontWeight: "700",
    },

    notFound: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      padding: 28,
      backgroundColor:
        "#100D0B",
    },

    notFoundIcon: {
      width: 70,
      height: 70,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor:
        "#281D17",
    },

    notFoundIconText: {
      color: "#F47A24",
      fontSize: 36,
      fontWeight: "900",
    },

    notFoundTitle: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
    },

    notFoundText: {
      maxWidth: 330,
      color: "#A99C94",
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    notFoundButton: {
      minHeight: 52,
      justifyContent:
        "center",
      paddingHorizontal: 20,
      marginTop: 8,
      borderRadius: 17,
      backgroundColor:
        "#F47A24",
    },

    notFoundButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 28,
    },

    roomHeader: {
      gap: 18,
      paddingTop: 12,
      paddingBottom: 18,
    },

    stageIdentity: {
      gap: 9,
    },

    stageStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#3B1D14",
    },

    statusPillEnded: {
      backgroundColor:
        "#28221E",
    },

    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor:
        "#FF6741",
    },

    liveDotEnded: {
      backgroundColor:
        "#81766E",
    },

    statusPillText: {
      color: "#FF9A77",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    statusPillTextEnded: {
      color: "#A89D96",
    },

    realtimeStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    realtimeDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#C18B39",
    },

    realtimeDotConnected: {
      backgroundColor:
        "#52B788",
    },

    realtimeDotError: {
      backgroundColor:
        "#E76F51",
    },

    realtimeText: {
      color: "#91857D",
      fontSize: 11,
      fontWeight: "700",
    },

    stageName: {
      color: "#FFFFFF",
      fontSize: 32,
      lineHeight: 37,
      fontWeight: "900",
      letterSpacing: -0.9,
    },

    stageMeta: {
      color: "#A99C94",
      fontSize: 14,
      lineHeight: 20,
    },

    provenance: {
      alignSelf:
        "flex-start",
      gap: 3,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderWidth: 1,
      borderRadius: 13,
      borderCurve:
        "continuous",
    },

    provenanceCanal: {
      borderColor:
        "#7B421F",
      backgroundColor:
        "#2F1C10",
    },

    provenanceVerified: {
      borderColor:
        "#355F78",
      backgroundColor:
        "#142630",
    },

    provenanceCommunity: {
      borderColor:
        "#3A302A",
      backgroundColor:
        "#1A1512",
    },

    provenanceLabel: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    provenanceLabelCanal: {
      color: "#FFAA70",
    },

    provenanceLabelVerified: {
      color: "#9FD8F8",
    },

    provenanceLabelCommunity: {
      color: "#B4A69D",
    },

    provenanceCopy: {
      color: "#BDB0A8",
      fontSize: 11,
      lineHeight: 15,
    },

    stageCodeRow: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      padding: 14,
      borderWidth: 1,
      borderColor: "#332924",
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor:
        "#1A1512",
    },

    codeLabel: {
      color: "#B27650",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    stageCode: {
      color: "#FFFFFF",
      fontSize: 23,
      lineHeight: 28,
      fontWeight: "900",
      letterSpacing: 4,
      fontVariant: [
        "tabular-nums",
      ],
    },

    shareButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
    },

    shareIcon: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    shareText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },

    nowPlayingCard: {
      minHeight: 130,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 14,
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor:
        "#F2E7DE",
    },

    artwork: {
      width: 94,
      height: 94,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#DCCBC0",
    },

    artworkFallback: {
      width: 94,
      height: 94,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
    },

    artworkNote: {
      color: "#FFFFFF",
      fontSize: 40,
      fontWeight: "900",
    },

    nowPlayingCopy: {
      flex: 1,
      gap: 3,
    },

    nowPlayingLabel: {
      color: "#B9571A",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    trackTitle: {
      color: "#241B16",
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "900",
    },

    trackArtist: {
      color: "#6E625A",
      fontSize: 13,
      lineHeight: 18,
    },

    trackProgress: {
      color: "#9B8576",
      fontSize: 10,
      fontWeight: "800",
      fontVariant: [
        "tabular-nums",
      ],
    },

    openTrackButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor:
        "#211711",
    },

    openTrackText: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "900",
    },

    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    quickAction: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: "#39302A",
      borderRadius: 15,
      borderCurve: "continuous",
      backgroundColor:
        "#201A17",
    },

    quickActionIcon: {
      color: "#E89A68",
      fontSize: 16,
      fontWeight: "900",
    },

    quickActionText: {
      color: "#EDE3DC",
      fontSize: 12,
      fontWeight: "800",
    },

    hostAction: {
      borderColor:
        "#6F3820",
      backgroundColor:
        "#3A2116",
    },

    hostActionText: {
      color: "#FFAA72",
      fontSize: 12,
      fontWeight: "900",
    },

    queueSection: {
      gap: 9,
      padding: 16,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor:
        "#191512",
    },

    sectionEyebrow: {
      color: "#B57750",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    queueRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        "#2B2420",
    },

    queueNumber: {
      width: 18,
      color: "#786D66",
      fontSize: 11,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    queueCopy: {
      flex: 1,
    },

    queueTitle: {
      color: "#EEE5DF",
      fontSize: 13,
      fontWeight: "800",
    },

    queueArtist: {
      color: "#8F837C",
      fontSize: 11,
    },

    peopleSection: {
      gap: 12,
      paddingVertical: 4,
    },

    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    sectionTitle: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#8F837C",
      fontSize: 12,
      fontVariant: [
        "tabular-nums",
      ],
    },

    joinRoomButton: {
      minHeight: 40,
      justifyContent:
        "center",
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
    },

    joinRoomText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    peopleList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    person: {
      width: 105,
      minHeight: 104,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      padding: 10,
      borderWidth: 1,
      borderColor: "#302722",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#191512",
    },

    personAvatar: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      borderCurve: "continuous",
      backgroundColor:
        "#3A271C",
    },

    personInitials: {
      color: "#FFAA72",
      fontSize: 13,
      fontWeight: "900",
    },

    personName: {
      maxWidth: "100%",
      color: "#F1E8E2",
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
    },

    personRole: {
      color: "#8E8179",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    errorCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: "#663527",
      borderRadius: 17,
      borderCurve: "continuous",
      backgroundColor:
        "#301A14",
    },

    errorText: {
      flex: 1,
      color: "#FFB39D",
      fontSize: 12,
      lineHeight: 18,
    },

    retryButton: {
      minHeight: 36,
      justifyContent:
        "center",
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor:
        "#6A3526",
    },

    retryText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    endButton: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#623224",
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor:
        "#2D1813",
    },

    endButtonText: {
      color: "#F48F74",
      fontSize: 13,
      fontWeight: "900",
    },

    leaveButton: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#40352F",
      borderRadius: 16,
      borderCurve: "continuous",
    },

    leaveButtonText: {
      color: "#C5B8B0",
      fontSize: 13,
      fontWeight: "800",
    },

    chatHeader: {
      minHeight: 74,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor:
        "#2B2420",
    },

    chatTitle: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
    },

    chatSubtitle: {
      color: "#8F837C",
      fontSize: 12,
    },

    chatCount: {
      color: "#E59159",
      fontSize: 14,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    emptyChat: {
      alignItems: "center",
      gap: 6,
      paddingVertical: 34,
    },

    emptyChatTitle: {
      color: "#CFC3BC",
      fontSize: 15,
      fontWeight: "800",
    },

    emptyChatText: {
      maxWidth: 280,
      color: "#7F736C",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingVertical: 6,
    },

    messageRowMine: {
      justifyContent:
        "flex-end",
    },

    messageAvatar: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      backgroundColor:
        "#32231B",
    },

    messageInitials: {
      color: "#F5A16A",
      fontSize: 9,
      fontWeight: "900",
    },

    messageContent: {
      maxWidth: "78%",
      alignItems:
        "flex-start",
      gap: 3,
    },

    messageContentMine: {
      alignItems:
        "flex-end",
    },

    messageMeta: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 3,
    },

    messageAuthor: {
      flexShrink: 1,
      color: "#CDBFB6",
      fontSize: 10,
      fontWeight: "800",
    },

    messageTime: {
      color: "#6F645D",
      fontSize: 9,
      fontVariant: [
        "tabular-nums",
      ],
    },

    messageBubble: {
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 17,
      borderBottomLeftRadius:
        5,
      borderCurve: "continuous",
      backgroundColor:
        "#28211D",
    },

    messageBubbleMine: {
      borderBottomLeftRadius:
        17,
      borderBottomRightRadius:
        5,
      backgroundColor:
        "#F47A24",
    },

    messageBody: {
      color: "#F0E6E0",
      fontSize: 14,
      lineHeight: 20,
    },

    messageBodyMine: {
      color: "#FFFFFF",
    },

    messageTimeMine: {
      color: "#70645D",
      fontSize: 9,
      paddingHorizontal: 3,
      fontVariant: [
        "tabular-nums",
      ],
    },

    composer: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 9,
      paddingHorizontal: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor:
        "#2A231F",
      backgroundColor:
        "#15110F",
    },

    inputWrap: {
      flex: 1,
      minHeight: 48,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#3B312B",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#211B17",
    },

    messageInput: {
      maxHeight: 112,
      minHeight: 46,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      color: "#FFFFFF",
      fontSize: 15,
      lineHeight: 20,
    },

    messageCounter: {
      alignSelf:
        "flex-end",
      color: "#8A7C73",
      fontSize: 9,
      paddingRight: 11,
      paddingBottom: 5,
      fontVariant: [
        "tabular-nums",
      ],
    },

    sendButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
    },

    sendText: {
      color: "#FFFFFF",
      fontSize: 23,
      lineHeight: 25,
      fontWeight: "900",
    },

    joinComposerButton: {
      flex: 1,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      backgroundColor:
        "#F47A24",
    },

    joinComposerText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    readOnlyText: {
      flex: 1,
      color: "#948880",
      fontSize: 13,
      textAlign: "center",
      paddingVertical: 14,
    },

    disabled: {
      opacity: 0.48,
    },

    pressed: {
      opacity: 0.7,
      transform: [
        {
          scale: 0.99,
        },
      ],
    },
  });
