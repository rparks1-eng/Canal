import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
} from "expo-router";
import {
    useCallback,
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
    shareStageInvite,
} from "../../lib/canal-invites";
import {
    advanceLiveStageTrack,
    endLiveStage,
    getCurrentLiveStageTrack,
    joinLiveStage,
    leaveLiveStage,
    LiveStage,
    readLiveStage,
} from "../../lib/live-stages";
import {
    createSnapshot,
} from "../../lib/snapshots";
import {
    readSoundscape,
} from "../../lib/soundscape";

export default function LiveStageScreen() {
  const params =
    useLocalSearchParams();

  const stageId =
    firstParam(params.stageId);

  const [stage, setStage] =
    useState<LiveStage | null>(
      null,
    );

  const [
    currentUsername,
    setCurrentUsername,
  ] = useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isUpdating, setIsUpdating] =
    useState(false);

  const [
    newSnapshotId,
    setNewSnapshotId,
  ] = useState("");

  const loadStage =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const [
          storedStage,
          profile,
        ] = await Promise.all([
          readLiveStage(
            stageId,
          ),
          readSoundscape(),
        ]);

        setStage(storedStage);

        setCurrentUsername(
          profile.username,
        );
      } catch (error) {
        console.error(
          "Unable to load Stage:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load this Stage.",
        );
      } finally {
        setIsLoading(false);
      }
    }, [stageId]);

  useFocusEffect(
    useCallback(() => {
      void loadStage();
    }, [loadStage]),
  );

  async function joinStage() {
    if (!stage) {
      return;
    }

    try {
      setIsUpdating(true);

      const updatedStage =
        await joinLiveStage(
          stage.id,
        );

      setStage(updatedStage);
    } catch (error) {
      console.error(
        "Unable to join Stage:",
        error,
      );

      Alert.alert(
        "Unable to join",
        "Canal could not join this Stage.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function leaveStage() {
    if (!stage) {
      return;
    }

    try {
      setIsUpdating(true);

      await leaveLiveStage(
        stage.id,
      );

      router.replace(
        "/(tabs)/live",
      );
    } catch (error) {
      console.error(
        "Unable to leave Stage:",
        error,
      );

      Alert.alert(
        "Unable to leave",
        "Canal could not leave this Stage.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function advanceTrack() {
    if (!stage) {
      return;
    }

    try {
      setIsUpdating(true);

      const updatedStage =
        await advanceLiveStageTrack(
          stage.id,
        );

      setStage(updatedStage);
    } catch (error) {
      console.error(
        "Unable to advance track:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not move to the next track.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  function confirmEndStage() {
    if (!stage) {
      return;
    }

    Alert.alert(
      "End this Stage?",
      "Everyone will see that the Stage has ended.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "End Stage",
          style: "destructive",
          onPress: () => {
            void finishStage();
          },
        },
      ],
    );
  }

  async function finishStage() {
    if (!stage) {
      return;
    }

    try {
      setIsUpdating(true);

      const updatedStage =
        await endLiveStage(
          stage.id,
        );

      setStage(updatedStage);
    } catch (error) {
      console.error(
        "Unable to end Stage:",
        error,
      );

      Alert.alert(
        "Unable to end",
        "Canal could not end this Stage.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleShare() {
    if (!stage) {
      return;
    }

    try {
      const result =
        await shareStageInvite(
          stage,
        );

      if (
        result.method ===
        "clipboard"
      ) {
        Alert.alert(
          "Stage invite copied",
          "The Stage invite and code were copied to your clipboard.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share this Stage.",
      );
    }
  }

  async function captureSnapshot() {
    if (!stage) {
      return;
    }

    const currentTrack =
      getCurrentLiveStageTrack(
        stage,
      );

    try {
      const snapshot =
        await createSnapshot({
          sceneId:
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
            currentTrack?.spotifyUrl,
          positionMs: 0,
          note:
            "Captured during a live Canal Stage.",
          mood:
            stage.activity,
          visibility:
            stage.visibility,
        });

      setNewSnapshotId(
        snapshot.id,
      );

      Alert.alert(
        "Snapshot captured",
        "This Stage moment was saved.",
      );
    } catch (error) {
      console.error(
        "Unable to capture Snapshot:",
        error,
      );

      Alert.alert(
        "Unable to capture",
        "Canal could not save this Snapshot.",
      );
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

  if (!stage) {
    return (
      <SafeAreaView
        style={styles.screen}
      >
        <View
          style={styles.centered}
        >
          <Text
            style={
              styles.notFoundTitle
            }
          >
            Stage not found
          </Text>

          <Text
            style={
              styles.notFoundText
            }
          >
            This Stage may have been
            removed.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/live",
              )
            }
            style={
              styles.primaryButton
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Return to Live
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentTrack =
    getCurrentLiveStageTrack(
      stage,
    );

  const isHost =
    stage.hostUsername ===
    currentUsername;

  const hasJoined =
    stage.participants.some(
      (participant) =>
        participant.username ===
        currentUsername,
    );

  const isEnded =
    stage.status === "ended";

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
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/live",
              )
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
              ‹ Live
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Stage
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
              Invite
            </Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View
            style={[
              styles.stageArtwork,
              isEnded &&
                styles.endedArtwork,
            ]}
          >
            <Ionicons
              name={
                isEnded
                  ? "stop-circle-outline"
                  : "radio"
              }
              size={45}
              color={
                isEnded
                  ? "#8f9891"
                  : "#ff9a50"
              }
            />
          </View>

          <View
            style={[
              styles.statusBadge,
              isEnded &&
                styles.endedBadge,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isEnded &&
                  styles.endedDot,
              ]}
            />

            <Text
              style={[
                styles.statusText,
                isEnded &&
                  styles.endedStatusText,
              ]}
            >
              {isEnded
                ? "ENDED"
                : "LIVE"}
            </Text>
          </View>

          <Text
            style={styles.heading}
          >
            {stage.name}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname:
                  "/friend/[username]",
                params: {
                  username:
                    stage.hostUsername,
                },
              })
            }
          >
            <Text
              style={styles.hostText}
            >
              Hosted by{" "}
              {stage.hostName}
            </Text>

            <Text
              style={
                styles.hostUsername
              }
            >
              @{stage.hostUsername}
            </Text>
          </Pressable>

          <Text
            style={styles.activityText}
          >
            {stage.activity}
          </Text>
        </View>

        <View
          style={styles.codeCard}
        >
          <View>
            <Text
              style={styles.codeLabel}
            >
              STAGE CODE
            </Text>

            <Text
              style={styles.codeText}
            >
              {stage.code}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleShare();
            }}
            style={({ pressed }) => [
              styles.codeShareButton,
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
                styles.codeShareText
              }
            >
              Share
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.nowPlayingCard}
        >
          <Text
            style={
              styles.cardEyebrow
            }
          >
            {isEnded
              ? "LAST PLAYED"
              : "NOW PLAYING"}
          </Text>

          {currentTrack ? (
            <>
              <View
                style={
                  styles.trackArtwork
                }
              >
                <Ionicons
                  name="musical-note"
                  size={31}
                  color="#ff9a50"
                />
              </View>

              <Text
                style={
                  styles.trackTitle
                }
              >
                {currentTrack.title}
              </Text>

              <Text
                style={
                  styles.trackArtist
                }
              >
                {currentTrack.artist}
              </Text>

              <Text
                style={
                  styles.trackPosition
                }
              >
                Track{" "}
                {stage.currentTrackIndex +
                  1}{" "}
                of {stage.tracks.length}
              </Text>
            </>
          ) : (
            <Text
              style={styles.emptyText}
            >
              No track selected.
            </Text>
          )}

          {!isEnded ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void captureSnapshot();
              }}
              style={({ pressed }) => [
                styles.snapshotButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Ionicons
                name="camera-outline"
                size={20}
                color="#17110c"
              />

              <Text
                style={
                  styles.snapshotButtonText
                }
              >
                Capture Snapshot
              </Text>
            </Pressable>
          ) : null}

          {newSnapshotId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname:
                    "/snapshots/[snapshotId]",
                  params: {
                    snapshotId:
                      newSnapshotId,
                  },
                })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                View New Snapshot
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <View
            style={
              styles.sectionHeader
            }
          >
            <View>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                In this Stage
              </Text>

              <Text
                style={
                  styles.sectionDescription
                }
              >
                People currently
                participating.
              </Text>
            </View>

            <Text
              style={
                styles.participantTotal
              }
            >
              {
                stage.participants
                  .length
              }
            </Text>
          </View>

          <View
            style={styles.participantList}
          >
            {stage.participants.map(
              (participant) => (
                <Pressable
                  key={
                    participant.username
                  }
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname:
                        "/friend/[username]",
                      params: {
                        username:
                          participant.username,
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.participantRow,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={
                      styles.participantAvatar
                    }
                  >
                    <Text
                      style={
                        styles.participantInitials
                      }
                    >
                      {
                        participant.initials
                      }
                    </Text>
                  </View>

                  <View
                    style={
                      styles.participantInformation
                    }
                  >
                    <Text
                      style={
                        styles.participantName
                      }
                    >
                      {
                        participant.displayName
                      }
                    </Text>

                    <Text
                      style={
                        styles.participantUsername
                      }
                    >
                      @
                      {
                        participant.username
                      }
                    </Text>
                  </View>

                  {participant.username ===
                  stage.hostUsername ? (
                    <View
                      style={
                        styles.hostBadge
                      }
                    >
                      <Text
                        style={
                          styles.hostBadgeText
                        }
                      >
                        HOST
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ),
            )}
          </View>
        </View>

        {!isEnded ? (
          <View
            style={styles.actions}
          >
            {!hasJoined ? (
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => {
                  void joinStage();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  isUpdating &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Join Stage
                </Text>
              </Pressable>
            ) : null}

            {isHost ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdating}
                  onPress={() => {
                    void advanceTrack();
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    isUpdating &&
                      styles.disabled,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator
                      color="#17110c"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="play-skip-forward"
                        size={20}
                        color="#17110c"
                      />

                      <Text
                        style={
                          styles.primaryButtonText
                        }
                      >
                        Next Track
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={
                    confirmEndStage
                  }
                  style={({ pressed }) => [
                    styles.endButton,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={
                      styles.endButtonText
                    }
                  >
                    End Stage
                  </Text>
                </Pressable>
              </>
            ) : hasJoined ? (
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => {
                  void leaveStage();
                }}
                style={({ pressed }) => [
                  styles.leaveButton,
                  isUpdating &&
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
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/live",
              )
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Return to Live
            </Text>
          </Pressable>
        )}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    paddingHorizontal: 26,
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

  page: {
    paddingHorizontal: 23,
    paddingTop: 10,
    paddingBottom: 42,
    gap: 23,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 80,
    minHeight: 44,
    justifyContent: "center",
  },

  backText: {
    color: "#c5cbc6",
    fontSize: 15,
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

  stageArtwork: {
    width: 142,
    height: 142,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 42,
    backgroundColor: "#2b1d14",
  },

  endedArtwork: {
    backgroundColor: "#242925",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: "#3b1c19",
  },

  endedBadge: {
    backgroundColor: "#2d332f",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ff5f57",
  },

  endedDot: {
    backgroundColor: "#8f9891",
  },

  statusText: {
    color: "#ff9187",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  endedStatusText: {
    color: "#c5cbc6",
  },

  heading: {
    marginTop: 10,
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },

  hostText: {
    marginTop: 9,
    color: "#c5cbc6",
    fontSize: 13,
    textAlign: "center",
  },

  hostUsername: {
    marginTop: 3,
    color: "#ff9a50",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  activityText: {
    marginTop: 10,
    color: "#8f9891",
    fontSize: 13,
    textAlign: "center",
  },

  codeCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 20,
    backgroundColor: "#211810",
  },

  codeLabel: {
    color: "#bca99b",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  codeText: {
    marginTop: 5,
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 4,
  },

  codeShareButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 14,
  },

  codeShareText: {
    color: "#ff9a50",
    fontSize: 12,
    fontWeight: "800",
  },

  nowPlayingCard: {
    alignItems: "center",
    gap: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 23,
    backgroundColor: "#171c19",
  },

  cardEyebrow: {
    color: "#ff9a50",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  trackArtwork: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    borderRadius: 25,
    backgroundColor: "#2b1d14",
  },

  trackTitle: {
    marginTop: 5,
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },

  trackArtist: {
    color: "#aeb6b0",
    fontSize: 13,
  },

  trackPosition: {
    color: "#777f79",
    fontSize: 10,
    fontWeight: "700",
  },

  snapshotButton: {
    minHeight: 51,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  snapshotButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  section: {
    gap: 11,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },

  sectionDescription: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 12,
  },

  participantTotal: {
    color: "#ff9a50",
    fontSize: 17,
    fontWeight: "800",
  },

  participantList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 19,
    backgroundColor: "#171c19",
  },

  participantRow: {
    minHeight: 71,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#292f2b",
  },

  participantAvatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderRadius: 22,
    backgroundColor: "#2b1d14",
  },

  participantInitials: {
    color: "#ff9a50",
    fontSize: 12,
    fontWeight: "800",
  },

  participantInformation: {
    flex: 1,
  },

  participantName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  participantUsername: {
    marginTop: 4,
    color: "#8f9891",
    fontSize: 11,
  },

  hostBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: "#1d5b32",
  },

  hostBadgeText: {
    color: "#9ff3b5",
    fontSize: 8,
    fontWeight: "900",
  },

  actions: {
    gap: 11,
  },

  primaryButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
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

  leaveButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 16,
    backgroundColor: "#211810",
  },

  leaveButtonText: {
    color: "#ff9a50",
    fontSize: 13,
    fontWeight: "700",
  },

  endButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4f302d",
    borderRadius: 16,
    backgroundColor: "#1d1514",
  },

  endButtonText: {
    color: "#ff9187",
    fontSize: 13,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8f9891",
    fontSize: 13,
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