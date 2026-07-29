import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useLocalSearchParams,
  useFocusEffect,
  router,
} from "expo-router";

import {
  StatusBar,
} from "expo-status-bar";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import type {
  RecoveryIssue,
} from "../lib/recovery-issue";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  clearSceneStudioDraft,
  DEFAULT_SCENE_STUDIO_DRAFT,
  generateSceneFromSpotify,
  readSceneStudioDraft,
  SCENE_ACTIVITY_OPTIONS,
  SCENE_ARC_OPTIONS,
  SCENE_ENERGY_OPTIONS,
  SCENE_FAMILIARITY_OPTIONS,
  SCENE_GENRE_OPTIONS,
  SCENE_MOOD_OPTIONS,
  saveGeneratedSceneToLibrary,
  writeGeneratedScenePreview,
  writeSceneStudioDraft,
} from "../lib/scene-studio";

import type {
  SceneActivity,
  SceneArc,
  SceneEnergy,
  SceneFamiliarity,
  SceneMood,
  SceneStudioDraft,
} from "../lib/scene-studio";

import {
  getLatestSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import {
  createPlayerSession,
} from "../lib/canal-player";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

const DURATION_OPTIONS = [
  15,
  25,
  35,
  45,
  60,
  90,
];

function safeBack(): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace("/(tabs)");
}

