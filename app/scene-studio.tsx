import { canalDynamicColors } from "../theme/canal-dynamic-colors";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
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
  useLocalSearchParams,
} from "expo-router";

import Slider from "@react-native-community/slider";

import {
  BlurView,
} from "expo-blur";

import {
  StatusBar,
} from "expo-status-bar";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  createSceneStudioDraft,
  generateSceneWithSpotifyGenreFallback,
  getSceneFamiliarityLevel,
  SCENE_ACTIVITY_OPTIONS,
  SCENE_ARC_OPTIONS,
  SCENE_ENERGY_OPTIONS,
  SCENE_GENRE_OPTIONS,
  SCENE_MOOD_OPTIONS,
  sceneFamiliarityFromLevel,
} from "../lib/scene-studio";

import type {
  SceneActivity,
  SceneArc,
  SceneEnergy,
  SceneMood,
  SceneStudioDraft,
} from "../lib/scene-studio";

import {
  captureSceneStudioInvalidationGeneration,
  sceneStudioInvalidationAppliesToScope,
  sceneStudioInvalidationGenerationIsCurrent,
  registerSceneStudioInvalidationHandler,
} from "../lib/scene-studio-lifecycle";

import {
  createSceneStudioRepository,
} from "../lib/scene-studio-repository";

import {
  captureSpotifyCanalAccountGuard,
  readSpotifyConnectionStateForAccount,
} from "../lib/spotify-auth";

import type {
  SpotifyCanalAccountGuard,
} from "../lib/spotify-auth";

