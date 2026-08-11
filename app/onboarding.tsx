import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import * as Haptics from "expo-haptics";

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
  OnboardingAtmosphere,
  OnboardingButton,
  OnboardingChoice,
  OnboardingHeader,
  OnboardingPanel,
  useOnboardingPalette,
} from "../components/auth-onboarding-ui";

import type {
  OnboardingPalette,
} from "../components/auth-onboarding-ui";

import {
  CanalAvatar,
} from "../components/canal-avatar";

import {
  classifyAnalyticsFailure,
  recordAnalyticsFailure,
} from "../lib/analytics";

import {
  readPublicSceneReturn,
} from "../lib/auth-return";

import {
  completeOnboarding,
} from "../lib/onboarding";

import type {
  OnboardingDestination,
} from "../lib/onboarding";

import {
  writeOnboardingSceneSeed,
} from "../lib/onboarding-scene-seed";

import {
  readSpotifySession,
} from "../lib/spotify-auth";

import {
  useAuth,
} from "../providers/auth-provider";

type OnboardingStep =
  | 0
  | 1
  | 2
  | 3
  | 4;

const STEP_LABELS = [
  "Music",
  "Identity",
  "Taste",
  "First Scene",
  "Ready",
] as const;

const STEP_PALETTES:
  readonly OnboardingPalette[] = [
    "verdant",
    "ember",
    "violet",
    "rose",
    "tidal",
  ];

const ACTIVITIES = [
  "Focus",
  "Commute",
  "Workout",
  "Cook",
  "Wind down",
  "Host friends",
] as const;

const MOODS = [
  "Calm",
  "Bright",
  "Dreamy",
  "Confident",
  "Reflective",
  "Energized",
  "Warm",
  "Nostalgic",
] as const;

const GENRES = [
  "Alternative R&B",
  "Hip-hop",
  "Electronic",
  "Ambient",
  "Indie",
  "Soul",
] as const;