function SectionTitle(props: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {props.title}
      </Text>

      {props.subtitle ? (
        <Text style={styles.sectionSubtitle}>
          {props.subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function OptionCard(props: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        selected:
          props.selected,
      }}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.optionCard,

        props.selected &&
          styles.optionCardSelected,

        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.optionLabel,

          props.selected &&
            styles.optionLabelSelected,
        ]}
      >
        {props.label}
      </Text>

      {props.description ? (
        <Text
          style={[
            styles.optionDescription,

            props.selected &&
              styles.optionDescriptionSelected,
          ]}
        >
          {props.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ChoiceChip(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        selected:
          props.selected,
      }}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.choiceChip,

        props.selected &&
          styles.choiceChipSelected,

        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.choiceChipText,

          props.selected &&
            styles.choiceChipTextSelected,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function PreferenceRow(props: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (
    value: boolean,
  ) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceText}>
        <Text style={styles.preferenceTitle}>
          {props.title}
        </Text>

        <Text
          style={
            styles.preferenceDescription
          }
        >
          {props.description}
        </Text>
      </View>

      <Switch
        value={props.value}
        onValueChange={
          props.onValueChange
        }
        trackColor={{
          false: "#D8D0C8",
          true: "#F6B27F",
        }}
        thumbColor={
          props.value
            ? "#F47A24"
            : "#FFFFFF"
        }
      />
    </View>
  );
}

function freshSceneStudioDraft(): SceneStudioDraft {
  return {
    ...DEFAULT_SCENE_STUDIO_DRAFT,

    moods: [
      ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
    ],

    preferredGenres: [
      ...DEFAULT_SCENE_STUDIO_DRAFT.preferredGenres,
    ],
  };
}

export default function SceneStudioScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const sceneModeParams =
    useLocalSearchParams<{
      mode?: string;
    }>();

  const shouldResumeSceneDraft =
    sceneModeParams.mode ===
      "edit";

  const [
    draft,
    setDraft,
  ] =
    useState<SceneStudioDraft>({
      ...DEFAULT_SCENE_STUDIO_DRAFT,

      moods: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.moods,
      ],

      preferredGenres: [
        ...DEFAULT_SCENE_STUDIO_DRAFT.preferredGenres,
      ],
    });

  const [
    snapshot,
    setSnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    generating,
    setGenerating,
  ] = useState(false);

  const [
    syncingLibrary,
    setSyncingLibrary,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    libraryWarning,
    setLibraryWarning,
  ] =
    useState<string | null>(
      null,
    );

  const [
    libraryIssue,
    setLibraryIssue,
  ] =
    useState<RecoveryIssue | null>(
      null,
    );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load =
        async (): Promise<void> => {
          setLoading(true);
          setErrorMessage(null);

          try {
            if (
              !shouldResumeSceneDraft
            ) {
              await clearSceneStudioDraft();
            }

            const [
              nextDraft,
              latestLibrary,
            ] =
              await Promise.all([
                shouldResumeSceneDraft
                  ? readSceneStudioDraft()
                  : Promise.resolve(
                      freshSceneStudioDraft(),
                    ),

                getLatestSpotifyLibrarySnapshot(),
              ]);

            if (!active) {
              return;
            }

            setDraft(
              nextDraft,
            );

            setSnapshot(
              latestLibrary.snapshot,
            );

            setLibraryWarning(
              latestLibrary.warning ??
                null,
            );

            setLibraryIssue(
              latestLibrary.issue ??
                null,
            );
          } catch (error) {
            if (active) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Canal could not load Scene Studio.",
              );
            }
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

      void load();

      return () => {
        active = false;
      };
    }, [
      shouldResumeSceneDraft,
    ]),
  );

  const retrySpotifyLibrary =
    useCallback(
      async (): Promise<void> => {
        setSyncingLibrary(
          true,
        );

        setLibraryIssue(
          null,
        );

        setLibraryWarning(
          null,
        );

        try {
          const updated =
            await syncSpotifyLibrary();

          setSnapshot(
            updated,
          );
        } catch (error) {
          setLibraryIssue(
            classifyRecoveryIssue(
              error,
              {
                service:
                  "spotify",
                connectivityStatus,
              },
            ),
          );
        } finally {
          setSyncingLibrary(
            false,
          );
        }
      },
      [
        connectivityStatus,
      ],
    );

  useReconnectReload(
    retrySpotifyLibrary,
  );

  const recoverSpotifyLibrary =
    async (): Promise<void> => {
      if (
        libraryIssue?.action ===
        "reconnect-spotify"
      ) {
        router.push(
          "/music-services",
        );

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await retrySpotifyLibrary();
      }
    };

  const totalImportedTracks =
    useMemo(() => {
      if (!snapshot) {
        return 0;
      }

      const ids =
        new Set<string>();

      for (
        const track of [
          ...snapshot.topTracks,
          ...snapshot.savedTracks,
          ...snapshot.recentTracks,
          ...snapshot.playlistTracks,
          ...snapshot.discoveryTracks,
        ]
      ) {
        if (track.id) {
          ids.add(track.id);
        }
      }

      return ids.size;
    }, [snapshot]);

  const genreOptions =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...(snapshot?.topGenres.map(
              (genre) =>
                genre.name,
            ) ?? []),
            ...SCENE_GENRE_OPTIONS,
          ]),
        ).slice(0, 18),
      [snapshot],
    );

  const updateDraft = <
    Key extends keyof SceneStudioDraft,
  >(
    key: Key,
    value: SceneStudioDraft[Key],
  ): void => {
    setErrorMessage(null);

    setDraft(
      (current) => ({
        ...current,

        [key]: value,
      }),
    );
  };

  const toggleMood = (
    mood: SceneMood,
  ): void => {
    setErrorMessage(null);

    setDraft(
      (current) => {
        const selected =
          current.moods.includes(
            mood,
          );

        if (selected) {
          if (
            current.moods.length ===
            1
          ) {
            return current;
          }

          return {
            ...current,

            moods:
              current.moods.filter(
                (item) =>
                  item !== mood,
              ),
          };
        }

        if (
          current.moods.length >=
          3
        ) {
          return {
            ...current,

            moods: [
              ...current.moods.slice(
                1,
              ),

              mood,
            ],
          };
        }

        return {
          ...current,

          moods: [
            ...current.moods,
            mood,
          ],
        };
      },
    );
  };

  const toggleGenre = (
    genre: string,
  ): void => {
    setErrorMessage(null);

    setDraft(
      (current) => {
        const selected =
          current.preferredGenres.includes(
            genre,
          );

        if (selected) {
          return {
            ...current,
            preferredGenres:
              current.preferredGenres.filter(
                (item) =>
                  item !== genre,
              ),
          };
        }

        if (
          current.preferredGenres.length >=
          5
        ) {
          return current;
        }

        return {
          ...current,
          preferredGenres: [
            ...current.preferredGenres,
            genre,
          ],
        };
      },
    );
  };

  const generateScene =
    async (): Promise<void> => {
      if (generating) {
        return;
      }

      setGenerating(true);
      setErrorMessage(null);

      try {
        /*
         * Refresh only when the snapshot is
         * stale. The helper deduplicates the
         * request and falls back to cached
         * listening data when offline.
         */
        const latestLibrary =
          await getLatestSpotifyLibrarySnapshot();

        const latestSnapshot =
          latestLibrary.snapshot ??
          snapshot;

        setLibraryWarning(
          latestLibrary.warning ??
            null,
        );

        setLibraryIssue(
          latestLibrary.issue ??
            null,
        );

        if (!latestSnapshot) {
          if (
            latestLibrary.issue
          ) {
            return;
          }

          throw new Error(
            "Your Spotify Library is not ready. Open Music Services, connect Spotify, and sync the library before creating a Scene.",
          );
        }

        const latestTrackIds =
          new Set<string>();

        for (
          const track of [
            ...latestSnapshot.topTracks,
            ...latestSnapshot.savedTracks,
            ...latestSnapshot.recentTracks,
            ...latestSnapshot.playlistTracks,
            ...latestSnapshot.discoveryTracks,
          ]
        ) {
          if (track.id) {
            latestTrackIds.add(
              track.id,
            );
          }
        }

        if (
          latestTrackIds.size < 3
        ) {
          if (
            latestLibrary.issue
          ) {
            return;
          }

          throw new Error(
            "Canal did not find enough music yet. Listen to or save a few tracks in Spotify, then sync again.",
          );
        }

        if (
          draft.moods.length === 0
        ) {
          throw new Error(
            "Choose at least one mood.",
          );
        }

        if (
          draft.durationMinutes <
          1
        ) {
          throw new Error(
            "Choose a valid Scene duration.",
          );
        }

        await writeSceneStudioDraft(
          draft,
        );

        const result =
          generateSceneFromSpotify(
            draft,
            latestSnapshot,
          );

        await writeGeneratedScenePreview(
          result,
        );

        const savedScene =
          await saveGeneratedSceneToLibrary(
            result,
          );

        await createPlayerSession(
          savedScene,
        );

        setSnapshot(
          latestSnapshot,
        );

        router.replace({
          pathname:
            "/now-playing",

          params: {
            sceneId:
              savedScene.id,
          },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not generate the Scene.",
        );
      } finally {
        setGenerating(false);
      }
    };

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={[
          "top",
          "bottom",
        ]}
      >
        <StatusBar style="dark" />

        <View style={styles.loadingState}>
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Opening Scene Studio...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={safeBack}
          style={({ pressed }) => [
            styles.backButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text style={styles.backText}>
            ‹
          </Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            Canal
          </Text>

          <Text style={styles.title}>
            Set the Scene
          </Text>

          <Text style={styles.subtitle}>
            Tell Canal what you are doing
            and how the music should move.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        {snapshot &&
        totalImportedTracks >=
          3 ? (
          <View style={styles.spotifyCard}>
            <View style={styles.spotifyMark}>
              <Text
                style={
                  styles.spotifyMarkText
                }
              >
                S
              </Text>
            </View>

            <View style={styles.spotifyText}>
              <Text
                style={
                  styles.spotifyTitle
                }
              >
                Spotify taste ready
              </Text>

              <Text
                style={
                  styles.spotifyDescription
                }
              >
                {totalImportedTracks} unique
                tracks,{" "}
                {
                  snapshot.topArtists
                    .length
                }{" "}
                top artists, and{" "}
                {
                  snapshot.topGenres
                    .length
                }{" "}
                genre signals are available.
              </Text>
            </View>
          </View>
        ) : libraryIssue ? null : (
          <View style={styles.missingCard}>
            <Text
              style={styles.missingTitle}
            >
              {snapshot
                ? "We didn’t find enough music yet"
                : "Spotify Library not ready"}
            </Text>

            <Text
              style={styles.missingText}
            >
              {snapshot
                ? "Listen to or save a few tracks in Spotify, then sync again so Canal has enough music to shape a Scene."
                : "Connect and sync Spotify before creating a Scene. Canal needs a taste snapshot with at least three tracks."}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  syncingLibrary,
                disabled:
                  syncingLibrary,
              }}
              disabled={
                syncingLibrary
              }
              onPress={() =>
                snapshot
                  ? void retrySpotifyLibrary()
                  : router.push(
                      "/music-services",
                    )
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
                {syncingLibrary
                  ? "Syncing Spotify…"
                  : snapshot
                    ? "Sync Spotify again"
                    : "Open Music Services"}
              </Text>
            </Pressable>
          </View>
        )}

        {libraryIssue ? (
          <RecoveryNotice
            busy={
              syncingLibrary
            }
            issue={
              libraryIssue
            }
            onAction={
              recoverSpotifyLibrary
            }
          />
        ) : libraryWarning ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={
              styles.warningCard
            }
          >
            <Text
              selectable
              style={
                styles.warningText
              }
            >
              {libraryWarning}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Name"
            subtitle="Optional. Canal can name it automatically."
          />

          <TextInput
            value={draft.name}
            onChangeText={(value) =>
              updateDraft(
                "name",
                value,
              )
            }
            placeholder="Example: Late Night Focus"
            placeholderTextColor="#9A938C"
            maxLength={60}
            style={styles.textInput}
          />
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="What are you doing?"
            subtitle="Choose the activity that best defines the Scene."
          />

          <View style={styles.optionGrid}>
            {SCENE_ACTIVITY_OPTIONS.map(
              (option) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  description={
                    option.description
                  }
                  selected={
                    draft.activity ===
                    option.value
                  }
                  onPress={() =>
                    updateDraft(
                      "activity",
                      option.value as SceneActivity,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="How should it feel?"
            subtitle="Choose up to three moods. Selecting a fourth replaces the oldest selection."
          />

          <View style={styles.chipWrap}>
            {SCENE_MOOD_OPTIONS.map(
              (option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  selected={draft.moods.includes(
                    option.value,
                  )}
                  onPress={() =>
                    toggleMood(
                      option.value,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Genres"
            subtitle="Optional. Choose up to five. Your latest Spotify genres appear first."
          />

          <View style={styles.chipWrap}>
            {genreOptions.map(
              (genre) => (
                <ChoiceChip
                  key={genre}
                  label={genre}
                  selected={
                    draft.preferredGenres.includes(
                      genre,
                    )
                  }
                  onPress={() =>
                    toggleGenre(
                      genre,
                    )
                  }
                />
              ),
            )}
          </View>

          <Text
            style={
              styles.characterCount
            }
          >
            {draft.preferredGenres.length}/5 selected
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Energy"
            subtitle="Choose how intense the Scene should feel."
          />

          <View style={styles.optionGrid}>
            {SCENE_ENERGY_OPTIONS.map(
              (option) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  description={
                    option.description
                  }
                  selected={
                    draft.energy ===
                    option.value
                  }
                  onPress={() =>
                    updateDraft(
                      "energy",
                      option.value as SceneEnergy,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Familiarity"
            subtitle="Decide how strongly Canal should favor your most obvious favorites."
          />

          <View style={styles.optionGrid}>
            {SCENE_FAMILIARITY_OPTIONS.map(
              (option) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  description={
                    option.description
                  }
                  selected={
                    draft.familiarity ===
                    option.value
                  }
                  onPress={() =>
                    updateDraft(
                      "familiarity",
                      option.value as SceneFamiliarity,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Scene arc"
            subtitle="Choose how intensity changes from the first track to the last."
          />

          <View style={styles.optionGrid}>
            {SCENE_ARC_OPTIONS.map(
              (option) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  description={
                    option.description
                  }
                  selected={
                    draft.arc ===
                    option.value
                  }
                  onPress={() =>
                    updateDraft(
                      "arc",
                      option.value as SceneArc,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Duration"
            subtitle="Canal targets this duration using imported Spotify track lengths."
          />

          <View style={styles.chipWrap}>
            {DURATION_OPTIONS.map(
              (minutes) => (
                <ChoiceChip
                  key={minutes}
                  label={`${minutes} min`}
                  selected={
                    draft.durationMinutes ===
                    minutes
                  }
                  onPress={() =>
                    updateDraft(
                      "durationMinutes",
                      minutes,
                    )
                  }
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Preferences"
          />

          <PreferenceRow
            title="Use recently played tracks"
            description="Let recent listening influence this Scene."
            value={
              draft.includeRecent
            }
            onValueChange={(value) =>
              updateDraft(
                "includeRecent",
                value,
              )
            }
          />

          <View
            style={
              styles.preferenceDivider
            }
          />

          <PreferenceRow
            title="Allow explicit tracks"
            description="When disabled, explicit Spotify tracks are removed before selection."
            value={
              draft.allowExplicit
            }
            onValueChange={(value) =>
              updateDraft(
                "allowExplicit",
                value,
              )
            }
          />
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="Anything else?"
            subtitle="Optional notes are saved with the Scene."
          />

          <TextInput
            value={draft.notes}
            onChangeText={(value) =>
              updateDraft(
                "notes",
                value,
              )
            }
            placeholder="Example: Avoid anything too distracting during the first ten minutes."
            placeholderTextColor="#9A938C"
            multiline
            maxLength={300}
            textAlignVertical="top"
            style={[
              styles.textInput,
              styles.notesInput,
            ]}
          />

          <Text style={styles.characterCount}>
            {draft.notes.length}/300
          </Text>
        </View>

        {errorMessage ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.errorBox}
          >
            <Text
              selectable
              style={styles.errorTitle}
            >
              Scene generation error
            </Text>

            <Text
              selectable
              style={styles.errorText}
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy:
              generating,
            disabled:
              generating ||
              !snapshot ||
              totalImportedTracks <
                3,
          }}
          disabled={
            generating ||
            !snapshot ||
            totalImportedTracks <
              3
          }
          onPress={() =>
            void generateScene()
          }
          style={({ pressed }) => [
            styles.generateButton,

            (
              generating ||
              !snapshot ||
              totalImportedTracks <
                3
            ) &&
              styles.disabledButton,

            pressed &&
              styles.pressed,
          ]}
        >
          {generating ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <>
              <Text
                style={
                  styles.generateButtonText
                }
              >
                Create & Play Scene
              </Text>

              <Text
                style={
                  styles.generateButtonSubtext
                }
              >
                Save it and open the player
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFF9F4",
  },

  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  loadingText: {
    color: "#6C655F",
    fontSize: 15,
    marginTop: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
  },

  backText: {
    color: "#1B1B1B",
    fontSize: 34,
    lineHeight: 36,
    marginTop: -2,
  },

  headerText: {
    flex: 1,
  },

  eyebrow: {
    color: "#F47A24",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  title: {
    color: "#181818",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 2,
  },

  subtitle: {
    color: "#6C655F",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    gap: 16,
  },

  spotifyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFAF0",
    borderRadius: 20,
    padding: 16,
  },

  spotifyMark: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    marginRight: 13,
  },

  spotifyMarkText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },

  spotifyText: {
    flex: 1,
  },

  spotifyTitle: {
    color: "#176B35",
    fontSize: 15,
    fontWeight: "800",
  },

  spotifyDescription: {
    color: "#39704B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },

  missingCard: {
    backgroundColor: "#FFF0EF",
    borderRadius: 20,
    padding: 18,
  },

  missingTitle: {
    color: "#A62E27",
    fontSize: 17,
    fontWeight: "800",
  },

  missingText: {
    color: "#7E3833",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 15,
  },

  warningCard: {
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#FFF2CC",
    padding: 14,
  },

  warningText: {
    color: "#6B5200",
    fontSize: 13,
    lineHeight: 19,
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
  },

  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: "#1A1A1A",
    fontSize: 19,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: "#746D67",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  optionGrid: {
    gap: 10,
  },

  optionCard: {
    borderWidth: 1,
    borderColor: "#E7E0DA",
    backgroundColor: "#FFFCFA",
    borderRadius: 16,
    padding: 14,
  },

  optionCardSelected: {
    borderColor: "#F47A24",
    backgroundColor: "#FFF1E6",
  },

  optionLabel: {
    color: "#302D2A",
    fontSize: 15,
    fontWeight: "800",
  },

  optionLabelSelected: {
    color: "#B64F08",
  },

  optionDescription: {
    color: "#77706A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  optionDescriptionSelected: {
    color: "#8E562D",
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  choiceChip: {
    borderWidth: 1,
    borderColor: "#DED7D1",
    backgroundColor: "#FAF7F4",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  choiceChipSelected: {
    borderColor: "#F47A24",
    backgroundColor: "#F47A24",
  },

  choiceChipText: {
    color: "#4F4A46",
    fontSize: 13,
    fontWeight: "700",
  },

  choiceChipTextSelected: {
    color: "#FFFFFF",
  },

  textInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#E1DAD4",
    borderRadius: 15,
    backgroundColor: "#FFFCFA",
    color: "#1E1E1E",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  notesInput: {
    minHeight: 120,
  },

  characterCount: {
    color: "#938B84",
    fontSize: 11,
    textAlign: "right",
    marginTop: 7,
  },

  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  preferenceText: {
    flex: 1,
    paddingRight: 14,
  },

  preferenceTitle: {
    color: "#262321",
    fontSize: 15,
    fontWeight: "800",
  },

  preferenceDescription: {
    color: "#77706A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  preferenceDivider: {
    height: 1,
    backgroundColor: "#EFEAE6",
    marginVertical: 15,
  },

  errorBox: {
    backgroundColor: "#FFF0EF",
    borderRadius: 17,
    padding: 15,
  },

  errorTitle: {
    color: "#A62E27",
    fontSize: 14,
    fontWeight: "800",
  },

  errorText: {
    color: "#7E3833",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F47A24",
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  generateButton: {
    minHeight: 66,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F47A24",
    paddingHorizontal: 20,
  },

  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },

  generateButtonSubtext: {
    color: "#FFE6D4",
    fontSize: 12,
    marginTop: 3,
  },

  disabledButton: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.72,
  },
});