import {
  readSpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import {
  updateUserDirectedScenePreview,
} from "../lib/scene-studio-manual-preview";

import {
  refillGeneratedSceneToDuration,
} from "../lib/scene-preview-editor";

import {
  addUserSelectedGenreCatalogTracks,
} from "../lib/scene-genre-catalog";

import {
  addSpotifyArtworkToGeneratedScene,
} from "../lib/spotify-scene-artwork";

import {
  captureSceneStudioScope,
  sameSceneStudioScope,
  sceneStudioScopeIsVisible,
} from "../lib/scene-studio-scope";

import type {
  SceneStudioScope,
} from "../lib/scene-studio-scope";

import {
  useAuth,
} from "../providers/auth-provider";

import {
  readScenes,
} from "../lib/scenes";

import {
  generateCreativeSceneName,
} from "../lib/creative-names";

import {
  suggestSceneGenres,
} from "../lib/scene-genre-search";

import {
  LIVING_COVER_RECIPES,
} from "../lib/living-covers";

import {
  sceneAtmosphere,
} from "../components/canal-ui/scene-signature";

import {
  CanalAtmosphereContext,
  CANAL_ATMOSPHERE_TRANSITION_MS,
} from "../theme/canal-atmosphere-context";

import {
  default as Animated,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";

type StudioStep = "moment" | "sound" | "flow" | "review";

function freshDraft(): SceneStudioDraft {
  return createSceneStudioDraft();
}

function sameSpotifyAccountGuard(
  left: SpotifyCanalAccountGuard,
  right: SpotifyCanalAccountGuard,
): boolean {
  return (
    left.ownerId === right.ownerId &&
    left.accountGeneration === right.accountGeneration &&
    left.configured === right.configured
  );
}

function safeBack(): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace("/(tabs)");
}

function ChoiceChip(props: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{
        selected: props.selected,
        disabled: props.disabled === true,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.chip,
        props.selected && styles.chipSelected,
        props.disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          props.selected && styles.chipTextSelected,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function MoodOrb(props: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  index: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{
        selected: props.selected,
        disabled: props.disabled === true,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.moodOrb,
        !props.selected && styles.moodOrbIdle,
        props.selected && styles.moodOrbSelected,
        props.disabled && styles.disabled,
        pressed && styles.moodOrbPressed,
      ]}
    >
      <Text style={[styles.moodOrbText, props.selected && styles.moodOrbTextSelected]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function PreferenceRow(props: {
  label: string;
  helper: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceLabel}>{props.label}</Text>
        <Text style={styles.helperText}>{props.helper}</Text>
      </View>
      <Switch
        accessibilityLabel={props.label}
        accessibilityState={{ disabled: props.disabled === true }}
        disabled={props.disabled}
        onValueChange={props.onValueChange}
        trackColor={{ false: "#39413D", true: "#2E796B" }}
        thumbColor={props.value ? "#72D8C4" : "#BBC2BE"}
        value={props.value}
      />
    </View>
  );
}

export default function SceneStudioScreen() {
  const { setOverride } = use(CanalAtmosphereContext);
  const reduceMotion = useReducedMotion();
  const params = useLocalSearchParams<{ mode?: string; reset?: string; stageId?: string }>();
  const shouldResumePreview = params.mode === "edit";
  const resetToken = params.reset;
  const {
    user,
    accountEpoch,
    sessionGeneration,
  } = useAuth();
  const repositoryRef =
    useRef(createSceneStudioRepository());
  const scope = useMemo(
    () =>
      captureSceneStudioScope({
        userId: user?.id,
        accountEpoch,
        sessionGeneration,
      }),
    [
      accountEpoch,
      sessionGeneration,
      user?.id,
    ],
  );
  const currentScopeRef =
    useRef<SceneStudioScope | null>(scope);

  currentScopeRef.current = scope;

  const [draft, setDraft] =
    useState<SceneStudioDraft>(freshDraft);
  const [loading, setLoading] =
    useState(true);
  const [loadedScope, setLoadedScope] =
    useState<SceneStudioScope | null>(null);
  const [message, setMessage] =
    useState<string | null>(null);
  const [spotifyConnection, setSpotifyConnection] =
    useState<"loading" | "connected" | "disconnected" | "unknown">("loading");
  const [genreQuery, setGenreQuery] =
    useState("");
  const [suggestingName, setSuggestingName] =
    useState(false);
  const [studioStep, setStudioStep] =
    useState<StudioStep>("moment");
  const [activityChosen, setActivityChosen] =
    useState(false);
  const [momentError, setMomentError] =
    useState<string | null>(null);

  const [activationScope, setActivationScope] =
    useState<SceneStudioScope | null>(null);
  const activationRef = useRef<{
    id: number;
    scope: SceneStudioScope;
  } | null>(null);
  const activationSequenceRef = useRef(0);

  const currentScope = useCallback(
    () => currentScopeRef.current,
    [],
  );
  const invalidationGenerationRef = useRef(
    captureSceneStudioInvalidationGeneration(scope),
  );
  const skipNextAutosaveRef = useRef(false);
  const palettePreviewIndexRef = useRef(0);

  const applyStudioPalette = useCallback((index: number): void => {
    const recipe = LIVING_COVER_RECIPES[index % LIVING_COVER_RECIPES.length];
    setOverride(sceneAtmosphere({
      name: recipe.name,
      activity: recipe.activity,
      emotions: recipe.mood,
      energy: recipe.energy,
    }));
  }, [setOverride]);

  useEffect(() => {
    palettePreviewIndexRef.current = 0;
    applyStudioPalette(0);

    const interval = reduceMotion
      ? null
      : setInterval(() => {
          palettePreviewIndexRef.current =
            (palettePreviewIndexRef.current + 1) % LIVING_COVER_RECIPES.length;
          applyStudioPalette(palettePreviewIndexRef.current);
        }, CANAL_ATMOSPHERE_TRANSITION_MS);

    return () => {
      if (interval) clearInterval(interval);
      setOverride(null);
    };
  }, [applyStudioPalette, reduceMotion, setOverride]);

  const scopeReady =
    Boolean(scope) &&
    !loading &&
    sceneStudioScopeIsVisible(
      loadedScope,
      scope,
    );
  const visibleDraft = scopeReady
    ? draft
    : freshDraft();
  const visibleMessage = scopeReady
    ? message
    : null;
  const activationBusy =
    scopeReady &&
    sameSceneStudioScope(
      activationScope,
      scope,
    );
  const genreSuggestions = useMemo(
    () => suggestSceneGenres(
      genreQuery,
      SCENE_GENRE_OPTIONS,
      visibleDraft.preferredGenres,
      genreQuery.trim() ? 14 : 18,
    ),
    [genreQuery, visibleDraft.preferredGenres],
  );

  useEffect(() => {
    let active = true;
    const operationScope = scope;
    const operationGeneration =
      captureSceneStudioInvalidationGeneration(operationScope);
    invalidationGenerationRef.current = operationGeneration;

    const canCommit = (): boolean =>
      active &&
      sceneStudioInvalidationGenerationIsCurrent(
        operationGeneration,
        operationScope,
      ) &&
      Boolean(operationScope) &&
      sameSceneStudioScope(
        operationScope,
        currentScope(),
      );

    const unregister =
      registerSceneStudioInvalidationHandler(
        (invalidation) => {
          if (
            operationScope &&
            sceneStudioInvalidationAppliesToScope(
              invalidation,
              operationScope,
            )
          ) {
            active = false;
            invalidationGenerationRef.current =
              captureSceneStudioInvalidationGeneration(operationScope);
            setDraft(freshDraft());
            setActivityChosen(false);
            setMomentError(null);

            if (invalidation.reason === "device-clear") {
              skipNextAutosaveRef.current = true;
              setLoadedScope(operationScope);
              setMessage(
                "Studio draft cleared from this device.",
              );
              setLoading(false);
            } else {
              setLoadedScope(null);
              setMessage(null);
              setLoading(true);
            }
          }
        },
      );

    const load = async (): Promise<void> => {
      setLoading(true);
      setMessage(null);

      if (!operationScope) {
        if (active) {
          setDraft(freshDraft());
          setLoadedScope(null);
          setMessage(
            "Sign in to keep a Studio draft on this device.",
          );
          setLoading(false);
        }

        return;
      }

      if (!shouldResumePreview) {
        setDraft(freshDraft());
        setActivityChosen(false);
        setMomentError(null);
        setStudioStep("moment");
        setLoadedScope(operationScope);
        setLoading(false);
        return;
      }

      const stored =
        await repositoryRef.current.readDraft({
          scope: operationScope,
          currentScope,
          operationGuard: canCommit,
        });

      if (!canCommit()) {
        return;
      }

      if (stored.kind === "ready") {
        setDraft(stored.value);
        setActivityChosen(true);
      } else {
        setDraft(freshDraft());
        setActivityChosen(false);

        if (stored.kind === "corrupt") {
          setMessage(
            "This Studio draft could not be opened. A new draft is ready.",
          );
        }
      }

      setLoadedScope(operationScope);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
      unregister();
    };
  }, [
    currentScope,
    resetToken,
    scope,
    shouldResumePreview,
  ]);

  useEffect(() => {
    let active = true;
    const operationScope = scope;

    setSpotifyConnection("loading");

    if (!operationScope) {
      setSpotifyConnection("disconnected");
      return () => {
        active = false;
      };
    }

    const loadSpotifyConnection = async (): Promise<void> => {
      try {
        const accountGuard = await captureSpotifyCanalAccountGuard();
        const state = await readSpotifyConnectionStateForAccount(accountGuard);

        if (
          active &&
          sameSceneStudioScope(operationScope, currentScope())
        ) {
          setSpotifyConnection(
            state === "connected" || state === "disconnected"
              ? state
              : "unknown",
          );
        }
      } catch {
        if (
          active &&
          sameSceneStudioScope(operationScope, currentScope())
        ) {
          setSpotifyConnection("unknown");
        }
      }
    };

    void loadSpotifyConnection();

    return () => {
      active = false;
    };
  }, [currentScope, scope]);

  useEffect(() => {
    if (!scope || !scopeReady) {
      return;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    let active = true;
    const operationScope = scope;
    const operationGeneration =
      invalidationGenerationRef.current;

    const save = async (): Promise<void> => {
      const result =
        await repositoryRef.current.saveDraft({
          scope: operationScope,
          currentScope,
          operationGuard: () =>
            active &&
            sceneStudioInvalidationGenerationIsCurrent(
              operationGeneration,
              operationScope,
            ) &&
            sameSceneStudioScope(
              operationScope,
              currentScope(),
            ),
          draft,
        });

      if (result.kind === "conflict" && active) {
        setMessage(
          "Canal kept the newest Studio draft. Review your changes before continuing.",
        );
      }
    };

    void save();

    return () => {
      active = false;
    };
  }, [
    currentScope,
    draft,
    scope,
    scopeReady,
  ]);

  const updateDraft = <Key extends keyof SceneStudioDraft>(
    key: Key,
    value: SceneStudioDraft[Key],
  ): void => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleMood = (mood: SceneMood): void => {
    setDraft((current) => {
      const selected = current.moods.includes(mood);

      return {
        ...current,
        moods: selected
          ? current.moods.filter(
              (item) => item !== mood,
            )
          : [
              ...current.moods.slice(-4),
              mood,
            ],
      };
    });
    setMomentError(null);
  };

  const moveToStudioStep = (nextStep: StudioStep): void => {
    if (nextStep !== "moment" && draft.moods.length === 0) {
      setStudioStep("moment");
      setMomentError("Choose at least one mood before continuing.");
      return;
    }

    setMomentError(null);
    setStudioStep(nextStep);
  };

  const toggleGenre = (genre: string): void => {
    setDraft((current) => {
      const selected =
        current.preferredGenres.includes(genre);

      return {
        ...current,
        preferredGenres: selected
          ? current.preferredGenres.filter(
              (item) => item !== genre,
            )
          : [
              ...current.preferredGenres.slice(0, 4),
              genre,
            ],
      };
    });
  };

  const updateFamiliarityLevel = (level: number): void => {
    const familiarityLevel = Math.round(
      Math.min(100, Math.max(0, level)),
    );

    setDraft((current) => ({
      ...current,
      familiarityLevel,
      familiarity: sceneFamiliarityFromLevel(familiarityLevel),
    }));
  };

  const suggestSceneName = async (): Promise<void> => {
    const operationScope = scope;
    if (!operationScope || !scopeReady || suggestingName) return;

    setSuggestingName(true);
    try {
      const existingScenes = await readScenes();
      if (!sameSceneStudioScope(operationScope, currentScope())) return;

      updateDraft(
        "name",
        generateCreativeSceneName(
          {
            activity: draft.activity,
            moods: draft.moods,
            energy: draft.energy,
            arc: draft.arc,
            genres: draft.preferredGenres,
          },
          {
            seed: `${operationScope.userId}:${Date.now()}:${existingScenes.length}`,
            existingNames: existingScenes.map((scene) => scene.name),
            now: new Date(),
          },
        ),
      );
    } finally {
      if (sameSceneStudioScope(operationScope, currentScope())) {
        setSuggestingName(false);
      }
    }
  };

  const activateUserDirectedScene = async (): Promise<void> => {
    const operationScope = scope;

    if (
      !operationScope ||
      !scopeReady ||
      spotifyConnection !== "connected" ||
      sameSceneStudioScope(
        activationRef.current
          ?.scope,
        operationScope,
      )
    ) {
      return;
    }

    const activationId =
      activationSequenceRef.current +
      1;

    activationSequenceRef.current =
      activationId;
    activationRef.current = {
      id:
        activationId,
      scope:
        operationScope,
    };
    setActivationScope(
      operationScope,
    );
    setMessage(null);

    const operationGeneration =
      invalidationGenerationRef.current;
    const canActivate = (): boolean =>
      activationRef.current
        ?.id === activationId &&
      sceneStudioInvalidationGenerationIsCurrent(
        operationGeneration,
        operationScope,
      ) &&
      sameSceneStudioScope(
        operationScope,
        currentScope(),
      );

    try {
      const startingSpotifyGuard =
        await captureSpotifyCanalAccountGuard();
      const existing =
        await repositoryRef.current.readPreview({
          scope:
            operationScope,
          currentScope,
          operationGuard:
            canActivate,
        });

      if (!canActivate()) {
        return;
      }

      const storedSnapshot = await readSpotifyLibrarySnapshot();

      if (
        !storedSnapshot ||
        storedSnapshot.importStatus?.state === "incomplete"
      ) {
        setMessage(
          "Sync your Spotify Library before creating an automatic Scene.",
        );
        return;
      }

      const snapshot = await addUserSelectedGenreCatalogTracks(
        draft,
        storedSnapshot,
      );
      const existingScenes = await readScenes();
      const existingSceneNames = existingScenes.map(
        (scene) => scene.name,
      );
      const recentSceneTrackIds =
        draft.avoidRecentSceneTracks === false
          ? []
          : existingScenes
              .slice(0, 12)
              .flatMap((scene) =>
                scene.tracks.map((track) => track.id),
              );

      if (existing.kind === "ready") {
        existingSceneNames.push(existing.value.scene.name);
      }
      const activationDraft = draft.name.trim()
        ? draft
        : {
            ...draft,
            name: generateCreativeSceneName(
              {
                activity: draft.activity,
                moods: draft.moods,
                energy: draft.energy,
                arc: draft.arc,
                genres: draft.preferredGenres,
              },
              {
                seed: `${operationScope.userId}:${activationId}:${Date.now()}`,
                existingNames: existingSceneNames,
                now: new Date(),
              },
            ),
          };
      if (!draft.name.trim()) {
        setDraft(activationDraft);
      }
      const endingSpotifyGuard =
        await captureSpotifyCanalAccountGuard();

      if (
        !canActivate() ||
        !sameSpotifyAccountGuard(
          startingSpotifyGuard,
          endingSpotifyGuard,
        )
      ) {
        return;
      }

      const variationSeed =
        `${operationScope.userId}:${activationId}:${Date.now()}`;
      let preview;

      if (shouldResumePreview && existing.kind === "ready") {
        const updated = updateUserDirectedScenePreview(existing.value, activationDraft);
        const candidates = generateSceneWithSpotifyGenreFallback(
          activationDraft,
          snapshot,
          {
            variationSeed,
            existingSceneNames,
            rejectedTrackIds: [
              ...(existing.value.rejectedTrackIds ?? []),
              ...existing.value.trackSignals.map((signal) => signal.track.id),
              ...recentSceneTrackIds,
            ],
          },
        );
        preview = refillGeneratedSceneToDuration(updated, candidates);
      } else {
        preview = generateSceneWithSpotifyGenreFallback(activationDraft, snapshot, {
          variationSeed,
          existingSceneNames,
          rejectedTrackIds: recentSceneTrackIds,
        });
        preview.scene.visibility = "private";
      }
      preview = await addSpotifyArtworkToGeneratedScene(preview);

      const saved =
        await repositoryRef.current.savePreview({
          scope:
            operationScope,
          currentScope,
          operationGuard:
            canActivate,
          expectedRevision:
            existing.kind === "ready"
              ? existing.revision
              : 0,
          preview,
        });

      if (
        !canActivate() ||
        saved.kind === "stale"
      ) {
        return;
      }

      if (saved.kind === "conflict") {
        setMessage(
          "This Scene changed in another view. Review the latest Preview before trying again.",
        );
        return;
      }

      if (canActivate()) {
        if (params.stageId) {
          router.push({
            pathname: "/scene-preview",
            params: { stageId: params.stageId },
          } as never);
        } else {
          router.push("/scene-preview");
        }
      }
    } catch {
      if (canActivate()) {
        setMessage(
          "Canal could not safely start manual track selection. Your Studio draft is still saved.",
        );
      }
    } finally {
      if (activationRef.current?.id === activationId) {
        activationRef.current = null;
        setActivationScope(null);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={safeBack} style={styles.headerIcon}>
            <Text style={styles.headerIconText}>‹</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>New Scene</Text>
          <Pressable accessibilityLabel="Close Scene Studio" accessibilityRole="button" onPress={() => router.replace("/(tabs)")} style={styles.headerIcon}>
            <Text style={styles.closeIconText}>×</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>LIVING GLASS STUDIO</Text>
          <Text accessibilityRole="header" style={styles.title}>Shape the moment.</Text>
          <Text style={styles.subtitle}>Start with the feeling. Canal keeps advanced controls close without making the first decision feel heavy.</Text>
        </View>

        <BlurView intensity={34} tint="dark" style={styles.stepBar}>
          {([
            ["moment", "1 · Moment"],
            ["sound", "2 · Sound"],
            ["flow", "3 · Flow"],
            ["review", "4 · Review"],
          ] as const).map(([step, label]) => (
            <Pressable
              key={step}
              accessibilityLabel={label}
              accessibilityRole="tab"
              accessibilityState={{ selected: studioStep === step }}
              onPress={() => moveToStudioStep(step)}
              style={[styles.stepButton, studioStep === step && styles.stepButtonSelected]}
            >
              <Text style={[styles.stepButtonText, studioStep === step && styles.stepButtonTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </BlurView>

        {loading ? (
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            Loading your Studio draft…
          </Text>
        ) : null}

        {studioStep === "moment" ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.stepContent}>
        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            What are you doing?
          </Text>
          <Text style={styles.helperText}>
            Choose the activity that defines this moment.
          </Text>
          <View style={styles.wrap}>
            {SCENE_ACTIVITY_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                onPress={() => {
                  setActivityChosen(true);
                  updateDraft("activity", option.value as SceneActivity);
                }}
                disabled={!scopeReady}
                selected={activityChosen && visibleDraft.activity === option.value}
              />
            ))}
          </View>
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            How should it feel?
          </Text>
          <Text style={styles.helperText}>
            Choose one to five moods from a richer emotional palette.
          </Text>
          <View style={styles.moodConstellation}>
            {SCENE_MOOD_OPTIONS.map((option, index) => (
              <MoodOrb
                key={option.value}
                label={option.label}
                index={index}
                onPress={() => toggleMood(option.value)}
                disabled={!scopeReady}
                selected={visibleDraft.moods.includes(option.value)}
              />
            ))}
          </View>
          {momentError ? (
            <Text accessibilityLiveRegion="assertive" style={styles.validationText}>
              {momentError}
            </Text>
          ) : null}
        </BlurView>
        <View style={styles.inlineNavigation}>
          <Text style={styles.inlineHint}>Your selections save as you go.</Text>
          <Pressable accessibilityRole="button" onPress={() => moveToStudioStep("sound")} style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Continue to sound →</Text>
          </Pressable>
        </View>
          </Animated.View>
        ) : null}

        {studioStep === "sound" ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.stepContent}>
        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Genres
          </Text>
          <Text style={styles.helperText}>
            Search the full genre catalog. Suggestions narrow as you type, and up to five selections guide automatic track selection.
          </Text>
          {visibleDraft.preferredGenres.length > 0 ? (
            <View style={styles.selectedGenreSection}>
              <Text style={styles.selectedGenreLabel}>Selected</Text>
              <View style={styles.wrap}>
                {visibleDraft.preferredGenres.map((genre) => (
                  <ChoiceChip
                    key={genre}
                    label={`${genre} ×`}
                    onPress={() => toggleGenre(genre)}
                    disabled={!scopeReady}
                    selected
                  />
                ))}
              </View>
            </View>
          ) : null}
          <TextInput accessibilityLabel="Search genres" autoCapitalize="none" autoCorrect={false} editable={scopeReady} onChangeText={setGenreQuery} placeholder="Search genres, like dream pop or neo-soul" placeholderTextColor={canalDynamicColors.muted} returnKeyType="search" style={[styles.textInput, styles.genreSearchInput]} value={genreQuery} />
          <View accessibilityLabel={genreQuery.trim() ? "Genre search suggestions" : "Popular genre suggestions"} accessibilityLiveRegion="polite" style={styles.genreSuggestions}>
            <Text style={styles.genreSuggestionLabel}>{genreQuery.trim() ? `${genreSuggestions.length} suggestions` : "Popular genres"}</Text>
            <View style={styles.wrap}>{genreSuggestions.map((genre) => <ChoiceChip key={genre} label={genre} onPress={() => { toggleGenre(genre); setGenreQuery(""); }} disabled={!scopeReady} selected={false} />)}</View>
            {genreQuery.trim() && genreSuggestions.length === 0 ? <Text style={styles.genreEmptyText}>No supported genre matches yet. Try a broader spelling.</Text> : null}
          </View>
        </BlurView>
        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Energy</Text>
          <Text style={styles.helperText}>Set the energy you want the sequence to hold.</Text>
          <View style={styles.wrap}>{SCENE_ENERGY_OPTIONS.map((option) => <ChoiceChip key={option.value} label={option.label} onPress={() => updateDraft("energy", option.value as SceneEnergy)} disabled={!scopeReady} selected={visibleDraft.energy === option.value} />)}</View>
        </BlurView>
        <View style={styles.sliderGrid}>
          <BlurView intensity={46} tint="dark" style={[styles.card, styles.sliderCard]}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Familiarity</Text>
            <Text style={styles.helperText}>Move the generated playlist from familiar favorites toward less obvious discoveries.</Text>
            <View style={styles.familiarityLabels}><Text style={styles.familiarityLabel}>Familiar</Text><Text style={styles.familiarityValue}>{visibleDraft.familiarity}</Text><Text style={styles.familiarityLabel}>Discover / new</Text></View>
            <Slider accessibilityLabel="Scene familiarity" accessibilityHint="Adjusts from familiar music to new discoveries" disabled={!scopeReady} maximumTrackTintColor="#39413D" maximumValue={100} minimumTrackTintColor="#50CDB6" minimumValue={0} onValueChange={updateFamiliarityLevel} step={1} thumbTintColor="#72D8C4" value={getSceneFamiliarityLevel(visibleDraft)} />
          </BlurView>
          <BlurView intensity={46} tint="dark" style={[styles.card, styles.sliderCard]}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Length</Text>
            <View style={styles.familiarityLabels}><Text style={styles.familiarityLabel}>15 min</Text><Text style={styles.familiarityValue}>{visibleDraft.durationMinutes} min</Text><Text style={styles.familiarityLabel}>3 hr</Text></View>
            <Slider accessibilityLabel="Scene length" accessibilityHint="Adjusts the target playlist length from fifteen minutes to three hours" disabled={!scopeReady} maximumTrackTintColor="#39413D" maximumValue={180} minimumTrackTintColor="#50CDB6" minimumValue={15} onValueChange={(durationMinutes) => updateDraft("durationMinutes", durationMinutes)} step={5} thumbTintColor="#72D8C4" value={visibleDraft.durationMinutes} />
          </BlurView>
        </View>
        <View style={styles.inlineNavigation}>
          <Pressable accessibilityRole="button" onPress={() => setStudioStep("moment")} style={styles.inlineButton}><Text style={styles.inlineButtonText}>← Moment</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => moveToStudioStep("flow")} style={styles.inlineButton}><Text style={styles.inlineButtonText}>Continue to flow →</Text></Pressable>
        </View>
          </Animated.View>
        ) : null}

        {studioStep === "flow" ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.stepContent}>
        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Length
          </Text>
          <View style={styles.familiarityLabels}>
            <Text style={styles.familiarityLabel}>15 min</Text>
            <Text style={styles.familiarityValue}>{visibleDraft.durationMinutes} min</Text>
            <Text style={styles.familiarityLabel}>3 hr</Text>
          </View>
          <Slider
            accessibilityLabel="Scene length"
            accessibilityHint="Adjusts the target playlist length from fifteen minutes to two hours"
            disabled={!scopeReady}
            maximumTrackTintColor="#39413D"
            maximumValue={180}
            minimumTrackTintColor="#50CDB6"
            minimumValue={15}
            onValueChange={(durationMinutes) =>
              updateDraft("durationMinutes", durationMinutes)
            }
            step={5}
            thumbTintColor="#72D8C4"
            value={visibleDraft.durationMinutes}
          />
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Scene arc
          </Text>
          <Text style={styles.helperText}>
            Choose how the energy should move from the first track to the last.
          </Text>
          <View style={styles.wrap}>
            {SCENE_ARC_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                onPress={() => updateDraft("arc", option.value as SceneArc)}
                disabled={!scopeReady}
                selected={visibleDraft.arc === option.value}
              />
            ))}
          </View>
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Preferences
          </Text>
          <View style={styles.policyRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceLabel}>Recent listening</Text>
              <Text style={styles.helperText}>
                Recently played tracks are considered alongside saved tracks and playlist tracks.
              </Text>
            </View>
          </View>
          <PreferenceRow
            disabled={!scopeReady}
            helper="When off, explicit Spotify results remain visible but cannot be added."
            label="Allow explicit tracks"
            onValueChange={(allowExplicit) => updateDraft("allowExplicit", allowExplicit)}
            value={visibleDraft.allowExplicit}
          />
          <PreferenceRow
            disabled={!scopeReady}
            helper="When on, tracks with adjacent or unselected genre families stay out of the generated Scene."
            label="Keep recommendations inside selected genres"
            onValueChange={(strictGenres) =>
              updateDraft("allowAdjacentGenres", !strictGenres)
            }
            value={!visibleDraft.allowAdjacentGenres}
          />
          <PreferenceRow
            disabled={!scopeReady}
            helper="Filters tracks used in your twelve most recent saved Scenes before generation."
            label="Avoid songs used in recent Scenes"
            onValueChange={(avoidRecentSceneTracks) =>
              updateDraft("avoidRecentSceneTracks", avoidRecentSceneTracks)
            }
            value={visibleDraft.avoidRecentSceneTracks !== false}
          />
          <PreferenceRow
            disabled={!scopeReady}
            helper="Orders the playlist around the selected arc using estimated energy changes."
            label="Favor smooth energy transitions"
            onValueChange={(smoothTransitions) =>
              updateDraft("smoothTransitions", smoothTransitions)
            }
            value={visibleDraft.smoothTransitions !== false}
          />
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <View style={styles.sectionHeaderRow}><Text accessibilityRole="header" style={styles.sectionTitle}>Direct Canal</Text><Text style={styles.sectionMeta}>Refines ranking</Text></View>
          <Text style={styles.helperText}>Describe what belongs—or what should stay out. Canal matches these words against track, artist, album, and genre metadata when ranking the playlist.</Text>
          <TextInput accessibilityLabel="Scene notes" editable={scopeReady} maxLength={300} multiline onChangeText={(notes) => updateDraft("notes", notes)} placeholder="Warm guitars, no stadium rock, leave room to think…" placeholderTextColor={canalDynamicColors.muted} style={[styles.textInput, styles.notesInput]} value={visibleDraft.notes} />
        </BlurView>
        <View style={styles.inlineNavigation}>
          <Pressable accessibilityRole="button" onPress={() => setStudioStep("sound")} style={styles.inlineButton}><Text style={styles.inlineButtonText}>← Sound</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => moveToStudioStep("review")} style={styles.inlineButton}><Text style={styles.inlineButtonText}>Review Scene →</Text></Pressable>
        </View>
          </Animated.View>
        ) : null}

        {studioStep === "review" ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.stepContent}>
            <BlurView intensity={46} tint="dark" style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderCopy}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Name this Scene</Text>
                  <Text style={styles.helperText}>Add your own title or let Canal create a unique name from every choice you made. A name is generated automatically if you leave this blank.</Text>
                </View>
                <Pressable
                  accessibilityLabel="Suggest a unique Scene name"
                  accessibilityRole="button"
                  accessibilityState={{ busy: suggestingName, disabled: !scopeReady || suggestingName }}
                  disabled={!scopeReady || suggestingName}
                  onPress={() => void suggestSceneName()}
                  style={({ pressed }) => [styles.suggestNameButton, pressed && styles.pressed]}
                >
                  <Text style={styles.suggestNameText}>{suggestingName ? "Thinking…" : "Suggest"}</Text>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel="Scene name"
                editable={scopeReady}
                maxLength={80}
                onChangeText={(name) => updateDraft("name", name)}
                placeholder="Canal will name it from your direction…"
                placeholderTextColor={canalDynamicColors.muted}
                style={[styles.textInput, styles.sceneNameInput]}
                value={visibleDraft.name}
              />
            </BlurView>
            <View style={styles.reviewHero}>
              <Text style={styles.reviewEyebrow}>YOUR SCENE DIRECTION</Text>
              <Text style={styles.reviewName}>{visibleDraft.name.trim() || "Untitled Scene"}</Text>
              <Text style={styles.reviewSubtitle}>{visibleDraft.activity} · {visibleDraft.moods.join(", ")}</Text>
              <View style={styles.miniWave}>{[14, 34, 22, 42, 18, 29, 12].map((height, index) => <View key={`${height}-${index}`} style={[styles.waveBar, { height }]} />)}</View>
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Sound</Text><Text style={styles.summaryValue}>{visibleDraft.preferredGenres.slice(0, 2).join(" + ") || "Open direction"}</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Discovery</Text><Text style={styles.summaryValue}>{getSceneFamiliarityLevel(visibleDraft)}% new</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Length</Text><Text style={styles.summaryValue}>{visibleDraft.durationMinutes} minutes</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Arc</Text><Text style={styles.summaryValue}>{visibleDraft.arc}</Text></View>
            </View>
            <BlurView intensity={46} tint="dark" style={styles.sourceCard}>
              <View style={[styles.sourceDot, spotifyConnection !== "connected" && styles.sourceDotInactive]}><Text style={styles.sourceDotText}>S</Text></View>
              <View style={styles.sourceCopy}><Text style={styles.sourceTitle}>{spotifyConnection === "connected" ? "Spotify library connected" : spotifyConnection === "loading" ? "Checking Spotify…" : "Spotify connection needed"}</Text><Text style={styles.sourceText}>{spotifyConnection === "connected" ? "Canal will build an editable preview. Nothing saves until you choose Save." : "Connect Spotify to generate this Scene. Your choices remain saved."}</Text></View>
              {spotifyConnection !== "connected" && spotifyConnection !== "loading" ? <Pressable accessibilityLabel="Open Music Services" onPress={() => router.push("/music-services")} style={styles.sourceAction}><Text style={styles.sourceActionText}>Fix</Text></Pressable> : null}
            </BlurView>
            <BlurView intensity={46} tint="dark" style={styles.card}>
              <View style={styles.sectionHeaderRow}><Text accessibilityRole="header" style={styles.sectionTitle}>What happens next</Text><Text style={styles.sectionMeta}>Editable first</Text></View>
              <PreferenceRow disabled helper="Remove, reorder, swap, or regenerate before saving" label="Generate private preview" onValueChange={() => undefined} value />
              <PreferenceRow helper="Off · preview the list first" label="Start playback automatically" onValueChange={() => undefined} value={false} />
            </BlurView>
            <View style={styles.inlineNavigation}><Pressable accessibilityRole="button" onPress={() => setStudioStep("flow")} style={styles.inlineButton}><Text style={styles.inlineButtonText}>← Flow</Text></Pressable><Text style={styles.inlineHint}>All required choices complete</Text></View>
          </Animated.View>
        ) : null}

        {visibleMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            {visibleMessage}
          </Text>
        ) : null}

      </ScrollView>
      <BlurView intensity={66} tint="dark" style={styles.actionDock}>
        <Pressable
          accessibilityLabel="Preview another Scene atmosphere"
          accessibilityRole="button"
          onPress={() => {
            palettePreviewIndexRef.current = (palettePreviewIndexRef.current + 1) % LIVING_COVER_RECIPES.length;
            applyStudioPalette(palettePreviewIndexRef.current);
          }}
          style={styles.atmosphereButton}
        ><Text style={styles.atmosphereButtonText}>≈</Text></Pressable>
        <Pressable
          accessibilityHint={studioStep === "review" ? "Commits a private editable Preview." : "Moves to the next Scene creation step."}
          accessibilityLabel={studioStep === "review" ? (shouldResumePreview ? "Update Scene Preview" : "Generate editable preview") : `Continue from ${studioStep}`}
          accessibilityRole="button"
          accessibilityState={{ busy: activationBusy, disabled: studioStep === "review" && (!scopeReady || spotifyConnection !== "connected" || activationBusy) }}
          disabled={studioStep === "review" && (!scopeReady || spotifyConnection !== "connected" || activationBusy)}
          onPress={() => {
            if (studioStep === "moment") moveToStudioStep("sound");
            else if (studioStep === "sound") moveToStudioStep("flow");
            else if (studioStep === "flow") moveToStudioStep("review");
            else void activateUserDirectedScene();
          }}
          style={[styles.dockContinue, studioStep === "review" && (!scopeReady || spotifyConnection !== "connected" || activationBusy) && styles.disabled]}
        ><Text style={styles.dockContinueText}>{activationBusy ? "Preparing Scene…" : studioStep === "moment" ? "Continue to Sound" : studioStep === "sound" ? "Continue to Flow" : studioStep === "flow" ? "Review Scene" : shouldResumePreview ? "Update editable preview" : "Generate editable preview"}</Text></Pressable>
      </BlurView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:"transparent"}, content:{gap:14,paddingHorizontal:18,paddingTop:8,paddingBottom:190},
  topBar:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"}, topBarTitle:{color:"#F7F4EC",fontSize:16,fontWeight:"800"},
  headerIcon:{alignItems:"center",justifyContent:"center",minHeight:48,minWidth:48}, headerIconText:{color: canalDynamicColors.text,fontSize:35,lineHeight:38}, closeIconText:{color: canalDynamicColors.text,fontSize:25},
  hero:{gap:6,paddingVertical:10}, eyebrow:{color: canalDynamicColors.mint,fontSize:11,fontWeight:"900",letterSpacing:1.4}, title:{color:"#FFFFFF",fontFamily:"Georgia",fontSize:38,fontWeight:"700"}, subtitle:{color:"rgba(255,255,255,.78)",fontSize:15,lineHeight:22},
  stepBar:{borderColor:"rgba(255,255,255,.17)",borderRadius:20,borderWidth:1,flexDirection:"row",gap:5,overflow:"hidden",padding:5}, stepButton:{alignItems:"center",borderRadius:15,flex:1,justifyContent:"center",minHeight:45,paddingHorizontal:3}, stepButtonSelected:{backgroundColor:"rgba(228,255,248,.9)"}, stepButtonText:{color:"rgba(255,255,255,.58)",fontSize:10,fontWeight:"600"}, stepButtonTextSelected:{color:"#164054"}, stepContent:{gap:10},
  card:{backgroundColor:"rgba(255,255,255,.08)",borderColor:"rgba(255,255,255,.18)",borderRadius:26,borderWidth:1,gap:12,overflow:"hidden",padding:18}, sectionHeaderRow:{alignItems:"flex-start",flexDirection:"row",gap:12},sectionHeaderCopy:{flex:1,gap:6},sectionTitle:{color:"#FFFFFF",fontSize:19,fontWeight:"800"},sectionMeta:{color: canalDynamicColors.mint,fontSize:11,fontWeight:"800"},helperText:{color:"rgba(255,255,255,.7)",fontSize:13,lineHeight:19},
  wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{alignItems:"center",backgroundColor:"rgba(255,255,255,.07)",borderColor:"rgba(255,255,255,.18)",borderRadius:999,borderWidth:1,justifyContent:"center",minHeight:48,paddingHorizontal:15},chipSelected:{backgroundColor:"rgba(114,216,196,.9)",borderColor:"#A8F3E3"},chipText:{color:"rgba(255,255,255,.8)",fontSize:13,fontWeight:"700"},chipTextSelected:{color:"#103C46"},
  moodConstellation:{flexDirection:"row",flexWrap:"wrap",gap:9},moodOrb:{alignItems:"center",borderRadius:999,justifyContent:"center",minHeight:52,minWidth:82,paddingHorizontal:14},moodOrbIdle:{backgroundColor:"rgba(255,255,255,.07)",borderColor:"rgba(255,255,255,.17)",borderWidth:1},moodOrbSelected:{backgroundColor:"rgba(114,216,196,.92)"},moodOrbPressed:{opacity:.72},moodOrbText:{color:"rgba(255,255,255,.82)",fontSize:13,fontWeight:"700"},moodOrbTextSelected:{color:"#103C46"},
  textInput:{backgroundColor:"rgba(8,29,50,.26)",borderColor:"rgba(255,255,255,.17)",borderRadius:17,borderWidth:1,color: canalDynamicColors.text,fontSize:15,minHeight:50,paddingHorizontal:14,paddingVertical:12},sceneNameInput:{fontFamily:"Georgia",fontSize:18},notesInput:{minHeight:100,textAlignVertical:"top"},genreSearchInput:{marginTop:2},genreSuggestions:{gap:8},genreSuggestionLabel:{color: canalDynamicColors.muted,fontSize:11,fontWeight:"800"},genreEmptyText:{color: canalDynamicColors.muted,fontSize:13},selectedGenreSection:{gap:8},selectedGenreLabel:{color: canalDynamicColors.mint,fontSize:11,fontWeight:"800"},
  sliderGrid:{gap:10},sliderCard:{flex:1},familiarityLabels:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"},familiarityLabel:{color:"rgba(255,255,255,.62)",fontSize:11,fontWeight:"700"},familiarityValue:{color:"#FFFFFF",fontSize:14,fontWeight:"800"},
  preferenceRow:{alignItems:"center",borderTopColor:"rgba(255,255,255,.1)",borderTopWidth:1,flexDirection:"row",gap:12,minHeight:64,paddingTop:10},preferenceCopy:{flex:1},preferenceLabel:{color:"#FFFFFF",fontSize:14,fontWeight:"800"},policyRow:{paddingBottom:4},
  inlineNavigation:{alignItems:"center",flexDirection:"row",justifyContent:"space-between",gap:10},inlineButton:{alignItems:"center",justifyContent:"center",minHeight:48,paddingHorizontal:8},inlineButtonText:{color:"#C7FFF2",fontSize:14,fontWeight:"800"},inlineHint:{color:"rgba(255,255,255,.58)",fontSize:11,flex:1},
  reviewHero:{alignItems:"center",gap:8,paddingVertical:18},reviewEyebrow:{color: canalDynamicColors.mint,fontSize:10,fontWeight:"900",letterSpacing:1.5},reviewName:{color:"#FFFFFF",fontFamily:"Georgia",fontSize:30,fontWeight:"700",textAlign:"center"},reviewSubtitle:{color:"rgba(255,255,255,.7)",fontSize:13,textAlign:"center"},miniWave:{alignItems:"center",flexDirection:"row",gap:5,height:48},waveBar:{backgroundColor:"#72D8C4",borderRadius:4,width:5},summaryGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},summaryCard:{backgroundColor:"rgba(255,255,255,.07)",borderRadius:17,gap:4,minHeight:74,padding:12,width:"48%"},summaryLabel:{color:"rgba(255,255,255,.55)",fontSize:10,fontWeight:"800"},summaryValue:{color:"#FFFFFF",fontSize:13,fontWeight:"800"},
  sourceCard:{alignItems:"center",backgroundColor:"rgba(255,255,255,.09)",borderColor:"rgba(255,255,255,.18)",borderRadius:22,borderWidth:1,flexDirection:"row",gap:12,padding:15},sourceDot:{alignItems:"center",backgroundColor:"#1DB954",borderRadius:18,height:36,justifyContent:"center",width:36},sourceDotInactive:{backgroundColor:"rgba(255,255,255,.14)"},sourceDotText:{color:"#FFFFFF",fontSize:15,fontWeight:"900"},sourceCopy:{flex:1},sourceTitle:{color:"#FFFFFF",fontSize:14,fontWeight:"800"},sourceText:{color:"rgba(255,255,255,.65)",fontSize:12,lineHeight:17},sourceAction:{alignItems:"center",justifyContent:"center",minHeight:48,minWidth:48},sourceActionText:{color: canalDynamicColors.mint,fontWeight:"900"},
  actionDock:{alignItems:"center",backgroundColor:"rgba(7,25,45,.74)",borderTopColor:"rgba(255,255,255,.17)",borderTopWidth:1,bottom:0,flexDirection:"row",gap:10,left:0,paddingBottom:30,paddingHorizontal:18,paddingTop:12,position:"absolute",right:0},atmosphereButton:{alignItems:"center",borderRadius:18,justifyContent:"center",minHeight:50,minWidth:50},atmosphereButtonText:{color:"#C7FFF2",fontSize:20},dockContinue:{alignItems:"center",backgroundColor:"#DFFFF7",borderRadius:19,flex:1,justifyContent:"center",minHeight:54,paddingHorizontal:16},dockContinueText:{color:"#153F50",fontSize:15,fontWeight:"900"},
  suggestNameButton:{alignItems:"center",justifyContent:"center",minHeight:48,paddingHorizontal:8},suggestNameText:{color: canalDynamicColors.mint,fontSize:13,fontWeight:"900"},statusText:{color:"#FFFFFF",fontSize:13,lineHeight:19},validationText:{color:"#FFD1C7",fontSize:13,fontWeight:"800"},disabled:{opacity:.45},pressed:{opacity:.72},
});