function parseStep(
  value:
    | string
    | undefined,
): OnboardingStep {
  if (
    value ===
      "identity" ||
    value ===
      "shape"
  ) {
    return 1;
  }

  if (
    value ===
    "taste"
  ) {
    return 2;
  }

  if (
    value ===
    "scene"
  ) {
    return 3;
  }

  if (
    value ===
      "ready" ||
    value ===
      "export"
  ) {
    return 4;
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
    width,
  } =
    useWindowDimensions();
  const colorScheme =
    useColorScheme();
  const {
    profile,
    user,
  } =
    useAuth();
  const [
    step,
    setStep,
  ] = useState<OnboardingStep>(
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
  ] = useState(
    params.spotify ===
      "skipped",
  );
  const [
    storedSpotifyConnected,
    setStoredSpotifyConnected,
  ] = useState(
    params.spotify ===
      "connected",
  );
  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");
  const [
    activity,
    setActivity,
  ] = useState<string | null>(
    null,
  );
  const [
    moods,
    setMoods,
  ] = useState<string[]>(
    [],
  );
  const [
    genres,
    setGenres,
  ] = useState<string[]>([
    "Alternative R&B",
    "Hip-hop",
    "Electronic",
  ]);
  const [
    familiarity,
    setFamiliarity,
  ] = useState<
    | "Discovery"
    | "Balanced"
    | "Familiar"
  >(
    "Balanced",
  );
  const [
    allowAdjacent,
    setAllowAdjacent,
  ] = useState(true);
  const [
    allowExplicit,
    setAllowExplicit,
  ] = useState(false);
  const [
    directRequest,
    setDirectRequest,
  ] = useState("");
  const [
    validationMessage,
    setValidationMessage,
  ] = useState("");
  const [
    hasSharedSceneReturn,
    setHasSharedSceneReturn,
  ] = useState(false);

  const palette =
    STEP_PALETTES[
      step
    ];
  const colors =
    useOnboardingPalette(
      palette,
    );
  const isWide =
    width >= 760;
  const spotifyConnected =
    (
      params.spotify ===
        "connected" ||
      storedSpotifyConnected
    ) &&
    !spotifyConnectSkipped;
  const sceneName =
    useMemo(
      () =>
        buildFirstSceneName(
          activity,
          moods,
        ),
      [
        activity,
        moods,
      ],
    );

  useEffect(() => {
    let active =
      true;

    if (
      params.spotify ===
      "connected"
    ) {
      setStoredSpotifyConnected(
        true,
      );
      setSpotifyConnectSkipped(
        false,
      );
    } else if (
      params.spotify ===
      "skipped"
    ) {
      setSpotifyConnectSkipped(
        true,
      );
    }

    readSpotifySession()
      .then(
        (session) => {
          if (!active) {
            return;
          }

          const connected =
            Boolean(
              session,
            );

          setStoredSpotifyConnected(
            connected,
          );

          if (connected) {
            setSpotifyConnectSkipped(
              false,
            );
          }
        },
      )
      .catch(() => {
        /*
         * Preserve the callback hint and keep onboarding usable
         * when secure local Spotify storage is temporarily
         * unavailable.
         */
      });

    setFinishing(
      false,
    );
    setErrorMessage("");

    return () => {
      active = false;
    };
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

  useEffect(() => {
    let active =
      true;

    readPublicSceneReturn()
      .then(
        (destination) => {
          if (active) {
            setHasSharedSceneReturn(
              Boolean(
                destination,
              ),
            );
          }
        },
      )
      .catch(() => {
        if (active) {
          setHasSharedSceneReturn(
            false,
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const goToStep = (
    nextStep: OnboardingStep,
  ): void => {
    setErrorMessage("");
    setValidationMessage("");
    setStep(
      nextStep,
    );
    void Haptics.selectionAsync();
  };

  const goForward = (): void => {
    if (
      step ===
        2 &&
      !activity
    ) {
      setValidationMessage(
        "Choose at least one activity before continuing.",
      );
      return;
    }

    if (
      step ===
        2 &&
      moods.length ===
        0
    ) {
      setValidationMessage(
        "Choose at least one mood before continuing.",
      );
      return;
    }

    goToStep(
      Math.min(
        4,
        step + 1,
      ) as OnboardingStep,
    );
  };

  const finishOnboarding =
    async (
      destination:
        OnboardingDestination,
    ): Promise<void> => {
      if (finishing) {
        return;
      }

      if (!user) {
        router.replace(
          "/login" as never,
        );
        return;
      }

      setFinishing(true);
      setErrorMessage("");

      try {
        const expectedUserId =
          user.id;

        if (
          activity &&
          moods.length > 0
        ) {
          await writeOnboardingSceneSeed(
            expectedUserId,
            {
              activity,
              moods,
              genres,
              familiarity,
              allowAdjacentGenres:
                allowAdjacent,
              allowExplicit,
              notes:
                directRequest,
            },
          );
        }

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
        setFinishing(false);
      }
    };

  const goToHome =
    (): void => {
      void finishOnboarding(
        "/(tabs)",
      );
    };

  const toggleMood = (
    mood: string,
  ): void => {
    setValidationMessage("");
    setMoods(
      (current) => {
        if (
          current.includes(
            mood,
          )
        ) {
          return current.filter(
            (value) =>
              value !==
              mood,
          );
        }

        if (
          current.length >=
          5
        ) {
          setValidationMessage(
            "You can choose up to five moods. Remove one before adding another.",
          );
          return current;
        }

        return [
          ...current,
          mood,
        ];
      },
    );
    void Haptics.selectionAsync();
  };

  const toggleGenre = (
    genre: string,
  ): void => {
    setGenres(
      (current) =>
        current.includes(
          genre,
        )
          ? current.filter(
              (value) =>
                value !==
                genre,
            )
          : [
              ...current,
              genre,
            ].slice(
              -5,
            ),
    );
    void Haptics.selectionAsync();
  };

  const actionLabel =
    step ===
    4
      ? hasSharedSceneReturn
        ? "Continue to shared Scene"
        : spotifyConnectSkipped
          ? "Enter Canal"
          : "Shape my first Scene"
      : step ===
          3
        ? "Use this direction"
        : "Continue";

  return (
    <View
      style={
        styles.screen
      }
    >
      <StatusBar
        style={
          colorScheme ===
          "dark"
            ? "light"
            : "dark"
        }
      />
      <OnboardingAtmosphere
        palette={
          palette
        }
      />

      <SafeAreaView
        edges={[
          "top",
          "bottom",
        ]}
        style={
          styles.safeArea
        }
      >
        <KeyboardAvoidingView
          behavior={
            process.env.EXPO_OS ===
            "ios"
              ? "padding"
              : undefined
          }
          style={
            styles.screen
          }
        >
          <View
            style={
              styles.headerWrap
            }
          >
            <OnboardingHeader
              onSkip={
                step === 0
                  ? () => {
                      setSpotifyConnectSkipped(
                        true,
                      );
                      goToStep(
                        1,
                      );
                    }
                  : step < 4
                    ? goToHome
                  : undefined
              }
              palette={
                palette
              }
              skipLabel={
                step ===
                0
                  ? "Not now"
                  : "Go to Home"
              }
              step={
                step
              }
              stepLabel={`${STEP_LABELS[step]} · ${step + 1} of ${STEP_LABELS.length}`}
              totalSteps={
                STEP_LABELS.length
              }
            />
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.content,
              isWide &&
                styles.contentWide,
            ]}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={
              false
            }
          >
            {step ===
            0 ? (
              <MusicStep
                connected={
                  spotifyConnected
                }
                colors={
                  colors
                }
                onConnect={() =>
                  router.push({
                    pathname:
                      "/connect-music",
                    params: {
                      mode:
                        "onboarding",
                    },
                  } as never)
                }
                palette={
                  palette
                }
              />
            ) : null}

            {step ===
            1 ? (
              <IdentityStep
                avatarUrl={
                  user?.user_metadata?.avatar_url ??
                  user?.user_metadata?.picture
                }
                colors={
                  colors
                }
                displayName={
                  profile?.displayName ??
                  user?.user_metadata
                    ?.display_name ??
                  "Your Canal"
                }
                handle={
                  profile?.handle ??
                  "@yourhandle"
                }
                onChoosePhoto={() =>
                  router.push(
                    "/profile-picture" as never,
                  )
                }
                palette={
                  palette
                }
              />
            ) : null}

            {step ===
            2 ? (
              <TasteStep
                activity={
                  activity
                }
                allowAdjacent={
                  allowAdjacent
                }
                allowExplicit={
                  allowExplicit
                }
                colors={
                  colors
                }
                familiarity={
                  familiarity
                }
                genres={
                  genres
                }
                moods={
                  moods
                }
                onActivity={
                  setActivity
                }
                onAdjacent={
                  setAllowAdjacent
                }
                onExplicit={
                  setAllowExplicit
                }
                onFamiliarity={
                  setFamiliarity
                }
                onGenre={
                  toggleGenre
                }
                onMood={
                  toggleMood
                }
                palette={
                  palette
                }
                spotifyConnected={
                  spotifyConnected
                }
                validationMessage={
                  validationMessage
                }
              />
            ) : null}

            {step ===
            3 ? (
              <FirstSceneStep
                activity={
                  activity
                }
                colors={
                  colors
                }
                directRequest={
                  directRequest
                }
                familiarity={
                  familiarity
                }
                moods={
                  moods
                }
                onDirectRequest={
                  setDirectRequest
                }
                palette={
                  palette
                }
                sceneName={
                  sceneName
                }
              />
            ) : null}

            {step ===
            4 ? (
              <ReadyStep
                colors={
                  colors
                }
                hasSharedSceneReturn={
                  hasSharedSceneReturn
                }
                palette={
                  palette
                }
                sceneName={
                  sceneName
                }
              />
            ) : null}
          </ScrollView>

          {errorMessage ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              selectable
              style={[
                styles.errorText,
                {
                  color:
                    colors.danger,
                  borderColor:
                    colors.line,
                  backgroundColor:
                    colors.glassStrong,
                },
              ]}
            >
              {errorMessage}
            </Text>
          ) : null}

          <View
            style={[
              styles.footer,
              {
                borderColor:
                  colors.line,
                backgroundColor:
                  colors.glassStrong,
              },
            ]}
          >
            {step > 0 ? (
              <Pressable
                accessibilityLabel={`Back to ${STEP_LABELS[step - 1]}`}
                accessibilityRole="button"
                disabled={
                  finishing
                }
                onPress={() =>
                  goToStep(
                    (step -
                      1) as OnboardingStep,
                  )
                }
                style={
                  styles.backButton
                }
              >
                <Ionicons
                  color={
                    colors.ink
                  }
                  name="chevron-back"
                  size={20}
                />
                <Text
                  style={[
                    styles.backText,
                    {
                      color:
                        colors.ink,
                    },
                  ]}
                >
                  Back
                </Text>
              </Pressable>
            ) : (
              <View
                style={
                  styles.backPlaceholder
                }
              />
            )}

            <View
              style={
                styles.footerAction
              }
            >
              {step ===
              0 ? (
                <OnboardingButton
                  label={
                    spotifyConnected
                      ? "Continue"
                      : "Continue without Spotify"
                  }
                  onPress={() => {
                    setSpotifyConnectSkipped(
                      !spotifyConnected,
                    );
                    goToStep(
                      1,
                    );
                  }}
                  palette={
                    palette
                  }
                />
              ) : step ===
                4 ? (
                <OnboardingButton
                  disabled={
                    finishing
                  }
                  label={
                    actionLabel
                  }
                  loading={
                    finishing
                  }
                  onPress={() =>
                    void finishOnboarding(
                      hasSharedSceneReturn ||
                        spotifyConnectSkipped
                        ? "/(tabs)"
                        : "/scene-studio",
                    )
                  }
                  palette={
                    palette
                  }
                />
              ) : (
                <OnboardingButton
                  label={
                    actionLabel
                  }
                  onPress={
                    goForward
                  }
                  palette={
                    palette
                  }
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

type PaletteColors =
  ReturnType<
    typeof useOnboardingPalette
  >;

function StepCopy(
  props: {
    colors: PaletteColors;
    eyebrow: string;
    title: string;
    description: string;
  },
) {
  return (
    <View
      style={
        styles.stepCopy
      }
    >
      <Text
        selectable
        style={[
          styles.eyebrow,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        {props.eyebrow}
      </Text>
      <Text
        selectable
        style={[
          styles.title,
          {
            color:
              props.colors.ink,
          },
        ]}
      >
        {props.title}
      </Text>
      <Text
        selectable
        style={[
          styles.description,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        {props.description}
      </Text>
    </View>
  );
}

function MusicStep(
  props: {
    connected: boolean;
    colors: PaletteColors;
    onConnect: () => void;
    palette: OnboardingPalette;
  },
) {
  return (
    <View
      style={
        styles.stepLayout
      }
    >
      <StepCopy
        colors={
          props.colors
        }
        description="Canal keeps a bounded, account-scoped library cache so recommendations load quickly without repeatedly asking Spotify for the same music."
        eyebrow="BRING YOUR LISTENING HISTORY"
        title="Connect music without giving up control."
      />

      <OnboardingPanel
        palette={
          props.palette
        }
        strong
        style={
          styles.workspace
        }
      >
        <Text
          selectable
          style={[
            styles.panelTitle,
            {
              color:
                props.colors.ink,
            },
          ]}
        >
          Your music services
        </Text>
        <Text
          selectable
          style={[
            styles.panelNote,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          Connect now, or begin with Canal and add your library later.
        </Text>

        <Pressable
          accessibilityLabel={
            props.connected
              ? "Spotify connected"
              : "Connect Spotify"
          }
          accessibilityRole="button"
          accessibilityState={{
            selected:
              props.connected,
          }}
          onPress={
            props.onConnect
          }
          style={[
            styles.serviceRow,
            {
              borderColor:
                props.colors.line,
            },
          ]}
        >
          <View
            style={
              styles.spotifyMark
            }
          >
            <Ionicons
              color="#062910"
              name="musical-notes"
              size={21}
            />
          </View>
          <View
            style={
              styles.flex
            }
          >
            <Text
              style={[
                styles.serviceTitle,
                {
                  color:
                    props.colors.ink,
                },
              ]}
            >
              Spotify
            </Text>
            <Text
              selectable
              style={[
                styles.serviceDetail,
                {
                  color:
                    props.colors.muted,
                },
              ]}
            >
              Top tracks, saved music, recent listening, playlist metadata
            </Text>
          </View>
          <Text
            style={[
              styles.serviceState,
              {
                color:
                  props.colors.ink,
              },
            ]}
          >
            {props.connected
              ? "Connected"
              : "Connect"}
          </Text>
        </Pressable>

        <View
          style={
            styles.trustList
          }
        >
          <TrustLine
            colors={
              props.colors
            }
            icon="shield-checkmark-outline"
            text="Your Spotify password never enters Canal."
          />
          <TrustLine
            colors={
              props.colors
            }
            icon="layers-outline"
            text="Stable song metadata is cached and deduplicated."
          />
          <TrustLine
            colors={
              props.colors
            }
            icon="refresh-outline"
            text="Refreshes are occasional, bounded, and recoverable."
          />
        </View>
      </OnboardingPanel>
    </View>
  );
}

function IdentityStep(
  props: {
    avatarUrl?: string | null;
    colors: PaletteColors;
    displayName: string;
    handle: string;
    onChoosePhoto: () => void;
    palette: OnboardingPalette;
  },
) {
  return (
    <View
      style={
        styles.stepLayout
      }
    >
      <StepCopy
        colors={
          props.colors
        }
        description="Your profile picture follows you through Stage chat, collaboration, Explore, reactions, and your Soundscape."
        eyebrow="YOUR IDENTITY IN CANAL"
        title="Choose the atmosphere people see."
      />
      <OnboardingPanel
        palette={
          props.palette
        }
        strong
        style={
          styles.workspace
        }
      >
        <View
          style={
            styles.profilePreview
          }
        >
          <CanalAvatar
            avatarUrl={
              props.avatarUrl
            }
            fallbackText={
              props.displayName
                .slice(0, 1)
                .toUpperCase()
            }
            size={86}
          />
          <View
            style={
              styles.flex
            }
          >
            <Text
              selectable
              style={[
                styles.profileName,
                {
                  color:
                    props.colors.ink,
                },
              ]}
            >
              {props.displayName}
            </Text>
            <Text
              selectable
              style={[
                styles.profileHandle,
                {
                  color:
                    props.colors.muted,
                },
              ]}
            >
              {props.handle}
            </Text>
          </View>
        </View>

        <OnboardingButton
          icon="color-palette-outline"
          label="Choose a profile picture"
          onPress={
            props.onChoosePhoto
          }
          palette={
            props.palette
          }
          secondary
        />
        <Text
          selectable
          style={[
            styles.privacyNote,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          Pick one of ten Canal palettes, choose from your library, or take a photo. Your public Soundscape stays private until you publish it.
        </Text>
      </OnboardingPanel>
    </View>
  );
}

function TasteStep(
  props: {
    activity: string | null;
    allowAdjacent: boolean;
    allowExplicit: boolean;
    colors: PaletteColors;
    familiarity:
      | "Discovery"
      | "Balanced"
      | "Familiar";
    genres: string[];
    moods: string[];
    onActivity: (
      value: string,
    ) => void;
    onAdjacent: (
      value: boolean,
    ) => void;
    onExplicit: (
      value: boolean,
    ) => void;
    onFamiliarity: (
      value:
        | "Discovery"
        | "Balanced"
        | "Familiar",
    ) => void;
    onGenre: (
      value: string,
    ) => void;
    onMood: (
      value: string,
    ) => void;
    palette: OnboardingPalette;
    spotifyConnected: boolean;
    validationMessage: string;
  },
) {
  return (
    <View
      style={
        styles.stepLayout
      }
    >
      <StepCopy
        colors={
          props.colors
        }
        description="These choices seed your first recommendations. Likes, dislikes, Swaps, skips, replays, and favorites refine them later."
        eyebrow="TUNE YOUR COMPASS"
        title="Give Canal a strong first signal."
      />
      <OnboardingPanel
        palette={
          props.palette
        }
        strong
        style={
          styles.workspace
        }
      >
        <View
          style={
            styles.detectedRow
          }
        >
          <Ionicons
            color={
              props.colors.ink
            }
            name="sparkles-outline"
            size={17}
          />
          <Text
            selectable
            style={[
              styles.detectedText,
              {
                color:
                  props.colors.muted,
              },
            ]}
          >
            {props.spotifyConnected
              ? "Spotify connected · starting with your strongest signals"
              : "Starting with Canal’s catalog · connect your library anytime"}
          </Text>
        </View>

        <ChoiceGroup
          colors={
            props.colors
          }
          count={
            props.activity
              ? "1 selected"
              : "Required"
          }
          label="What do you do most?"
        >
          {ACTIVITIES.map(
            (value) => (
              <OnboardingChoice
                key={
                  value
                }
                label={
                  value
                }
                onPress={() =>
                  props.onActivity(
                    value,
                  )
                }
                palette={
                  props.palette
                }
                selected={
                  props.activity ===
                  value
                }
              />
            ),
          )}
        </ChoiceGroup>

        <ChoiceGroup
          colors={
            props.colors
          }
          count={`${props.moods.length}/5 selected`}
          label="What should it feel like?"
        >
          {MOODS.map(
            (value) => (
              <OnboardingChoice
                accessibilityHint="Select a mood, up to five"
                key={
                  value
                }
                label={
                  value
                }
                onPress={() =>
                  props.onMood(
                    value,
                  )
                }
                palette={
                  props.palette
                }
                selected={
                  props.moods.includes(
                    value,
                  )
                }
              />
            ),
          )}
        </ChoiceGroup>

        <ChoiceGroup
          colors={
            props.colors
          }
          count="Optional · up to 5"
          label="Your starting sounds"
        >
          {GENRES.map(
            (value) => (
              <OnboardingChoice
                key={
                  value
                }
                label={
                  value
                }
                onPress={() =>
                  props.onGenre(
                    value,
                  )
                }
                palette={
                  props.palette
                }
                selected={
                  props.genres.includes(
                    value,
                  )
                }
              />
            ),
          )}
        </ChoiceGroup>

        <ChoiceGroup
          colors={
            props.colors
          }
          count={
            props.familiarity
          }
          label="Familiarity"
        >
          {(
            [
              "Discovery",
              "Balanced",
              "Familiar",
            ] as const
          ).map(
            (value) => (
              <OnboardingChoice
                key={
                  value
                }
                label={
                  value
                }
                onPress={() =>
                  props.onFamiliarity(
                    value,
                  )
                }
                palette={
                  props.palette
                }
                selected={
                  props.familiarity ===
                  value
                }
              />
            ),
          )}
        </ChoiceGroup>

        <PreferenceSwitch
          colors={
            props.colors
          }
          description="Try your exact choices first; expand only when needed"
          label="Allow adjacent sounds"
          onValueChange={
            props.onAdjacent
          }
          value={
            props.allowAdjacent
          }
        />
        <PreferenceSwitch
          colors={
            props.colors
          }
          description="Keep the playback preference consistent"
          label="Allow explicit tracks"
          onValueChange={
            props.onExplicit
          }
          value={
            props.allowExplicit
          }
        />

        {props.validationMessage ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            selectable
            style={[
              styles.validationText,
              {
                color:
                  props.colors.danger,
              },
            ]}
          >
            {props.validationMessage}
          </Text>
        ) : null}
      </OnboardingPanel>
    </View>
  );
}

function FirstSceneStep(
  props: {
    activity: string | null;
    colors: PaletteColors;
    directRequest: string;
    familiarity: string;
    moods: string[];
    onDirectRequest: (
      value: string,
    ) => void;
    palette: OnboardingPalette;
    sceneName: string;
  },
) {
  return (
    <View
      style={
        styles.stepLayout
      }
    >
      <View
        style={
          styles.stepCopy
        }
      >
        <StepCopy
          colors={
            props.colors
          }
          description="This direction opens in the full Scene creator, where duration, energy, arc, genres, and playback preferences stay editable before generation."
          eyebrow="MAKE THE FIRST MOMENT"
          title="Start from a direction that already feels like you."
        />
        <Text
          style={[
            styles.fieldLabel,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          DIRECT CANAL
        </Text>
        <TextInput
          accessibilityLabel="Direct Canal request"
          maxLength={240}
          multiline
          onChangeText={
            props.onDirectRequest
          }
          placeholder="Soft motion, late summer air, no sharp transitions"
          placeholderTextColor={
            props.colors.muted
          }
          style={[
            styles.directInput,
            {
              color:
                props.colors.ink,
              borderColor:
                props.colors.line,
            },
          ]}
          value={
            props.directRequest
          }
        />
      </View>

      <OnboardingPanel
        accessibilityLabel="First Scene direction preview"
        palette={
          props.palette
        }
        strong
        style={
          styles.scenePreview
        }
      >
        <Text
          style={[
            styles.sceneEyebrow,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          YOUR FIRST SCENE
        </Text>
        <Text
          selectable
          style={[
            styles.sceneName,
            {
              color:
                props.colors.ink,
            },
          ]}
        >
          {props.sceneName}
        </Text>
        <EnergyRidge
          color={
            props.colors.ink
          }
        />
        <Text
          selectable
          style={[
            styles.sceneDna,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          {props.activity ??
            "Moment"}
          {"  ·  "}
          {props.moods.join(
            " · ",
          )}
          {"  ·  "}
          {props.familiarity}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={[
            styles.previewStatus,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          Activity, moods, familiarity, and Direct Canal are ready to carry into Scene Studio.
        </Text>
      </OnboardingPanel>
    </View>
  );
}

function ReadyStep(
  props: {
    colors: PaletteColors;
    hasSharedSceneReturn: boolean;
    palette: OnboardingPalette;
    sceneName: string;
  },
) {
  return (
    <View
      style={
        styles.readyLayout
      }
    >
      <View
        accessibilityLabel="Canal setup complete"
        style={[
          styles.readyOrbit,
          {
            backgroundColor:
              props.colors.glowA,
            borderColor:
              props.colors.line,
          },
        ]}
      >
        <Ionicons
          color={
            props.colors.ink
          }
          name="pulse-outline"
          size={54}
        />
      </View>
      <Text
        selectable
        style={[
          styles.eyebrow,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        YOUR CANAL IS READY
      </Text>
      <Text
        selectable
        style={[
          styles.readyTitle,
          {
            color:
              props.colors.ink,
          },
        ]}
      >
        Start with a moment. Let the rest keep evolving.
      </Text>
      <Text
        selectable
        style={[
          styles.readyCopy,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        {props.hasSharedSceneReturn
          ? "Your shared Scene is still waiting. Canal will return you there after this final step."
          : `${props.sceneName} is ready to finish in Scene Studio. Your profile and recommendations will keep improving across devices.`}
      </Text>

      <OnboardingPanel
        palette={
          props.palette
        }
        style={
          styles.readyPanel
        }
      >
        <PermissionLine
          colors={
            props.colors
          }
          detail="Asked after an invite, reaction, comment, follow, or Stage change"
          icon="notifications-outline"
          label="Activity notifications"
          state="When useful"
        />
        <PermissionLine
          colors={
            props.colors
          }
          detail="Requested only when you open Snapshot capture"
          icon="camera-outline"
          label="Camera and microphone"
          state="Later"
        />
        <PermissionLine
          colors={
            props.colors
          }
          detail="Account-scoped Scenes, Snapshots, profile, and Stage changes"
          icon="cloud-done-outline"
          label="Cross-device sync"
          state="Ready"
        />
      </OnboardingPanel>

      <View
        accessibilityLabel="Canal navigation"
        style={
          styles.navigationMap
        }
      >
        {[
          [
            "home-outline",
            "Home",
          ],
          [
            "search-outline",
            "Explore",
          ],
          [
            "add-outline",
            "Create",
          ],
          [
            "albums-outline",
            "Library",
          ],
          [
            "person-outline",
            "Profile",
          ],
        ].map(
          ([
            icon,
            label,
          ]) => (
            <View
              key={
                label
              }
              style={
                styles.navigationItem
              }
            >
              <Ionicons
                color={
                  props.colors.ink
                }
                name={
                  icon as keyof typeof Ionicons.glyphMap
                }
                size={20}
              />
              <Text
                style={[
                  styles.navigationText,
                  {
                    color:
                      props.colors.muted,
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

function TrustLine(
  props: {
    colors: PaletteColors;
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
  },
) {
  return (
    <View
      style={
        styles.trustLine
      }
    >
      <Ionicons
        color={
          props.colors.ink
        }
        name={
          props.icon
        }
        size={18}
      />
      <Text
        selectable
        style={[
          styles.trustText,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        {props.text}
      </Text>
    </View>
  );
}

function ChoiceGroup(
  props: {
    colors: PaletteColors;
    count: string;
    label: string;
    children: ReactNode;
  },
) {
  return (
    <View
      style={
        styles.choiceGroup
      }
    >
      <View
        style={
          styles.groupHeader
        }
      >
        <Text
          selectable
          style={[
            styles.groupTitle,
            {
              color:
                props.colors.ink,
            },
          ]}
        >
          {props.label}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={[
            styles.groupCount,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          {props.count}
        </Text>
      </View>
      <View
        style={
          styles.choiceRow
        }
      >
        {props.children}
      </View>
    </View>
  );
}

function PreferenceSwitch(
  props: {
    colors: PaletteColors;
    description: string;
    label: string;
    onValueChange: (
      value: boolean,
    ) => void;
    value: boolean;
  },
) {
  return (
    <Pressable
      accessibilityLabel={
        props.label
      }
      accessibilityRole="switch"
      accessibilityState={{
        checked:
          props.value,
      }}
      onPress={() =>
        props.onValueChange(
          !props.value,
        )
      }
      style={[
        styles.preferenceRow,
        {
          borderColor:
            props.colors.line,
        },
      ]}
    >
      <View
        style={
          styles.flex
        }
      >
        <Text
          selectable
          style={[
            styles.preferenceTitle,
            {
              color:
                props.colors.ink,
            },
          ]}
        >
          {props.label}
        </Text>
        <Text
          selectable
          style={[
            styles.preferenceText,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          {props.description}
        </Text>
      </View>
      <Switch
        accessible={false}
        onValueChange={
          props.onValueChange
        }
        pointerEvents="none"
        trackColor={{
          false:
            props.colors.line,
          true:
            props.colors.glowA,
        }}
        value={
          props.value
        }
      />
    </Pressable>
  );
}

function PermissionLine(
  props: {
    colors: PaletteColors;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    state: string;
  },
) {
  return (
    <View
      style={[
        styles.permissionLine,
        {
          borderColor:
            props.colors.line,
        },
      ]}
    >
      <Ionicons
        color={
          props.colors.ink
        }
        name={
          props.icon
        }
        size={21}
      />
      <View
        style={
          styles.flex
        }
      >
        <Text
          selectable
          style={[
            styles.permissionTitle,
            {
              color:
                props.colors.ink,
            },
          ]}
        >
          {props.label}
        </Text>
        <Text
          selectable
          style={[
            styles.permissionText,
            {
              color:
                props.colors.muted,
            },
          ]}
        >
          {props.detail}
        </Text>
      </View>
      <Text
        style={[
          styles.permissionState,
          {
            color:
              props.colors.muted,
          },
        ]}
      >
        {props.state}
      </Text>
    </View>
  );
}

function EnergyRidge(
  props: {
    color: string;
  },
) {
  const heights = [
    16,
    25,
    20,
    39,
    27,
    52,
    34,
    61,
    44,
    67,
    54,
    70,
    58,
    64,
    47,
    55,
    38,
    49,
    31,
    42,
  ];

  return (
    <View
      accessibilityLabel="A building Scene energy arc with waves"
      style={
        styles.ridge
      }
    >
      {heights.map(
        (
          height,
          index,
        ) => (
          <View
            key={`${height}-${index}`}
            style={{
              flex: 1,
              height:
                Math.max(
                  2,
                  height / 8,
                ),
              borderRadius: 6,
              backgroundColor:
                props.color,
              opacity:
                0.54 +
                index /
                  80,
              transform: [
                {
                  translateY:
                    (70 -
                      height) /
                    4,
                },
              ],
            }}
          />
        ),
      )}
    </View>
  );
}

function buildFirstSceneName(
  activity: string | null,
  moods: string[],
): string {
  if (
    moods.includes(
      "Dreamy",
    )
  ) {
    return "Afterlight on Mercer";
  }

  if (
    moods.includes(
      "Energized",
    )
  ) {
    return "Voltage Before Sunrise";
  }

  if (
    activity ===
    "Wind down"
  ) {
    return "Windows Open After Midnight";
  }

  return "The Hours Between Plans";
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor:
        "transparent",
    },
    headerWrap: {
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 28,
      justifyContent:
        "center",
    },
    contentWide: {
      alignSelf:
        "center",
      width: "100%",
      maxWidth: 980,
    },
    stepLayout: {
      width: "100%",
      gap: 26,
    },
    stepCopy: {
      flex: 1,
      gap: 12,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight:
        "500",
      letterSpacing: 1.55,
    },
    title: {
      maxWidth: 620,
      fontFamily:
        "Georgia",
      fontSize: 43,
      lineHeight: 44,
      fontWeight:
        "400",
      letterSpacing: -1.9,
    },
    description: {
      maxWidth: 590,
      fontSize: 14,
      lineHeight: 22,
    },
    workspace: {
      width: "100%",
      maxWidth: 580,
      alignSelf:
        "center",
    },
    panelTitle: {
      fontFamily:
        "Georgia",
      fontSize: 24,
      lineHeight: 28,
      fontWeight:
        "400",
    },
    panelNote: {
      marginTop: 5,
      fontSize: 10,
      lineHeight: 15,
    },
    serviceRow: {
      minHeight: 76,
      marginTop: 12,
      borderBottomWidth: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
    },
    spotifyMark: {
      width: 43,
      height: 43,
      borderRadius: 22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1ED760",
    },
    flex: {
      flex: 1,
    },
    serviceTitle: {
      fontSize: 13,
      fontWeight:
        "500",
    },
    serviceDetail: {
      marginTop: 3,
      fontSize: 9,
      lineHeight: 14,
    },
    serviceState: {
      fontSize: 10,
      fontWeight:
        "500",
    },
    trustList: {
      gap: 12,
      paddingTop: 16,
    },
    trustLine: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 9,
    },
    trustText: {
      flex: 1,
      fontSize: 10,
      lineHeight: 15,
    },
    profilePreview: {
      minHeight: 108,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 16,
      marginBottom: 14,
    },
    profileName: {
      fontFamily:
        "Georgia",
      fontSize: 24,
      fontWeight:
        "400",
    },
    profileHandle: {
      marginTop: 4,
      fontSize: 11,
    },
    privacyNote: {
      marginTop: 12,
      fontSize: 10,
      lineHeight: 15,
    },
    detectedRow: {
      minHeight: 38,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 7,
    },
    detectedText: {
      flex: 1,
      fontSize: 10,
      lineHeight: 15,
    },
    choiceGroup: {
      gap: 8,
      marginTop: 14,
    },
    groupHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
    },
    groupTitle: {
      fontFamily:
        "Georgia",
      fontSize: 17,
      fontWeight:
        "400",
    },
    groupCount: {
      fontSize: 9,
      fontVariant: [
        "tabular-nums",
      ],
    },
    choiceRow: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 7,
    },
    preferenceRow: {
      minHeight: 62,
      borderBottomWidth: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 14,
    },
    preferenceTitle: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    preferenceText: {
      marginTop: 2,
      fontSize: 9,
      lineHeight: 14,
    },
    validationText: {
      marginTop: 10,
      fontSize: 10,
      lineHeight: 15,
    },
    fieldLabel: {
      marginTop: 8,
      fontSize: 10,
      fontWeight:
        "500",
      letterSpacing: 0.9,
    },
    directInput: {
      minHeight: 84,
      borderWidth: 0,
      borderBottomWidth: 1,
      paddingHorizontal: 2,
      paddingVertical: 10,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical:
        "top",
    },
    scenePreview: {
      minHeight: 310,
      width: "100%",
      maxWidth: 580,
      alignSelf:
        "center",
      justifyContent:
        "space-between",
    },
    sceneEyebrow: {
      fontSize: 9,
      fontWeight:
        "500",
      letterSpacing: 1.5,
    },
    sceneName: {
      marginTop: 8,
      fontFamily:
        "Georgia",
      fontSize: 36,
      lineHeight: 39,
      fontWeight:
        "400",
      letterSpacing: -1.5,
    },
    ridge: {
      minHeight: 72,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 2,
      marginVertical: 16,
    },
    sceneDna: {
      fontSize: 10,
      lineHeight: 16,
    },
    previewStatus: {
      marginTop: 15,
      fontSize: 10,
      lineHeight: 15,
    },
    readyLayout: {
      width: "100%",
      maxWidth: 720,
      alignSelf:
        "center",
      alignItems:
        "center",
      gap: 14,
      paddingVertical: 8,
    },
    readyOrbit: {
      width: 156,
      height: 156,
      borderRadius: 78,
      borderWidth: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginBottom: 6,
    },
    readyTitle: {
      maxWidth: 620,
      fontFamily:
        "Georgia",
      fontSize: 42,
      lineHeight: 44,
      fontWeight:
        "400",
      letterSpacing: -1.8,
      textAlign:
        "center",
    },
    readyCopy: {
      maxWidth: 590,
      fontSize: 13,
      lineHeight: 20,
      textAlign:
        "center",
    },
    readyPanel: {
      width: "100%",
      marginTop: 8,
    },
    permissionLine: {
      minHeight: 64,
      borderBottomWidth: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
    },
    permissionTitle: {
      fontSize: 11,
      fontWeight:
        "500",
    },
    permissionText: {
      marginTop: 2,
      fontSize: 9,
      lineHeight: 13,
    },
    permissionState: {
      fontSize: 9,
      fontWeight:
        "500",
    },
    navigationMap: {
      width: "100%",
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    navigationItem: {
      minWidth: 48,
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 3,
    },
    navigationText: {
      fontSize: 8,
    },
    footer: {
      minHeight: 84,
      borderTopWidth: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
    },
    footerAction: {
      flex: 1,
      maxWidth: 430,
      marginLeft: "auto",
    },
    backButton: {
      minWidth: 78,
      minHeight: 54,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 3,
    },
    backPlaceholder: {
      width: 78,
      minHeight: 54,
    },
    backText: {
      fontSize: 11,
      fontWeight:
        "500",
    },
    errorText: {
      marginHorizontal: 20,
      marginBottom: 6,
      borderWidth: 1,
      borderRadius: 14,
      borderCurve:
        "continuous",
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 10,
      lineHeight: 15,
      textAlign:
        "center",
    },
  });
