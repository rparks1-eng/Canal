import {
  useEffect,
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
  useLocalSearchParams,
} from "expo-router";

import {
  StatusBar,
} from "expo-status-bar";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  completeOnboarding,
} from "../lib/onboarding";

import type {
  OnboardingDestination,
} from "../lib/onboarding";

import {
  classifyAnalyticsFailure,
  recordAnalyticsFailure,
} from "../lib/analytics";

import {
  useAuth,
} from "../providers/auth-provider";

type OnboardingStep =
  | 0
  | 1
  | 2;

function parseStep(
  value:
    | string
    | undefined,
): OnboardingStep {
  if (
    value ===
    "shape"
  ) {
    return 1;
  }

  if (
    value ===
    "export"
  ) {
    return 2;
  }

  return 0;
}

export default function OnboardingScreen() {
  const params =
    useLocalSearchParams<{
      step?: string;
      spotify?: string;
    }>();

  const {
    user,
  } =
    useAuth();

  const [
    step,
    setStep,
  ] =
    useState<OnboardingStep>(
      parseStep(
        params.step,
      ),
    );

  const [
    finishing,
    setFinishing,
  ] = useState(false);

  const [
    spotifyConnectSkipped,
    setSpotifyConnectSkipped,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    setSpotifyConnectSkipped(
      params.spotify ===
        "skipped",
    );

    setFinishing(
      false,
    );

    setErrorMessage(
      "",
    );
  }, [
    params.spotify,
    user?.id,
  ]);

  useEffect(() => {
    setStep(
      parseStep(
        params.step,
      ),
    );
  }, [
    params.step,
  ]);

  const goToStep = (
    nextStep: OnboardingStep,
  ): void => {
    setErrorMessage("");
    setStep(
      nextStep,
    );
  };

  const finishOnboarding =
    async (
      destination:
        OnboardingDestination,
    ): Promise<void> => {
      if (
        finishing
      ) {
        return;
      }

      if (!user) {
        router.replace(
          "/login" as never,
        );

        return;
      }

      setFinishing(
        true,
      );

      setErrorMessage("");

      try {
        const expectedUserId =
          user.id;

        await completeOnboarding(
          expectedUserId,
          destination,
        );
      } catch (error) {
        void recordAnalyticsFailure(
          "onboarding_complete",
          classifyAnalyticsFailure(
            error,
          ),
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save your onboarding progress.",
        );

        setFinishing(
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
      <StatusBar style="dark" />

      <View
        style={
          styles.screen
        }
      >
        <View
          style={
            styles.header
          }
        >
          <Text
            style={
              styles.brand
            }
          >
            canal
          </Text>

          <Text
            style={
              styles.stepCount
            }
          >
            {step + 1} of 3
          </Text>
        </View>

        <View
          accessibilityLabel={`Onboarding step ${step + 1} of 3`}
          style={
            styles.progress
          }
        >
          {[
            "Connect",
            "Shape",
            spotifyConnectSkipped
              ? "Explore"
              : "Export",
          ].map(
            (
              label,
              index,
            ) => (
              <View
                key={
                  label
                }
                style={
                  styles.progressItem
                }
              >
                <View
                  style={[
                    styles.progressLine,

                    index <=
                      step &&
                      styles.progressLineActive,
                  ]}
                />

                <Text
                  style={[
                    styles.progressLabel,

                    index ===
                      step &&
                      styles.progressLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </View>
            ),
          )}
        </View>

        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {step ===
          0 ? (
            <ConnectStep />
          ) : null}

          {step ===
          1 ? (
            <ShapeStep
              spotifyConnectSkipped={
                spotifyConnectSkipped
              }
            />
          ) : null}

          {step ===
          2 ? (
            <ExportStep
              spotifyConnectSkipped={
                spotifyConnectSkipped
              }
            />
          ) : null}
        </ScrollView>

        {errorMessage ? (
          <View
            style={
              styles.errorCard
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.footer
          }
        >
          {step ===
          0 ? (
            <>
              <PrimaryButton
                label="Connect Spotify"
                onPress={() => {
                  router.push({
                    pathname:
                      "/connect-music",

                    params: {
                      mode:
                        "onboarding",
                    },
                  } as never);
                }}
              />

              <SecondaryButton
                label="Not now"
                onPress={() => {
                  setSpotifyConnectSkipped(
                    true,
                  );

                  goToStep(
                    1,
                  );
                }}
              />
            </>
          ) : null}

          {step ===
          1 ? (
            <>
              <PrimaryButton
                label={
                  spotifyConnectSkipped
                    ? "Next: Explore"
                    : "Next: Export"
                }
                onPress={() =>
                  goToStep(
                    2,
                  )
                }
              />

              <SecondaryButton
                label="Back"
                onPress={() =>
                  goToStep(
                    0,
                  )
                }
              />
            </>
          ) : null}

          {step ===
          2 ? (
            <>
              <PrimaryButton
                disabled={
                  finishing
                }
                label={
                  spotifyConnectSkipped
                    ? "Continue to Home"
                    : "Shape my first Scene"
                }
                loading={
                  finishing
                }
                onPress={() => {
                  if (
                    spotifyConnectSkipped
                  ) {
                    void finishOnboarding(
                      "/(tabs)",
                    );
                  } else {
                    void finishOnboarding(
                      "/scene-studio",
                    );
                  }
                }}
              />

              <SecondaryButton
                disabled={
                  finishing
                }
                label={
                  spotifyConnectSkipped
                    ? "Connect Spotify"
                    : "Go to Home"
                }
                onPress={() => {
                  if (
                    spotifyConnectSkipped
                  ) {
                    router.push({
                      pathname:
                        "/connect-music",

                      params: {
                        mode:
                          "onboarding",
                      },
                    } as never);
                  } else {
                    void finishOnboarding(
                      "/(tabs)",
                    );
                  }
                }}
              />

              <Pressable
                accessibilityLabel="Back to Shape"
                accessibilityRole="button"
                disabled={
                  finishing
                }
                onPress={() =>
                  goToStep(
                    1,
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.backLink,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.backLinkText
                  }
                >
                  Back
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ConnectStep() {
  return (
    <View
      style={
        styles.step
      }
    >
      <View
        style={
          styles.connectVisual
        }
      >
        <View
          style={
            styles.canalDisc
          }
        >
          <Text
            style={
              styles.canalDiscText
            }
          >
            c
          </Text>
        </View>

        <View
          style={
            styles.connector
          }
        >
          <View
            style={
              styles.connectorDot
            }
          />

          <View
            style={
              styles.connectorDot
            }
          />

          <View
            style={
              styles.connectorDot
            }
          />
        </View>

        <View
          style={
            styles.spotifyDisc
          }
        >
          <Text
            style={
              styles.spotifyDiscText
            }
          >
            SP
          </Text>
        </View>
      </View>

      <Text
        style={
          styles.eyebrow
        }
      >
        CONNECT
      </Text>

      <Text
        style={
          styles.title
        }
      >
        Start with music you already love.
      </Text>

      <Text
        style={
          styles.description
        }
      >
        Spotify gives Canal the artists,
        genres, and tracks it needs to build
        Scenes around your taste.
      </Text>

      <View
        style={
          styles.noteCard
        }
      >
        <Text
          style={
            styles.noteTitle
          }
        >
          Your call
        </Text>

        <Text
          style={
            styles.noteText
          }
        >
          Connecting Spotify is optional
          right now. You can explore Canal
          first and connect later from Music
          Services.
        </Text>
      </View>
    </View>
  );
}

function ShapeStep({
  spotifyConnectSkipped,
}: {
  spotifyConnectSkipped: boolean;
}) {
  return (
    <View
      style={
        styles.step
      }
    >
      <View
        style={
          styles.shapeVisual
        }
      >
        <View
          style={
            styles.scenePreviewHeader
          }
        >
          <Text
            style={
              styles.scenePreviewLabel
            }
          >
            {spotifyConnectSkipped
              ? "PUBLIC SCENE"
              : "YOUR SCENE"}
          </Text>

          <Text
            style={
              styles.scenePreviewName
            }
          >
            Late Night Focus
          </Text>
        </View>

        <View
          style={
            styles.chipRow
          }
        >
          <View
            style={[
              styles.chip,
              styles.orangeChip,
            ]}
          >
            <Text
              style={
                styles.orangeChipText
              }
            >
              Focused
            </Text>
          </View>

          <View
            style={[
              styles.chip,
              styles.greenChip,
            ]}
          >
            <Text
              style={
                styles.greenChipText
              }
            >
              Low energy
            </Text>
          </View>
        </View>

        <View
          style={
            styles.mixRow
          }
        >
          <View
            style={
              styles.mixCopy
            }
          >
            <Text
              style={
                styles.mixLabel
              }
            >
              Familiarity
            </Text>

            <Text
              style={
                styles.mixValue
              }
            >
              Balanced
            </Text>
          </View>

          <View
            style={
              styles.mixTrack
            }
          >
            <View
              style={
                styles.mixFill
              }
            />
          </View>
        </View>
      </View>

      <Text
        style={
          styles.eyebrow
        }
      >
        SHAPE
      </Text>

      <Text
        style={
          styles.title
        }
      >
        Tell Canal what the moment needs.
      </Text>

      <Text
        style={
          styles.description
        }
      >
        {spotifyConnectSkipped
          ? "Explore how creators shape activity, mood, energy, duration, and artist mix. Connect Spotify when you want to create your own."
          : "Set the activity, mood, energy, duration, and artist mix. Canal turns those choices into one cohesive Scene."}
      </Text>

      <View
        style={
          styles.detailRow
        }
      >
        <Detail
          number="01"
          text="Pick the feeling"
        />

        <Detail
          number="02"
          text="Control the arc"
        />

        <Detail
          number="03"
          text="Tune the mix"
        />
      </View>
    </View>
  );
}

function ExportStep({
  spotifyConnectSkipped,
}: {
  spotifyConnectSkipped: boolean;
}) {
  if (
    spotifyConnectSkipped
  ) {
    return (
      <View
        style={
          styles.step
        }
      >
        <View
          style={
            styles.exploreVisual
          }
        >
          <Text
            style={
              styles.exploreVisualMark
            }
          >
            c
          </Text>
        </View>

        <Text
          style={
            styles.eyebrow
          }
        >
          EXPLORE
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Start with Canal. Connect when you’re ready.
        </Text>

        <Text
          style={
            styles.description
          }
        >
          Explore public Scenes and creator profiles now. Connect Spotify later from Music Services when you want to shape and export your own Scene.
        </Text>

        <View
          style={
            styles.noteCard
          }
        >
          <Text
            style={
              styles.noteTitle
            }
          >
            Explore now
          </Text>

          <Text
            style={
              styles.noteText
            }
          >
            Your Home and Explore feeds are ready. Spotify stays optional until you choose to create.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={
        styles.step
      }
    >
      <View
        style={
          styles.exportVisual
        }
      >
        <View
          style={
            styles.cover
          }
        >
          <View
            style={
              styles.waveRow
            }
          >
            {[
              35,
              62,
              48,
              78,
              52,
              67,
              39,
            ].map(
              (
                height,
                index,
              ) => (
                <View
                  key={
                    `${height}-${index}`
                  }
                  style={[
                    styles.waveBar,

                    {
                      height,
                    },
                  ]}
                />
              ),
            )}
          </View>
        </View>

        <View
          style={
            styles.exportCopy
          }
        >
          <Text
            style={
              styles.exportLabel
            }
          >
            READY TO EXPORT
          </Text>

          <Text
            style={
              styles.exportName
            }
          >
            Late Night Focus
          </Text>

          <Text
            style={
              styles.exportMeta
            }
          >
            18 tracks · 58 minutes
          </Text>
        </View>
      </View>

      <Text
        style={
          styles.eyebrow
        }
      >
        EXPORT
      </Text>

      <Text
        style={
          styles.title
        }
      >
        Keep the Scene wherever you listen.
      </Text>

      <Text
        style={
          styles.description
        }
      >
        Preview the final flow, make it
        yours, and export it to Spotify as a
        playlist when it feels right.
      </Text>

      <View
        style={
          styles.noteCard
        }
      >
        <Text
          style={
            styles.noteTitle
          }
        >
          You stay in control
        </Text>

        <Text
          style={
            styles.noteText
          }
        >
          Canal never exports until you
          choose to. You can also save a
          Scene in Canal and return to it
          later.
        </Text>
      </View>
    </View>
  );
}

function Detail(
  props: {
    number: string;
    text: string;
  },
) {
  return (
    <View
      style={
        styles.detail
      }
    >
      <Text
        style={
          styles.detailNumber
        }
      >
        {props.number}
      </Text>

      <Text
        style={
          styles.detailText
        }
      >
        {props.text}
      </Text>
    </View>
  );
}

function PrimaryButton(
  props: {
    label: string;
    loading?: boolean;
    disabled?: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityLabel={
        props.label
      }
      accessibilityRole="button"
      disabled={
        props.disabled
      }
      onPress={
        props.onPress
      }
      style={({
        pressed,
      }) => [
        styles.primaryButton,

        props.disabled &&
          styles.disabled,

        pressed &&
          styles.pressed,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator
          color="#FFFFFF"
        />
      ) : (
        <Text
          style={
            styles.primaryButtonText
          }
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}

function SecondaryButton(
  props: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityLabel={
        props.label
      }
      accessibilityRole="button"
      disabled={
        props.disabled
      }
      onPress={
        props.onPress
      }
      style={({
        pressed,
      }) => [
        styles.secondaryButton,

        props.disabled &&
          styles.disabled,

        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={
          styles.secondaryButtonText
        }
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#F3EFE5",
    },

    screen: {
      flex: 1,
    },

    header: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 24,
      paddingTop: 10,
    },

    brand: {
      color: "#4C46C8",
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -1,
    },

    stepCount: {
      color: "#6D6B64",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
    },

    progress: {
      flexDirection:
        "row",
      gap: 8,
      paddingHorizontal: 24,
      marginTop: 20,
    },

    progressItem: {
      flex: 1,
    },

    progressLine: {
      height: 4,
      borderRadius: 2,
      backgroundColor:
        "#E9DED5",
    },

    progressLineActive: {
      backgroundColor:
        "#4C46C8",
    },

    progressLabel: {
      color: "#A49B94",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
      marginTop: 7,
      textTransform:
        "uppercase",
    },

    progressLabelActive: {
      color: "#473C34",
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 28,
    },

    step: {
      flex: 1,
    },

    eyebrow: {
      color: "#4C46C8",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.8,
      marginTop: 26,
    },

    title: {
      fontFamily: "Georgia",
      color: "#1A1816",
      fontSize: 33,
      lineHeight: 39,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 8,
    },

    description: {
      color: "#6D6B64",
      fontSize: 15,
      lineHeight: 23,
      marginTop: 12,
    },

    connectVisual: {
      minHeight: 190,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#EBDDD3",
      borderRadius: 28,
      backgroundColor:
        "#FFFFFF",
    },

    canalDisc: {
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

    canalDiscText: {
      color: "#FFFFFF",
      fontSize: 44,
      fontWeight: "900",
      marginTop: -6,
    },

    connector: {
      flexDirection:
        "row",
      gap: 7,
      marginHorizontal: 18,
    },

    connectorDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#D7CCC3",
    },

    spotifyDisc: {
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1ED760",
    },

    spotifyDiscText: {
      color: "#07130B",
      fontSize: 18,
      fontWeight: "900",
    },

    noteCard: {
      borderWidth: 1,
      borderColor:
        "#F0DED0",
      borderRadius: 20,
      backgroundColor:
        "#FFF1E7",
      padding: 17,
      marginTop: 24,
    },

    noteTitle: {
      color: "#4E2C17",
      fontSize: 14,
      fontWeight: "900",
    },

    noteText: {
      color: "#76533C",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 6,
    },

    shapeVisual: {
      minHeight: 218,
      borderRadius: 28,
      backgroundColor:
        "#191A18",
      padding: 22,
    },

    scenePreviewHeader: {
      borderBottomWidth: 1,
      borderBottomColor:
        "#3A342F",
      paddingBottom: 17,
    },

    scenePreviewLabel: {
      color: "#F8954C",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    scenePreviewName: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "800",
      marginTop: 6,
    },

    chipRow: {
      flexDirection:
        "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 18,
    },

    chip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },

    orangeChip: {
      backgroundColor:
        "#402719",
    },

    orangeChipText: {
      color: "#FFAA70",
      fontSize: 11,
      fontWeight: "800",
    },

    greenChip: {
      backgroundColor:
        "#183323",
    },

    greenChipText: {
      color: "#8FE3AA",
      fontSize: 11,
      fontWeight: "800",
    },

    mixRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      marginTop: 24,
    },

    mixCopy: {
      width: 96,
    },

    mixLabel: {
      color: "#8F8882",
      fontSize: 10,
      fontWeight: "700",
    },

    mixValue: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "800",
      marginTop: 3,
    },

    mixTrack: {
      flex: 1,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#3A342F",
    },

    mixFill: {
      width: "64%",
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#4C46C8",
    },

    detailRow: {
      flexDirection:
        "row",
      gap: 8,
      marginTop: 24,
    },

    detail: {
      flex: 1,
      minHeight: 78,
      borderWidth: 1,
      borderColor:
        "#E8DED6",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      padding: 12,
    },

    detailNumber: {
      color: "#4C46C8",
      fontSize: 10,
      fontWeight: "900",
    },

    detailText: {
      color: "#4E4640",
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "800",
      marginTop: 8,
    },

    exportVisual: {
      minHeight: 210,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderRadius: 28,
      backgroundColor:
        "#E96722",
      padding: 20,
    },

    exploreVisual: {
      minHeight: 210,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 28,
      backgroundColor:
        "#191A18",
    },

    exploreVisualMark: {
      color: "#4C46C8",
      fontSize: 82,
      fontWeight: "900",
      lineHeight: 90,
    },

    cover: {
      width: 126,
      height: 142,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#2A1911",
    },

    waveRow: {
      height: 84,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
    },

    waveBar: {
      width: 7,
      borderRadius: 4,
      backgroundColor:
        "#FF8C40",
    },

    exportCopy: {
      flex: 1,
      marginLeft: 18,
    },

    exportLabel: {
      color: "#3D1C0A",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    exportName: {
      color: "#FFFFFF",
      fontSize: 21,
      lineHeight: 26,
      fontWeight: "900",
      marginTop: 8,
    },

    exportMeta: {
      color: "#FFE4D2",
      fontSize: 11,
      fontWeight: "700",
      marginTop: 8,
    },

    errorCard: {
      borderWidth: 1,
      borderColor:
        "#E5B5B0",
      borderRadius: 13,
      backgroundColor:
        "#FFF0EE",
      padding: 11,
      marginHorizontal: 24,
      marginBottom: 10,
    },

    errorText: {
      color: "#8D2F29",
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
    },

    footer: {
      gap: 9,
      borderTopWidth: 1,
      borderTopColor:
        "#EEE3DB",
      backgroundColor:
        "#F3EFE5",
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 8,
    },

    primaryButton: {
      minHeight: 56,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 18,
      backgroundColor:
        "#4C46C8",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    secondaryButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#DDD0C6",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
    },

    secondaryButtonText: {
      color: "#514841",
      fontSize: 14,
      fontWeight: "800",
    },

    backLink: {
      alignItems:
        "center",
      justifyContent:
        "center",
      minHeight: 48,
    },

    backLinkText: {
      color: "#6D6B64",
      fontSize: 12,
      fontWeight: "700",
    },

    disabled: {
      opacity: 0.55,
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
