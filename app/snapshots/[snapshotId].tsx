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
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    RecoveryNotice,
} from "../../components/recovery-notice";
import {
    useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import {
    shareSnapshot,
} from "../../lib/canal-share";
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

import {
  canonicalSpotifyTrackUrl,
} from "../../lib/spotify-track-links";

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
    | "soundscape"
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

  useFocusEffect(
    useCallback(() => {
      void loadSnapshot();

      return () => {
        loadRequestId.current +=
          1;
      };
    }, [loadSnapshot]),
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

  async function toggleSoundscape() {
    if (
      !snapshot ||
      !soundscape
    ) {
      return;
    }

    try {
      setActiveAction(
        "soundscape",
      );

      const alreadyAdded =
        soundscape.snapshotIds.includes(
          snapshot.id,
        );

      const updatedSoundscape =
        await saveSoundscape({
          ...soundscape,

          snapshotIds:
            alreadyAdded
              ? soundscape.snapshotIds.filter(
                  (id) =>
                    id !==
                    snapshot.id,
                )
              : Array.from(
                  new Set([
                    ...soundscape.snapshotIds,
                    snapshot.id,
                  ]),
                ),
        });

      setSoundscape(
        updatedSoundscape,
      );

      Alert.alert(
        alreadyAdded
          ? "Removed from Soundscape"
          : "Added to Soundscape",

        alreadyAdded
          ? "This Snapshot no longer appears on your Soundscape."
          : "This Snapshot now appears on your Soundscape.",
      );
    } catch (error) {
      console.error(
        "Unable to update Soundscape:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not update your Soundscape.",
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
      const result =
        await shareSnapshot(
          snapshot,
        );

      if (
        result.method ===
        "clipboard"
      ) {
        Alert.alert(
          "Snapshot copied",
          "The Snapshot was copied to your clipboard.",
        );
      }
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
    const spotifyUrl =
      canonicalSpotifyTrackUrl(
        snapshot?.spotifyUrl,
      );

    if (!spotifyUrl) {
      return;
    }

    try {
      await Linking.openURL(
        spotifyUrl,
      );
    } catch (error) {
      console.error(
        "Unable to open Spotify:",
        error,
      );

      Alert.alert(
        "Unable to open Spotify",
        "Canal could not open this track.",
      );
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
            color="#ff9a50"
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

  const isOnSoundscape =
    soundscape?.snapshotIds.includes(
      snapshot.id,
    ) ?? false;

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

          <Pressable
            accessibilityRole="button"
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
          <View
            style={styles.snapshotArtwork}
          >
            <Ionicons
              name="camera"
              size={45}
              color="#ff9a50"
            />
          </View>

          <View
            style={[
              styles.visibilityBadge,
              snapshot.visibility ===
                "public" &&
                styles.publicBadge,
            ]}
          >
            <Ionicons
              name={
                snapshot.visibility ===
                "public"
                  ? "globe-outline"
                  : "lock-closed-outline"
              }
              size={12}
              color={
                snapshot.visibility ===
                "public"
                  ? "#9ff3b5"
                  : "#c5cbc6"
              }
            />

            <Text
              style={
                styles.visibilityBadgeText
              }
            >
              {snapshot.pendingCloudSync
                ? "pending sync"
                : snapshot.visibility}
            </Text>
          </View>

          <Text
            style={styles.heading}
          >
            {snapshot.sceneName}
          </Text>

          <Text
            style={styles.dateText}
          >
            {formatSnapshotDate(
              snapshot.createdAt,
            )}
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
              color="#ffb27a"
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

        {!canEdit ? (
          <View
            style={styles.readOnlyCard}
          >
            <Ionicons
              name="eye-outline"
              size={20}
              color="#9ff3b5"
            />

            <Text
              style={styles.readOnlyText}
            >
              This is a public Snapshot.
              Only its creator can edit or
              delete it.
            </Text>
          </View>
        ) : null}

        <View
          style={styles.trackCard}
        >
          <View
            style={styles.trackIcon}
          >
            <Ionicons
              name="musical-note"
              size={27}
              color="#ff9a50"
            />
          </View>

          <View
            style={styles.trackCopy}
          >
            <Text
              style={styles.trackLabel}
            >
              CAPTURED TRACK
            </Text>

            <Text
              style={styles.trackTitle}
            >
              {snapshot.trackTitle ||
                "Scene moment"}
            </Text>

            {snapshot.trackArtist ? (
              <Text
                style={
                  styles.trackArtist
                }
              >
                {
                  snapshot.trackArtist
                }
              </Text>
            ) : null}
          </View>

          {snapshot.spotifyUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                void openSpotify();
              }}
              style={({ pressed }) => [
                styles.spotifyButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.spotifyButtonText
                }
              >
                SP
              </Text>
            </Pressable>
          ) : null}
        </View>

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
              placeholderTextColor="#777f79"
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
              placeholderTextColor="#777f79"
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
            accessibilityRole="button"
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

        <Pressable
          accessibilityRole="button"
          disabled={
            activeAction ===
            "soundscape"
          }
          onPress={() => {
            void toggleSoundscape();
          }}
          style={({ pressed }) => [
            styles.soundscapeButton,
            isOnSoundscape &&
              styles.onSoundscapeButton,
            activeAction ===
              "soundscape" &&
              styles.disabled,
            pressed &&
              styles.pressed,
          ]}
        >
          {activeAction ===
          "soundscape" ? (
            <ActivityIndicator
              color="#ff9a50"
            />
          ) : (
            <>
              <Ionicons
                name={
                  isOnSoundscape
                    ? "checkmark-circle"
                    : "person-circle-outline"
                }
                size={21}
                color={
                  isOnSoundscape
                    ? "#9ff3b5"
                    : "#ff9a50"
                }
              />

              <Text
                style={[
                  styles.soundscapeButtonText,
                  isOnSoundscape &&
                    styles.onSoundscapeButtonText,
                ]}
              >
                {isOnSoundscape
                  ? "Remove from Soundscape"
                  : "Add to Soundscape"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
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
            color="#ff9a50"
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
            accessibilityRole="button"
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
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 27,
  },

  notFoundTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
  },

  notFoundText: {
    color: "#8f9891",
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
    minHeight: 44,
    justifyContent: "center",
  },

  backText: {
    color: "#c5cbc6",
    fontSize: 14,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  headerAction: {
    color: "#ff9a50",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
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
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },

  dateText: {
    marginTop: 7,
    color: "#8f9891",
    fontSize: 11,
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
    color: "#ffb27a",
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
    color: "#b8d8c1",
    fontSize: 12,
    lineHeight: 18,
  },

  trackCard: {
    minHeight: 91,
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 20,
    backgroundColor: "#171c19",
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
    color: "#8f9891",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  trackTitle: {
    marginTop: 5,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  trackArtist: {
    marginTop: 4,
    color: "#aeb6b0",
    fontSize: 12,
  },

  spotifyButton: {
    width: 43,
    height: 43,
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
    borderColor: "#303833",
    borderRadius: 19,
    backgroundColor: "#171c19",
  },

  visibilityCopy: {
    flex: 1,
    paddingRight: 12,
  },

  visibilityTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  visibilityText: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 11,
    lineHeight: 16,
  },

  formCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 21,
    backgroundColor: "#171c19",
  },

  field: {
    gap: 9,
  },

  label: {
    color: "#ffffff",
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
    color: "#ffffff",
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
    color: "#ff9a50",
    fontSize: 13,
    fontWeight: "700",
  },

  onSoundscapeButtonText: {
    color: "#9ff3b5",
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
    backgroundColor: "#171c19",
  },

  secondaryButtonText: {
    color: "#ff9a50",
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
    color: "#ff9187",
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
