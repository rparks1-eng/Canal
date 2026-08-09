import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { ProfileAvatar } from "../../components/profile-avatar";
import {
  LinerNotesOverlay,
  type LinerNotesTrack,
} from "../../components/liner-notes/LinerNotesOverlay";
import {
  useLinerNotesContext,
} from "../../components/liner-notes/useLinerNotesContext";
import { StageEmojiPicker } from "../../components/stage-emoji-picker";
import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import {
  shareStageInvite,
} from "../../lib/canal-invites";
import {
  advanceLiveStageTrack,
  deleteLiveStageMessage,
  editLiveStageMessage,
  endLiveStage,
  getCurrentLiveStageTrack,
  getLiveStageTrackImageUrl,
  getLiveStageTrackSpotifyUrl,
  joinLiveStage,
  joinLiveStageByCode,
  leaveLiveStage,
  LiveStage,
  LiveStageMessage,
  type LiveStageReportReason,
  LiveStageSubscriptionStatus,
  moderateLiveStageMember,
  moderateLiveStageMessage,
  readLiveStageRoom,
  reportLiveStageMessage,
  sendLiveStageMessage,
  subscribeToLiveStage,
  toggleLiveStageMessageReaction,
  type LiveStageMessageReaction,
} from "../../lib/live-stages";
import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";
import {
  addSpotifyArtworkToLiveStage,
} from "../../lib/spotify-scene-artwork";
import {
  useAuth,
} from "../../providers/auth-provider";
import {
  useConnectivity,
} from "../../providers/connectivity-provider";
import { CanalAtmosphereContext } from "../../theme/canal-atmosphere-context";
import { stageAtmosphere } from "../../components/canal-ui/scene-signature";

const LIVE_STAGE_REPORT_REASONS:
  readonly {
    label: string;
    value:
      LiveStageReportReason;
  }[] = [
    {
      label: "Spam",
      value: "spam",
    },
    {
      label: "Harassment",
      value: "harassment",
    },
    {
      label:
        "Unsafe content",
      value:
        "unsafe_content",
    },
    {
      label:
        "Other safety concern",
      value: "other",
    },
  ];

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
    canRemove: boolean;
    canReport: boolean;
    canEdit: boolean;
    message:
      LiveStageMessage;
    removeDisabled:
      boolean;
    moderating: boolean;
    onRemove: (
      message:
        LiveStageMessage,
    ) => void;
    onReport: (
      message:
        LiveStageMessage,
    ) => void;
    reportDisabled:
      boolean;
    onEdit: (message: LiveStageMessage) => void;
    onDelete: (message: LiveStageMessage) => void;
    onReact: (message: LiveStageMessage, reaction: LiveStageMessageReaction) => void;
    onOpenReactionPicker: (message: LiveStageMessage) => void;
    onViewReactors: (message: LiveStageMessage, reaction: LiveStageMessageReaction) => void;
  },
) {
  const [actionsVisible, setActionsVisible] = useState(false);

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
        <ProfileAvatar
          avatarUrl={props.message.avatarUrl}
          displayName={props.message.displayName}
          size={30}
        />
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message from ${props.message.displayName}: ${props.message.body}`}
          accessibilityHint="Long press for reactions and message actions"
          onLongPress={() => setActionsVisible((visible) => !visible)}
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
        </Pressable>

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

        <View style={styles.reactionRow}>
          {Object.entries(props.message.reactions).filter(([, count]) => count > 0).map(([reaction, count]) => {
            const active = props.message.myReactions.includes(reaction);
            return <Pressable
              key={reaction}
              accessibilityRole="button"
              accessibilityLabel={`${active ? "Remove" : "Add"} ${reaction} reaction. ${count} ${count === 1 ? "person" : "people"} reacted.`}
              accessibilityHint="Long press to view who reacted"
              hitSlop={7}
              onLongPress={() => props.onViewReactors(props.message, reaction)}
              onPress={() => props.onReact(props.message, reaction)}
              style={[styles.reactionButton, active && styles.reactionButtonActive]}
            >
                <Text style={styles.reactionEmoji}>{reaction}</Text>
                <Text style={styles.reactionCount}>{count}</Text>
            </Pressable>;
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Add emoji reaction" hitSlop={6} onPress={() => props.onOpenReactionPicker(props.message)} style={styles.addReactionButton}>
            <Ionicons color={canalDynamicColors.mint} name="add" size={19} />
          </Pressable>
        </View>

        {actionsVisible ? (
          <View style={styles.messageActions}>
            <Pressable
              accessibilityLabel="React to message"
              accessibilityRole="button"
              onPress={() => {
                setActionsVisible(false);
                props.onOpenReactionPicker(props.message);
              }}
              style={styles.messageAction}
            >
              <Ionicons color={canalDynamicColors.mint} name="happy-outline" size={15} />
              <Text style={styles.messageActionText}>React</Text>
            </Pressable>

            {props.canEdit ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Edit your message" onPress={() => { setActionsVisible(false); props.onEdit(props.message); }} style={styles.messageAction}>
                  <Ionicons color={canalDynamicColors.text} name="pencil-outline" size={14} />
                  <Text style={styles.messageActionText}>Edit</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Delete your message" onPress={() => { setActionsVisible(false); props.onDelete(props.message); }} style={[styles.messageAction, styles.messageRemoveAction]}>
                  <Ionicons color={canalDynamicColors.danger} name="trash-outline" size={14} />
                  <Text style={[styles.messageActionText, styles.messageRemoveActionText]}>Delete</Text>
                </Pressable>
              </>
            ) : null}

            {props.canReport ? (
              <Pressable
                accessibilityLabel={`Report message from ${props.message.displayName}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    props.moderating,
                  disabled:
                    props
                      .reportDisabled,
                }}
                disabled={
                  props
                    .reportDisabled
                }
                onPress={() => {
                  setActionsVisible(false);
                  props.onReport(
                    props.message,
                  );
                }}
                style={({
                  pressed,
                }) => [
                  styles.messageAction,
                  props
                    .reportDisabled &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Ionicons color={canalDynamicColors.text} name="flag-outline" size={14} />
                <Text
                  style={
                    styles.messageActionText
                  }
                >
                  Report
                </Text>
              </Pressable>
            ) : null}

            {props.canRemove ? (
              <Pressable
                accessibilityLabel={`Remove message from ${props.message.displayName}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    props.moderating,
                  disabled:
                    props
                      .removeDisabled,
                }}
                disabled={
                  props
                    .removeDisabled
                }
                onPress={() => {
                  setActionsVisible(false);
                  props.onRemove(
                    props.message,
                  );
                }}
                style={({
                  pressed,
                }) => [
                  styles.messageAction,
                  styles.messageRemoveAction,
                  props
                    .removeDisabled &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Ionicons color={canalDynamicColors.danger} name="remove-circle-outline" size={14} />
                <Text
                  style={[
                    styles.messageActionText,
                    styles.messageRemoveActionText,
                  ]}
                >
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function LiveStageScreen() {
  const { setOverride } = use(CanalAtmosphereContext);
  const {
    configured,
    profile,
    sessionGeneration,
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

  const stageHeaderLeft =
    useCallback(
      () => (
        <Pressable
          accessibilityLabel="Back from Stage"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/live");
            }
          }}
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={canalDynamicColors.text}
            name="chevron-back"
            size={24}
            style={styles.headerBackIcon}
          />
        </Pressable>
      ),
      [],
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

  const moderationRef =
    useRef(false);

  const moderationOperationIdRef =
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
  const [editingMessageId, setEditingMessageId] = useState("");
  const [reactionMessage, setReactionMessage] = useState<LiveStageMessage | null>(null);
  const [contextTrack, setContextTrack] = useState<LinerNotesTrack | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const chatReveal = useRef(new Animated.Value(0)).current;

  const openChat = useCallback(() => {
    setChatOpen(true);
    chatReveal.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(chatReveal, {
        damping: 18,
        mass: 0.8,
        stiffness: 210,
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
  }, [chatReveal]);

  const closeChat = useCallback(() => {
    Animated.timing(chatReveal, {
      duration: 180,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setChatOpen(false);
    });
  }, [chatReveal]);

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

  const [
    moderatingTarget,
    setModeratingTarget,
  ] = useState("");

  const [
    moderationFeedback,
    setModerationFeedback,
  ] = useState("");

  const [
    reportDraft,
    setReportDraft,
  ] = useState<{
    displayName: string;
    messageId: string;
  } | null>(null);

  const [
    reportReason,
    setReportReason,
  ] =
    useState<LiveStageReportReason | null>(
      null,
    );

  const stage =
    committedRoomKey ===
    roomKey
      ? storedStage
      : null;

  useEffect(() => {
    if (!stage) return;
    setOverride(stageAtmosphere(stage));
    return () => setOverride(null);
  }, [setOverride, stage]);

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
    moderationOperationIdRef
      .current +=
      1;

    updatingRef.current =
      false;
    sendingRef.current =
      false;
    snapshotRef.current =
      false;
    moderationRef.current =
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
    setModeratingTarget("");
    setModerationFeedback("");
    setReportDraft(null);
    setReportReason(null);
    setLoading(
      true,
    );
    setError("");
    setMessageBody("");
    setEditingMessageId("");
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

  const linerNotes = useLinerNotesContext({
    track: contextTrack,
    visible: Boolean(contextTrack),
    userId: user?.id ?? null,
    sessionGeneration: sessionGeneration ?? null,
    connectivityStatus,
  });

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
        currentTrack?.imageUrl ??
        getLiveStageTrackImageUrl(
          currentTrack,
        ),
      [currentTrack],
    );

  useEffect(() => {
    if (!stage) return;
    const indexes = [0, 1, 2, 3].map((offset) => stage.currentTrackIndex + offset);
    const missing = indexes.some((index) => stage.tracks[index] && !stage.tracks[index].imageUrl);
    if (!missing) return;

    const requestedRoomKey = roomKey;
    void addSpotifyArtworkToLiveStage(stage, indexes).then((hydrated) => {
      if (requestedRoomKey !== roomKeyRef.current || !focusedRef.current) return;
      const images = new Map(
        hydrated.tracks.filter((track) => track.imageUrl).map((track) => [track.id, track.imageUrl]),
      );
      setStage((current) => current && current.id === hydrated.id
        ? { ...current, tracks: current.tracks.map((track) => {
            const imageUrl = images.get(track.id);
            return imageUrl ? { ...track, imageUrl } : track;
          }) }
        : current);
    });
  }, [roomKey, stage]);

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

  const isCollaborator =
    stage?.membershipRole ===
    "collaborator";

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

      setError("");

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

      setError("");

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

      if (editingMessageId) {
        await editLiveStageMessage(editingMessageId, submittedBody);
        if (operationRoomKey !== roomKeyRef.current || !focusedRef.current) return;
        setEditingMessageId("");
        setMessageBody("");
        await loadRoom();
        return;
      }
      const message = await sendLiveStageMessage(stage.id, submittedBody);

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

  function beginEditMessage(message: LiveStageMessage) {
    setEditingMessageId(message.id);
    setMessageBody(message.body);
  }

  function confirmDeleteOwnMessage(message: LiveStageMessage) {
    Alert.alert("Delete message?", "This removes it from the Stage chat for everyone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void (async () => { await deleteLiveStageMessage(message.id); await loadRoom(); })(); } },
    ]);
  }

  function toggleReaction(message: LiveStageMessage, reaction: LiveStageMessageReaction) {
    if (cloudIsOffline || isEnded) return;
    void (async () => {
      try {
        await toggleLiveStageMessageReaction(message.id, reaction, message.myReactions.includes(reaction));
        await loadRoom();
      } catch (reactionError) {
        setError(reactionError instanceof Error ? reactionError.message : "Canal could not update that reaction.");
      }
    })();
  }

  function viewReactionMembers(message: LiveStageMessage, reaction: LiveStageMessageReaction) {
    const names = (message.reactionUsers[reaction] ?? []).map((member) => member.displayName);
    Alert.alert(`${reaction} reactions`, names.length > 0 ? names.join("\n") : "No reactions yet.");
  }

  async function performModeration(
    target: string,
    operation: (
      targetStage:
        LiveStage,
    ) => Promise<void>,
    successMessage: string,
    allowEnded = false,
  ) {
    if (
      !stage ||
      moderationRef.current ||
      cloudIsOffline ||
      (
        isEnded &&
        !allowEnded
      )
    ) {
      return;
    }

    moderationRef.current =
      true;

    const operationId =
      moderationOperationIdRef
        .current +
      1;

    moderationOperationIdRef.current =
      operationId;

    const operationRoomKey =
      roomKey;

    try {
      setModeratingTarget(
        target,
      );
      setModerationFeedback(
        "",
      );
      setError("");

      await operation(
        stage,
      );

      if (
        operationId !==
          moderationOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setModerationFeedback(
        successMessage,
      );

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
      moderationError
    ) {
      if (
        operationId !==
          moderationOperationIdRef
            .current ||
        operationRoomKey !==
          roomKeyRef.current ||
        !focusedRef.current
      ) {
        return;
      }

      setError(
        moderationError instanceof
          Error
          ? moderationError
              .message
          : "Canal could not complete this moderation action.",
      );
    } finally {
      if (
        operationId !==
          moderationOperationIdRef
            .current
      ) {
        return;
      }

      moderationRef.current =
        false;
      setModeratingTarget("");
    }
  }

  function openReportMessage(
    message:
      LiveStageMessage,
  ) {
    if (
      message.isMine ||
      moderationRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    setReportDraft({
      displayName:
        message.displayName,
      messageId:
        message.id,
    });
    setReportReason(null);
  }

  function closeReportMessage() {
    if (moderationRef.current) {
      return;
    }

    setReportDraft(null);
    setReportReason(null);
  }

  function confirmReportMessage() {
    if (
      !stage ||
      !reportDraft ||
      !reportReason ||
      moderationRef.current ||
      cloudIsOffline
    ) {
      return;
    }

    const currentMessage =
      messages.find(
        (message) =>
          message.id ===
          reportDraft.messageId,
      );

    if (
      !currentMessage ||
      currentMessage.isMine
    ) {
      closeReportMessage();
      return;
    }

    const selectedReason =
      LIVE_STAGE_REPORT_REASONS
        .find(
          (reason) =>
            reason.value ===
            reportReason,
        );

    if (!selectedReason) {
      return;
    }

    const draft =
      reportDraft;
    const reason =
      reportReason;

    Alert.alert(
      "Report this message?",
      `Report ${draft.displayName}'s message for ${selectedReason.label.toLowerCase()}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text:
            "Report message",
          style:
            "destructive",
          onPress: () => {
            setReportDraft(
              null,
            );
            setReportReason(
              null,
            );
            void performModeration(
              `message:${draft.messageId}`,
              (
                targetStage,
              ) =>
                reportLiveStageMessage(
                  targetStage.id,
                  draft.messageId,
                  reason,
              ),
              `Report submitted for ${selectedReason.label.toLowerCase()}.`,
              true,
            );
          },
        },
      ],
    );
  }

  function confirmRemoveMessage(
    message:
      LiveStageMessage,
  ) {
    const messageIsFromHost =
      stage?.hostId
        ? message.userId ===
          stage.hostId
        : message.isMine;

    if (
      !stage ||
      !isHost ||
      messageIsFromHost ||
      moderationRef.current ||
      cloudIsOffline ||
      isEnded
    ) {
      return;
    }

    Alert.alert(
      "Remove this message?",
      `Remove ${message.displayName}'s message from Stage chat?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text:
            "Remove message",
          style:
            "destructive",
          onPress: () => {
            void performModeration(
              `message:${message.id}`,
              (
                targetStage,
              ) =>
                moderateLiveStageMessage(
                  targetStage.id,
                  message.id,
                ),
              `Message from ${message.displayName} removed from Stage chat.`,
            );
          },
        },
      ],
    );
  }

  function confirmMemberAction(
    participant:
      LiveStage["participants"][number],
    action:
      | "promote"
      | "demote"
      | "remove",
  ) {
    if (
      !stage ||
      !isHost ||
      !participant.userId ||
      participant.role ===
        "host" ||
      moderationRef.current ||
      cloudIsOffline ||
      isEnded
    ) {
      return;
    }

    const actionLabel =
      action === "promote"
        ? "Promote"
        : action ===
            "demote"
          ? "Demote"
          : "Remove";

    const confirmation =
      action === "promote"
        ? `Change ${participant.displayName}'s role to collaborator?`
        : action ===
            "demote"
          ? `Change ${participant.displayName}'s role to listener?`
          : `Remove ${participant.displayName} from this Stage? They will not be able to rejoin this Stage.`;

    Alert.alert(
      `${actionLabel} ${participant.displayName}?`,
      confirmation,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text:
            action ===
            "remove"
              ? "Remove member"
              : actionLabel,
          style:
            action ===
            "remove"
              ? "destructive"
              : "default",
          onPress: () => {
            const userId =
              participant.userId;

            if (!userId) {
              return;
            }

            void performModeration(
              `member:${userId}`,
              (
                targetStage,
              ) =>
                moderateLiveStageMember(
                  targetStage.id,
                  userId,
                  action,
                ),
              action ===
                "promote"
                ? `${participant.displayName} is now a collaborator.`
                : action ===
                    "demote"
                  ? `${participant.displayName} is now a listener.`
                  : `${participant.displayName} was removed and cannot rejoin this Stage.`,
            );
          },
        },
      ],
    );
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

  function captureSnapshot() {
    if (!stage || capturingSnapshot) return;
    router.push({
      pathname: "/snapshot-camera",
      params: {
        source: "stage",
        stageId: stage.id,
        sceneId: stage.sceneId ?? `stage-${stage.id}`,
        sceneName: stage.name,
        trackId: currentTrack?.id ?? "",
        trackTitle: currentTrack?.title ?? "",
        trackArtist: currentTrack?.artist ?? "",
        trackImageUrl: currentTrack?.imageUrl ?? "",
        spotifyUrl: currentTrackSpotifyUrl ?? "",
        mood: stage.activity,
      },
    });
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

          {stage.hostId ? (
            <Pressable
              accessibilityLabel={`View ${stage.hostName}'s creator profile`}
              accessibilityRole="button"
              onPress={() => {
                router.push({
                  pathname:
                    "/creator/[userId]",
                  params: {
                    userId:
                      stage.hostId,
                  },
                });
              }}
              style={styles.hostProfileRow}
            >
              <ProfileAvatar
                avatarUrl={stage.hostAvatarUrl}
                displayName={stage.hostName}
                size={34}
              />
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
            </Pressable>
          ) : (
            <View style={styles.hostProfileRow}>
              <ProfileAvatar
                avatarUrl={stage.hostAvatarUrl}
                displayName={stage.hostName}
                size={34}
              />
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
            </View>
          )}

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

        {isCollaborator &&
        !isEnded ? (
          <Pressable
            accessibilityLabel="Add or change my Stage contribution"
            accessibilityRole="button"
            onPress={() => {
              router.push({
                pathname:
                  "/stage-contribution",
                params: {
                  stageId:
                    stage.id,
                },
              });
            }}
            style={
              styles.collaborationAction
            }
          >
            <Text
              style={
                styles.collaborationActionText
              }
            >
              Add or change my contribution
            </Text>
          </Pressable>
        ) : null}

        <View
          style={
            styles.nowPlayingCard
          }
        >
          <View style={styles.artworkFrame}>
            {currentTrackImageUrl ? (
              <Image
                source={currentTrackImageUrl}
                contentFit="cover"
                transition={180}
                style={styles.artwork}
              />
            ) : (
              <View style={styles.artworkFallback}>
                <Text style={styles.artworkNote}>♪</Text>
              </View>
            )}

          </View>

          <View style={styles.nowPlayingTextRow}>
          <View style={styles.nowPlayingCopy}>
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
          {currentTrack ? (
            <Pressable
              accessibilityLabel={`View context for ${currentTrack.title}`}
              accessibilityRole="button"
              onPress={() => setContextTrack({ title: currentTrack.title, artist: currentTrack.artist })}
              style={({ pressed }) => [styles.currentContextButton, pressed && styles.pressed]}
            >
              <Text style={styles.currentContextText}>i</Text>
            </Pressable>
          ) : null}
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
              <Ionicons color={canalDynamicColors.text} name="musical-notes-outline" size={20} />
            </Pressable>
          ) : null}

        </View>

        <View
          style={
          styles.quickActions
          }
        >
          <Pressable
            accessibilityLabel="Open Stage chat"
            accessibilityHint="Opens live messages while keeping the current song visible"
            accessibilityRole="button"
            onPress={openChat}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <Ionicons color={canalDynamicColors.text} name="chatbubble-ellipses-outline" size={20} />
            {messages.length > 0 ? (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{Math.min(messages.length, 99)}</Text>
              </View>
            ) : null}
          </Pressable>

          {isHost && !isEnded && stage.tracks.length > 1 ? (
            <Pressable
              accessibilityLabel="Play next Stage track"
              accessibilityHint="Advances the Stage to the next song"
              accessibilityRole="button"
              accessibilityState={{
                busy: updating,
                disabled: updating || cloudIsOffline,
              }}
              disabled={updating || cloudIsOffline}
              hitSlop={6}
              onPress={() => void advanceTrack()}
              style={({ pressed }) => [
                styles.nextTrackButton,
                (updating || cloudIsOffline) && styles.disabled,
                pressed && styles.nextTrackPressed,
              ]}
            >
              {updating ? (
                <ActivityIndicator color="#F4FFFC" size="small" />
              ) : (
                <>
                  <Text style={styles.nextTrackText}>Play next track</Text>
                  <Ionicons color="#173F4C" name="play-skip-forward" size={18} />
                </>
              )}
            </Pressable>
          ) : null}

          {!isEnded ? (
            <Pressable
              accessibilityLabel="Create a Snapshot from this Stage"
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
                captureSnapshot();
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
              {capturingSnapshot ? (
                <ActivityIndicator color="#F4FFFC" size="small" />
              ) : (
                <Ionicons color={canalDynamicColors.text} name="camera-outline" size={20} />
              )}
            </Pressable>
          ) : null}

          {newSnapshotId ? (
            <Pressable
              accessibilityLabel="View the new Stage Snapshot"
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

        </View>

        {stage.tracks.length >
        1 ? (
          <View
            style={
              styles.queueSection
            }
          >
            <View style={styles.queueHeader}>
              <Text selectable style={styles.sectionEyebrow}>UP NEXT</Text>
              <Pressable
                accessibilityLabel={queueExpanded ? "Show fewer queued tracks" : "View full Stage queue"}
                accessibilityRole="button"
                onPress={() => setQueueExpanded((expanded) => !expanded)}
                style={styles.queueExpandButton}
              >
                <Text style={styles.queueExpandText}>{queueExpanded ? "Show less" : "See full queue"}</Text>
              </Pressable>
            </View>

            {stage.tracks
              .slice(
                stage
                  .currentTrackIndex +
                  1,
                stage
                  .currentTrackIndex +
                  (queueExpanded ? stage.tracks.length : 4),
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
                    {track.imageUrl ? (
                      <Image
                        accessibilityLabel={`${track.title} album artwork`}
                        contentFit="cover"
                        source={track.imageUrl}
                        style={styles.queueArtwork}
                        transition={140}
                      />
                    ) : (
                      <View style={[styles.queueArtwork, styles.queueArtworkFallback]}>
                        <Text style={styles.queueArtworkNote}>♪</Text>
                      </View>
                    )}

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
                    <Pressable
                      accessibilityLabel={`View context for ${track.title}`}
                      accessibilityRole="button"
                      onPress={() => setContextTrack({
                        title: track.title,
                        artist: track.artist,
                      })}
                      style={styles.queueContextAction}
                    >
                      <Ionicons color={canalDynamicColors.mint} name="document-text-outline" size={18} />
                    </Pressable>
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
                accessibilityLabel="Join this Stage"
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
              (participant) => {
                const canModerateParticipant =
                  isHost &&
                  participant.role !==
                    "host" &&
                  Boolean(
                    participant.userId,
                  );
                const roleAction =
                  participant.role ===
                  "collaborator"
                    ? "demote"
                    : "promote";
                const roleActionLabel =
                  roleAction ===
                  "demote"
                    ? "Demote"
                    : "Promote";
                const participantBusy =
                  moderatingTarget ===
                  `member:${participant.userId}`;
                const moderationDisabled =
                  Boolean(
                    moderatingTarget,
                  ) ||
                  cloudIsOffline ||
                  isEnded;

                return (
                <View
                  key={
                    participant
                      .userId ??
                    participant
                      .username
                  }
                  style={
                    styles.person
                  }
                >
                  <Pressable
                    accessibilityLabel={`View ${participant.displayName}'s profile`}
                    accessibilityRole="button"
                    onPress={() => {
                      if (
                        participant.userId
                      ) {
                        router.push({
                          pathname:
                            "/creator/[userId]",
                          params: {
                            userId:
                              participant.userId,
                          },
                        });
                      } else {
                        router.push({
                          pathname:
                            "/friend/[username]",
                          params: {
                            username:
                              participant.username,
                          },
                        });
                      }
                    }}
                    style={({
                      pressed,
                    }) => [
                      styles.personProfile,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <ProfileAvatar
                      avatarUrl={participant.avatarUrl}
                      displayName={participant.displayName}
                      size={40}
                    />

                    <View
                      style={
                        styles.personCopy
                      }
                    >
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
                    </View>
                  </Pressable>

                  {canModerateParticipant ? (
                    <View
                      style={
                        styles.memberActions
                      }
                    >
                      <Pressable
                        accessibilityLabel={`${roleActionLabel} ${participant.displayName} to ${roleAction === "promote" ? "collaborator" : "listener"}`}
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            participantBusy,
                          disabled:
                            moderationDisabled,
                        }}
                        disabled={
                          moderationDisabled
                        }
                        onPress={() => {
                          confirmMemberAction(
                            participant,
                            roleAction,
                          );
                        }}
                        style={({
                          pressed,
                        }) => [
                          styles.memberAction,
                          moderationDisabled &&
                            styles.disabled,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <Text
                          style={
                            styles.memberActionText
                          }
                        >
                          {roleActionLabel}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityLabel={`Remove ${participant.displayName} from Stage`}
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            participantBusy,
                          disabled:
                            moderationDisabled,
                        }}
                        disabled={
                          moderationDisabled
                        }
                        onPress={() => {
                          confirmMemberAction(
                            participant,
                            "remove",
                          );
                        }}
                        style={({
                          pressed,
                        }) => [
                          styles.memberAction,
                          styles.memberRemoveAction,
                          moderationDisabled &&
                            styles.disabled,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberActionText,
                            styles.memberRemoveActionText,
                          ]}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                );
              },
            )}
          </View>
        </View>

        {moderationFeedback ? (
          <View
            accessible
            accessibilityLiveRegion="polite"
            style={
              styles.moderationFeedback
            }
          >
            <Text
              selectable
              style={
                styles.moderationFeedbackText
              }
            >
              {moderationFeedback}
            </Text>
          </View>
        ) : null}

        {recoveryIssue ? (
          <RecoveryNotice
            busy={
              loading ||
              updating ||
              sending ||
              capturingSnapshot ||
              Boolean(
                moderatingTarget,
              )
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
            accessibilityLabel={isEnded ? "Stage ended" : "End this Stage"}
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
            accessibilityLabel="Leave this Stage"
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

        {isHost && isEnded ? (
          <Pressable
            accessibilityLabel="Manage this ended Stage"
            accessibilityHint="Opens hosted Stage history where this Stage can be restarted or deleted"
            accessibilityRole="button"
            onPress={() => router.push("/managed-stages")}
            style={styles.manageEndedButton}
          >
            <Text style={styles.manageEndedButtonText}>Restart, review, or delete this Stage</Text>
          </Pressable>
        ) : null}

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
            headerBackVisible:
              false,
            headerLeft:
              stageHeaderLeft,
            headerShadowVisible:
              false,
            headerTransparent:
              true,
            headerStyle: {
              backgroundColor:
                "transparent",
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
            headerBackVisible:
              false,
            headerLeft:
              stageHeaderLeft,
            headerShadowVisible:
              false,
            headerTransparent:
              true,
            headerStyle: {
              backgroundColor:
                "transparent",
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

  const moderationDisabled =
    Boolean(
      moderatingTarget,
    ) ||
    cloudIsOffline ||
    isEnded;

  const reportDisabled =
    Boolean(
      moderatingTarget,
    ) ||
    cloudIsOffline;

  function renderStageMessage({ item }: { item: LiveStageMessage }) {
      if (!stage) {
        return null;
      }

      const messageIsFromHost = stage.hostId
        ? item.userId === stage.hostId
        : item.isMine && isHost;

      return (
        <MessageRow
          canEdit={item.isMine && !isEnded}
          canRemove={ isHost && !messageIsFromHost }
          canReport={ !item.isMine }
          message={item}
          removeDisabled={moderationDisabled}
          moderating={moderatingTarget === `message:${item.id}`}
          onRemove={confirmRemoveMessage}
          onReport={openReportMessage}
          onEdit={beginEditMessage}
          onDelete={confirmDeleteOwnMessage}
          onReact={toggleReaction}
          onOpenReactionPicker={setReactionMessage}
          onViewReactors={viewReactionMembers}
          reportDisabled={reportDisabled}
        />
      );
  }

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
          headerBackVisible:
            false,
          headerLeft:
            stageHeaderLeft,
          headerShadowVisible:
            false,
          headerTransparent:
            true,
          headerStyle: {
            backgroundColor:
              "transparent",
          },
          headerTintColor:
            "#FFFFFF",
          headerTitleStyle: {
            fontWeight:
              "800",
          },
        }}
      />

      <Modal
        animationType="fade"
        onRequestClose={
          closeReportMessage
        }
        transparent
        visible={
          Boolean(
            reportDraft,
          )
        }
      >
        <View
          style={
            styles.reportBackdrop
          }
        >
          <View
            accessibilityViewIsModal
            style={
              styles.reportDialog
            }
          >
            <Text
              selectable
              style={
                styles.reportTitle
              }
            >
              Report message
            </Text>

            <Text
              selectable
              style={
                styles.reportCopy
              }
            >
              Choose a reason for
              reporting{" "}
              {reportDraft
                ?.displayName ??
                "this member"}
              ’s message.
            </Text>

            <View
              style={
                styles.reportReasons
              }
            >
              {LIVE_STAGE_REPORT_REASONS.map(
                (reason) => (
                  <Pressable
                    key={
                      reason.value
                    }
                    accessibilityLabel={`Report reason: ${reason.label}`}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked:
                        reportReason ===
                        reason.value,
                    }}
                    onPress={() => {
                      setReportReason(
                        reason.value,
                      );
                    }}
                    style={({
                      pressed,
                    }) => [
                      styles.reportReason,
                      reportReason ===
                        reason.value &&
                        styles.reportReasonSelected,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.reportRadio,
                        reportReason ===
                          reason.value &&
                          styles.reportRadioSelected,
                      ]}
                    />

                    <Text
                      style={
                        styles.reportReasonText
                      }
                    >
                      {reason.label}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <View
              style={
                styles.reportDialogActions
              }
            >
              <Pressable
                accessibilityLabel="Cancel message report"
                accessibilityRole="button"
                disabled={
                  Boolean(
                    moderatingTarget,
                  )
                }
                onPress={
                  closeReportMessage
                }
                style={({
                  pressed,
                }) => [
                  styles.reportCancel,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.reportCancelText
                  }
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel={`Confirm report of message from ${reportDraft?.displayName ?? "this member"}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    Boolean(
                      moderatingTarget,
                    ),
                  disabled:
                    !reportReason ||
                    reportDisabled,
                }}
                disabled={
                  !reportReason ||
                  reportDisabled
                }
                onPress={
                  confirmReportMessage
                }
                style={({
                  pressed,
                }) => [
                  styles.reportSubmit,
                  (
                    !reportReason ||
                    reportDisabled
                  ) &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.reportSubmitText
                  }
                >
                  Review report
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
          data={[] as LiveStageMessage[]}
          keyExtractor={
            (message) =>
              message.id
          }
          renderItem={renderStageMessage}
          ListHeaderComponent={
            header
          }
          ListEmptyComponent={null}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.listContent
          }
        />

        <Modal
          animationType="none"
          onRequestClose={closeChat}
          transparent
          visible={chatOpen}
        >
          <KeyboardAvoidingView
            behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
            style={styles.chatModalContainer}
          >
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.chatModal,
              {
                opacity: chatReveal,
                transform: [
                  {
                    translateY: chatReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [42, 0],
                    }),
                  },
                  {
                    scale: chatReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.97, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.chatSheet}>
              <View style={styles.chatNowPlaying}>
                {currentTrackImageUrl ? (
                  <Image
                    accessibilityLabel={`${currentTrack?.title ?? "Current track"} album artwork`}
                    contentFit="cover"
                    source={ currentTrackImageUrl }
                    style={styles.chatArtwork}
                    transition={140}
                  />
                ) : (
                  <View style={[styles.chatArtwork, styles.queueArtworkFallback]}>
                    <Ionicons color={canalDynamicColors.mint} name="musical-note" size={20} />
                  </View>
                )}

                <View style={styles.chatNowPlayingCopy}>
                  <Text numberOfLines={1} style={styles.chatStageName}>{stage.name}</Text>
                  <Text numberOfLines={1} style={styles.chatTrackName}>
                    {currentTrack ? `${currentTrack.title} · ${currentTrack.artist}` : "Queue ready"}
                  </Text>
                </View>

                <Pressable
                  accessibilityLabel="Close Stage chat"
                  accessibilityRole="button"
                  onPress={closeChat}
                  style={({ pressed }) => [styles.closeChatButton, pressed && styles.pressed]}
                >
                  <Ionicons color={canalDynamicColors.text} name="close" size={22} />
                </Pressable>
              </View>

              <View style={styles.chatSheetTitleRow}>
                <View>
                  <Text accessibilityRole="header" style={styles.chatTitle}>Stage chat</Text>
                  <Text style={styles.chatSubtitle}>Live with the room</Text>
                </View>
                <Text style={styles.chatCount}>{messages.length}</Text>
              </View>

              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(message) => message.id}
                renderItem={renderStageMessage}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chatMessages}
                ListEmptyComponent={(
                  <View style={styles.emptyChat}>
                    <Text style={styles.emptyChatTitle}>The room is listening</Text>
                    <Text style={styles.emptyChatText}>Start the conversation or react when a message arrives.</Text>
                  </View>
                )}
              />

              <View
                style={[
                  styles.composer,
                  { paddingBottom: Math.max(insets.bottom, 10) },
                ]}
              >
                {canChat ? (
                  <>
                    <View style={styles.inputWrap}>
                      <TextInput
                        accessibilityLabel="Message Stage chat"
                      autoCapitalize="none"
                        blurOnSubmit={false}
                        maxLength={500}
                        multiline
                        onChangeText={setMessageBody}
                        onSubmitEditing={() => void sendMessage()}
                        placeholder="Message the Stage…"
                        placeholderTextColor={canalDynamicColors.muted}
                        returnKeyType="send"
                        style={styles.messageInput}
                        value={messageBody}
                      />

                      {messageBody.length > 420 ? (
                        <Text style={styles.messageCounter}>{messageBody.length}/500</Text>
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityHint={editingMessageId ? "Saves your edited message." : "Sends your message to the Stage."}
                      accessibilityLabel="Send message"
                      accessibilityRole="button"
                      disabled={sending || !messageBody.trim() || cloudIsOffline}
                      onPress={() => void sendMessage()}
                      style={({ pressed }) => [
                        styles.sendButton,
                        (sending || !messageBody.trim() || cloudIsOffline) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {sending ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Ionicons color={canalDynamicColors.text} name={editingMessageId ? "checkmark" : "arrow-up"} size={20} />
                      )}
                    </Pressable>
                  </>
                ) : !isEnded ? (
                  <Pressable
                    accessibilityLabel="Join Stage to chat"
                    accessibilityRole="button"
                    disabled={updating || cloudIsOffline}
                    onPress={() => void joinStage()}
                    style={({ pressed }) => [
                      styles.joinComposerButton,
                      (updating || cloudIsOffline) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.joinComposerText}>Join Stage to chat</Text>
                  </Pressable>
                ) : (
                  <Text selectable style={styles.readOnlyText}>This Stage has ended. Chat is read-only.</Text>
                )}
              </View>

              <StageEmojiPicker
                accountKey={accountKey}
                messageLabel={reactionMessage?.body ?? "Stage message"}
                onClose={() => setReactionMessage(null)}
                onSelect={(emoji) => {
                  if (reactionMessage) toggleReaction(reactionMessage, emoji);
                }}
                visible={Boolean(reactionMessage)}
              />
            </View>
          </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        <LinerNotesOverlay
          context={linerNotes.context}
          onClose={() => setContextTrack(null)}
          onRetry={linerNotes.retry}
          state={linerNotes.state}
          track={contextTrack}
          visible={Boolean(contextTrack)}
        />
      </KeyboardAvoidingView>
    </>
  );
}

const styles =
  StyleSheet.create({
    headerBack: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      marginLeft: 0,
      padding: 0,
      width: 48,
    },
    headerBackIcon: {
      transform: [{ translateX: -1 }],
    },
    screen: {
      flex: 1,
      backgroundColor: "transparent",
    },

    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      backgroundColor:
        "transparent",
    },

    loadingText: {
      color: canalDynamicColors.muted,
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
        "transparent",
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
      color: canalDynamicColors.gold,
      fontSize: 36,
      fontWeight: "900",
    },

    notFoundTitle: {
      color: canalDynamicColors.text,
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
    },

    notFoundText: {
      maxWidth: 330,
      color: canalDynamicColors.muted,
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
      paddingBottom: 120,
    },

    roomHeader: {
      gap: 10,
      paddingTop: 6,
      paddingBottom: 14,
    },

    stageIdentity: {
      gap: 6,
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
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "rgba(255, 117, 111, 0.12)",
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
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "700",
    },

    stageName: {
      color: canalDynamicColors.text,
      fontSize: 32,
      lineHeight: 37,
      fontWeight: "900",
      letterSpacing: -0.9,
    },

    stageMeta: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 17,
    },

    provenance: {
      alignSelf:
        "flex-start",
      paddingHorizontal: 9,
      paddingVertical: 5,
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
      borderColor: "rgba(209, 255, 247, 0.22)",
      backgroundColor: "rgba(7, 44, 64, 0.38)",
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
      color: canalDynamicColors.muted,
    },

    provenanceCopy: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 15,
    },

    stageCodeRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "rgba(209, 255, 247, 0.18)",
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 58, 0.30)",
    },

    codeLabel: {
      color: "#B27650",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    stageCode: {
      color: "#FFFFFF",
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "900",
      letterSpacing: 4,
      fontVariant: [
        "tabular-nums",
      ],
    },

    shareButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
    },

    shareIcon: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    shareText: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    nowPlayingCard: {
      position: "relative",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderColor: "rgba(235, 255, 251, 0.19)",
      borderCurve: "continuous",
      borderRadius: 28,
      borderWidth: 1,
      backgroundColor: "rgba(8, 30, 46, 0.36)",
      boxShadow: "inset 0 1px rgba(255, 255, 255, 0.09), 0 18px 50px rgba(7, 22, 39, 0.13)",
    },

    artworkFrame: {
      position: "relative",
      width: "100%",
      borderRadius: 26,
      borderCurve: "continuous",
    },

    artwork: {
      width: "100%",
      height: undefined,
      aspectRatio: 1.55,
      borderRadius: 26,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 58, 0.35)",
      boxShadow: "0 18px 34px rgba(7, 32, 48, 0.22)",
    },

    artworkFallback: {
      width: "100%",
      aspectRatio: 1.55,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 26,
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
      alignItems: "flex-start",
      gap: 3,
    },

    nowPlayingTextRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 2,
      width: "100%",
    },

    currentContextButton: {
      alignItems: "center",
      backgroundColor: "rgba(222, 255, 246, 0.12)",
      borderCurve: "continuous",
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },

    currentContextText: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 18,
      fontWeight: "700",
    },

    nowPlayingLabel: {
      color: "rgba(239, 255, 251, 0.70)",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    trackTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "900",
    },

    trackArtist: {
      color: "rgba(239, 255, 251, 0.76)",
      fontSize: 13,
      lineHeight: 18,
    },

    trackProgress: {
      color: "rgba(239, 255, 251, 0.64)",
      fontSize: 10,
      fontWeight: "800",
      fontVariant: [
        "tabular-nums",
      ],
    },

    openTrackButton: {
      position: "absolute",
      right: 2,
      bottom: 2,
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: "transparent",
    },

    openTrackText: {
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
    },

    quickActions: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 2,
    },

    quickAction: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0,
      borderRadius: 23,
      borderCurve: "continuous",
      backgroundColor: "transparent",
    },

    chatBadge: {
      position: "absolute",
      top: -3,
      right: -3,
      minWidth: 17,
      height: 17,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: "#F1B8EA",
    },

    chatBadgeText: {
      color: "#342342",
      fontSize: 9,
      fontWeight: "900",
    },

    nextTrackButton: {
      minHeight: 50,
      flex: 1,
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      borderCurve: "continuous",
      borderRadius: 17,
      backgroundColor: "#DFFFF5",
    },

    nextTrackText: {
      color: "#173F4C",
      fontSize: 13,
      fontWeight: "800",
    },

    nextTrackPressed: {
      opacity: 0.74,
      transform: [{ scale: 0.94 }],
    },

    quickActionIcon: {
      color: "#E89A68",
      fontSize: 16,
      fontWeight: "900",
    },

    quickActionText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "800",
    },

    hostAction: {
      borderColor: "rgba(213, 255, 245, 0.52)",
      backgroundColor: "#D5FFF5",
    },

    hostActionText: {
      color: "#173D52",
      fontSize: 12,
      fontWeight: "900",
    },

    queueSection: {
      gap: 9,
      padding: 16,
      borderRadius: 20,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: "rgba(222, 255, 249, 0.14)",
      backgroundColor: "rgba(7, 43, 58, 0.30)",
    },

    queueHeader: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    queueExpandButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 8,
    },

    queueExpandText: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "700",
    },

    sectionEyebrow: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    queueRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        "rgba(222, 255, 249, 0.12)",
    },

    queueContextAction: {
      width: 48,
      minHeight: 48,
      paddingHorizontal: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
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

    queueArtwork: {
      width: 42,
      height: 42,
      borderRadius: 10,
      borderCurve: "continuous",
    },

    queueArtworkFallback: {
      alignItems: "center",
      backgroundColor: "rgba(235, 255, 250, 0.15)",
      justifyContent: "center",
    },

    queueArtworkNote: {
      color: canalDynamicColors.onAccent,
      fontSize: 18,
    },

    queueCopy: {
      flex: 1,
    },

    queueTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
    },

    queueArtist: {
      color: "rgba(239, 255, 251, 0.74)",
      fontSize: 11,
    },

    peopleSection: {
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: "rgba(235, 255, 250, 0.14)",
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 58, 0.30)",
    },

    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 20,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
    },

    peopleList: {
      gap: 9,
    },

    person: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 9,
      borderWidth: 1,
      borderColor: "rgba(222, 255, 249, 0.14)",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 63, 0.34)",
    },

    personProfile: {
      minWidth: 0,
      flex: 1,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 4,
      borderRadius: 14,
      borderCurve: "continuous",
    },

    personCopy: {
      minWidth: 0,
      flex: 1,
      gap: 3,
    },

    personAvatar: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      borderCurve: "continuous",
      backgroundColor: "rgba(201, 255, 243, 0.16)",
    },

    personInitials: {
      color: "#FFAA72",
      fontSize: 13,
      fontWeight: "900",
    },

    personName: {
      maxWidth: "100%",
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "800",
    },

    personRole: {
      color: "#8E8179",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    memberActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    memberAction: {
      minHeight: 40,
      justifyContent:
        "center",
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: "#5B3A27",
      borderRadius: 12,
      borderCurve: "continuous",
      backgroundColor:
        "#2D2019",
    },

    memberActionText: {
      color: "#F1A574",
      fontSize: 10,
      fontWeight: "900",
    },

    memberRemoveAction: {
      borderColor: "#6A3028",
      backgroundColor:
        "#351B17",
    },

    memberRemoveActionText: {
      color: canalDynamicColors.danger,
    },

    moderationFeedback: {
      padding: 13,
      borderWidth: 1,
      borderColor: "#315C47",
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor:
        "#172A21",
    },

    moderationFeedbackText: {
      color: "#A8E1C2",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
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
      color: canalDynamicColors.text,
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

    manageEndedButton: {
      alignItems: "center",
      backgroundColor: "rgba(223, 255, 245, 0.14)",
      borderColor: "rgba(239, 255, 251, 0.18)",
      borderCurve: "continuous",
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 16,
    },

    manageEndedButtonText: {
      color: "#F4FFFC",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
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
      borderTopColor: "rgba(222, 255, 249, 0.14)",
      backgroundColor: "transparent",
    },

    chatModal: {
      position: "absolute",
      zIndex: 30,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "flex-start",
      backgroundColor: "rgba(3, 18, 30, 0.46)",
    },

    chatModalContainer: {
      flex: 1,
    },

    chatSheet: {
      flex: 1,
      overflow: "hidden",
      borderColor: "rgba(239, 255, 252, 0.20)",
      borderCurve: "continuous",
      borderRadius: 32,
      borderWidth: 1,
      backgroundColor: "rgba(9, 29, 45, 0.91)",
      boxShadow: "0 24px 80px rgba(3, 16, 29, 0.44)",
      marginHorizontal: 10,
      marginVertical: 12,
    },

    chatNowPlaying: {
      minHeight: 96,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(229, 255, 250, 0.15)",
      backgroundColor: "rgba(28, 39, 67, 0.28)",
    },

    chatArtwork: {
      width: 52,
      height: 52,
      borderRadius: 13,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 58, 0.35)",
    },

    chatNowPlayingCopy: {
      flex: 1,
      gap: 3,
    },

    chatStageName: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    chatTrackName: {
      color: canalDynamicColors.muted,
      fontSize: 12,
    },

    closeChatButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: "rgba(7, 43, 63, 0.34)",
    },

    chatSheetTitleRow: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 10,
    },

    chatMessages: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },

    chatTitle: {
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
    },

    chatSubtitle: {
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.muted,
      fontSize: 15,
      fontWeight: "800",
    },

    emptyChatText: {
      maxWidth: 280,
      color: canalDynamicColors.muted,
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

    hostProfileRow: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      minHeight: 48,
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
      backgroundColor: "rgba(226, 255, 249, 0.10)",
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
      color: canalDynamicColors.text,
      fontSize: 14,
      lineHeight: 20,
    },

    messageBodyMine: {
      color: canalDynamicColors.text,
    },

    messageTimeMine: {
      color: "#70645D",
      fontSize: 9,
      paddingHorizontal: 3,
      fontVariant: [
        "tabular-nums",
      ],
    },

    messageActions: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 5,
      paddingHorizontal: 3,
      paddingTop: 3,
    },

    reactionRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 5,
      paddingTop: 3,
    },

    reactionButton: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: "rgba(229, 255, 250, 0.10)",
      borderRadius: 17,
      borderCurve: "continuous",
      backgroundColor: "rgba(230, 255, 249, 0.07)",
    },

    reactionButtonActive: {
      borderColor: "rgba(141, 232, 218, 0.52)",
      backgroundColor: "rgba(80, 205, 181, 0.14)",
    },

    reactionIcon: { width: 17, height: 17 },
    reactionToggleButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
    reactionMembersButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
    reactionEmoji: { fontSize: 15 },
    reactionCount: { color: "rgba(244, 255, 252, 0.78)", fontSize: 11, fontWeight: "800" },
    addReactionButton: { width: 36, height: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(188, 239, 230, 0.22)", borderRadius: 18, backgroundColor: "rgba(230, 255, 249, 0.08)" },
    addReactionText: { color: canalDynamicColors.muted, fontSize: 13, fontWeight: "700" },

    messageAction: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 5,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: "rgba(229, 255, 250, 0.10)",
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 43, 63, 0.24)",
    },

    messageActionText: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "800",
    },

    messageRemoveAction: {
      borderColor: "rgba(255, 157, 135, 0.22)",
      backgroundColor: "rgba(53, 27, 23, 0.34)",
    },

    messageRemoveActionText: {
      color: canalDynamicColors.danger,
    },

    reportBackdrop: {
      flex: 1,
      justifyContent:
        "center",
      padding: 20,
      backgroundColor:
        "rgba(8, 6, 5, 0.78)",
    },

    reportDialog: {
      gap: 14,
      padding: 20,
      borderWidth: 1,
      borderColor: "#49352A",
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor:
        "#1B1512",
    },

    reportTitle: {
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
    },

    reportCopy: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 19,
    },

    reportReasons: {
      gap: 8,
    },

    reportReason: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: "#3A2E28",
      borderRadius: 14,
      borderCurve: "continuous",
      backgroundColor:
        "#211A17",
    },

    reportReasonSelected: {
      borderColor: "#D76B2C",
      backgroundColor:
        "#362116",
    },

    reportRadio: {
      width: 16,
      height: 16,
      borderWidth: 2,
      borderColor: "#75665D",
      borderRadius: 8,
    },

    reportRadioSelected: {
      borderWidth: 5,
      borderColor: "#F47A24",
    },

    reportReasonText: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
    },

    reportDialogActions: {
      flexDirection: "row",
      justifyContent:
        "flex-end",
      gap: 8,
    },

    reportCancel: {
      minHeight: 44,
      justifyContent:
        "center",
      paddingHorizontal: 14,
      borderRadius: 14,
      borderCurve: "continuous",
      backgroundColor:
        "#2B2420",
    },

    reportCancelText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },

    reportSubmit: {
      minHeight: 44,
      justifyContent:
        "center",
      paddingHorizontal: 14,
      borderRadius: 14,
      borderCurve: "continuous",
      backgroundColor:
        "#C34E31",
    },

    reportSubmitText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
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
        "transparent",
      backgroundColor: "rgba(7, 43, 58, 0.20)",
    },

    inputWrap: {
      flex: 1,
      minHeight: 48,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(222, 255, 249, 0.18)",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: "rgba(7, 48, 68, 0.38)",
    },

    messageInput: {
      maxHeight: 112,
      minHeight: 46,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    readOnlyText: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 13,
      textAlign: "center",
      paddingVertical: 14,
    },

    collaborationAction: {
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor:
        "rgba(114, 216, 196, 0.42)",
      borderRadius: 17,
      borderCurve: "continuous",
      backgroundColor:
        "rgba(15, 72, 65, 0.38)",
    },

    collaborationActionText: {
      color: canalDynamicColors.mint,
      fontSize: 14,
      fontWeight: "900",
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
