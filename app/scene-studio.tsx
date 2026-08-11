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
  regenerateGeneratedSceneEditor,
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
import { consumeOnboardingSceneSeed } from "../lib/onboarding-scene-seed";
import type { StoredScene } from "../lib/scenes";

import {
  generateCreativeSceneName,
} from "../lib/creative-names";
import {
  readSceneRecommendationLearning,
} from "../lib/scene-recommendation-feedback";

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
  CANAL_STUDIO_ATMOSPHERE_TRANSITION_MS,
} from "../theme/canal-atmosphere-context";

import {
  default as Animated,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import { getRuntimeCanalSettings } from "../lib/app-settings";
import { buildSceneReshootDraft } from "../lib/scene-reshoot";
import { loadPublicScene } from "../lib/social";

type StudioStep = "moment" | "sound" | "flow" | "review";

// The recipe array is ordered for classification priority. Studio needs a
// different order so adjacent frames stay near one another on the hue wheel.
// Ember closes the path back into Solar without a visible loop reset.
const STUDIO_PALETTE_SEQUENCE = [0, 6, 5, 4, 9, 3, 2, 8, 7, 1] as const;

function freshDraft(): SceneStudioDraft {
  const draft = createSceneStudioDraft();
  const settings = getRuntimeCanalSettings();
  return {
    ...draft,
    allowExplicit: settings.allowExplicitDefault,
    smoothTransitions: settings.smoothTransitionsDefault,
    avoidRecentSceneTracks: settings.avoidRecentDefault,
  };
}

function sceneMoodSeed(value: unknown): SceneMood | undefined {
  if (typeof value !== "string" || value.length > 40) return undefined;
  const normalized = value.trim().toLowerCase();
  return SCENE_MOOD_OPTIONS.find((option) => option.value === normalized)?.value;
}

function sceneDirectionSeed(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
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
    <Pressable
      accessibilityLabel={props.label}
      accessibilityHint={props.helper}
      accessibilityRole="switch"
      accessibilityState={{ checked: props.value, disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={() => props.onValueChange(!props.value)}
      style={({ pressed }) => [styles.preferenceRow, props.value && styles.preferenceRowSelected, props.disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.compactSwitch, props.value && styles.compactSwitchSelected]}>
        <View style={[styles.compactSwitchKnob, props.value && styles.compactSwitchKnobSelected]} />
      </View>
      <Text numberOfLines={2} style={[styles.preferenceLabel, props.value && styles.preferenceLabelSelected]}>{props.label}</Text>
    </Pressable>
  );
}

function EnergyChoice(props: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${props.label} energy`}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected, disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.energyChoice, pressed && styles.pressed]}
    >
      <Text style={[styles.energyChoiceText, props.selected && styles.energyChoiceTextSelected]}>{props.label}</Text>
      <View style={[styles.energyMarker, props.selected && styles.energyMarkerSelected]} />
    </Pressable>
  );
}

export default function SceneStudioScreen() {
  const { setOverride } = use(CanalAtmosphereContext);
  const reduceMotion = useReducedMotion();
  const params = useLocalSearchParams<{ mode?: string; reset?: string; stageId?: string; quickMood?: string; direct?: string; anchorTrackId?: string; reshootOwnerId?: string; reshootSceneId?: string; combineSceneIds?: string }>();
  const shouldResumePreview = params.mode === "edit";
  const resetToken = params.reset;
  const quickMoodSeed = sceneMoodSeed(params.quickMood);
  const directSeed = sceneDirectionSeed(params.direct);
  const anchorTrackId = typeof params.anchorTrackId === "string" && /^[A-Za-z0-9]+$/u.test(params.anchorTrackId)
    ? params.anchorTrackId
    : undefined;
  const reshootOwnerId = typeof params.reshootOwnerId === "string" && params.reshootOwnerId.length <= 64 ? params.reshootOwnerId : "";
  const reshootSceneId = typeof params.reshootSceneId === "string" && params.reshootSceneId.length <= 160 ? params.reshootSceneId : "";
  const combineSceneIds = useMemo(
    () =>
      typeof params.combineSceneIds === "string"
        ? params.combineSceneIds
            .split(",")
            .filter((id) => /^[A-Za-z0-9-]{1,160}$/u.test(id))
            .slice(0, 4)
        : [],
    [params.combineSceneIds],
  );
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
    const recipe = LIVING_COVER_RECIPES[
      STUDIO_PALETTE_SEQUENCE[index % STUDIO_PALETTE_SEQUENCE.length]
    ];
    setOverride({
      ...sceneAtmosphere({
        name: recipe.name,
        activity: recipe.activity,
        emotions: recipe.mood,
        energy: recipe.energy,
      }),
      transitionMs: CANAL_STUDIO_ATMOSPHERE_TRANSITION_MS,
    });
  }, [setOverride]);

  useEffect(() => {
    palettePreviewIndexRef.current = 0;
    applyStudioPalette(0);

    const interval = reduceMotion
      ? null
      : setInterval(() => {
          palettePreviewIndexRef.current =
            (palettePreviewIndexRef.current + 1) % STUDIO_PALETTE_SEQUENCE.length;
          applyStudioPalette(palettePreviewIndexRef.current);
        }, CANAL_STUDIO_ATMOSPHERE_TRANSITION_MS);

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
            let nextDraft = freshDraft();
            let seededActivity = false;
            if (!reshootOwnerId && !reshootSceneId) {
              const onboardingSeed = await consumeOnboardingSceneSeed(
                operationScope.userId,
              ).catch(() => null);
              if (!canCommit()) return;
              if (onboardingSeed) {
                const activityOption = SCENE_ACTIVITY_OPTIONS.find(
                  (option) =>
                    option.value === onboardingSeed.activity.trim().toLowerCase() ||
                    option.label.toLowerCase() === onboardingSeed.activity.trim().toLowerCase(),
                );
                const seededMoods = onboardingSeed.moods
                  .map((mood) => {
                    const normalized = mood.trim().toLowerCase();
                    return SCENE_MOOD_OPTIONS.find(
                      (option) => option.value === normalized || option.label.toLowerCase() === normalized,
                    )?.value;
                  })
                  .filter((mood): mood is SceneMood => Boolean(mood))
                  .slice(0, 5);
                const seededGenres = onboardingSeed.genres
                  .map((genre) =>
                    SCENE_GENRE_OPTIONS.find(
                      (option) => option.toLowerCase() === genre.trim().toLowerCase(),
                    ),
                  )
                  .filter((genre): genre is (typeof SCENE_GENRE_OPTIONS)[number] => Boolean(genre))
                  .slice(0, 5);
                const familiarity = onboardingSeed.familiarity.trim().toLowerCase();
                const familiarityLevel = familiarity === "familiar" ? 15 : familiarity === "discovery" ? 85 : 50;
                nextDraft = {
                  ...nextDraft,
                  activity: activityOption?.value ?? nextDraft.activity,
                  moods: seededMoods,
                  preferredGenres: seededGenres,
                  familiarity: sceneFamiliarityFromLevel(familiarityLevel),
                  familiarityLevel,
                  allowAdjacentGenres: onboardingSeed.allowAdjacentGenres,
                  allowExplicit: onboardingSeed.allowExplicit,
                  notes: onboardingSeed.notes,
                };
                seededActivity = Boolean(activityOption);
              }
            }
            if (reshootOwnerId && reshootSceneId) {
              try {
                const [publicSource, personalScenes] = await Promise.all([loadPublicScene(reshootOwnerId, reshootSceneId), readScenes()]);
                if (!canCommit()) return;
                nextDraft = buildSceneReshootDraft(publicSource.scene, combineSceneIds.map((id) => personalScenes.find((scene) => scene.id === id)).filter((scene): scene is StoredScene => Boolean(scene)));
              } catch (error) {
                if (!canCommit()) return;
                setMessage(error instanceof Error ? error.message : "Canal could not prepare this Reshoot.");
              }
            }
            setDraft({
              ...nextDraft,
              moods: quickMoodSeed ? [quickMoodSeed] : nextDraft.moods,
              notes: directSeed || nextDraft.notes,
            });
            setActivityChosen(Boolean(reshootOwnerId && reshootSceneId) || seededActivity);
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
        directSeed,
        combineSceneIds,
        quickMoodSeed,
        resetToken,
        reshootOwnerId,
        reshootSceneId,
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
    if (!draft.moods.includes(mood) && draft.moods.length >= 5) {
      setMomentError("You can choose up to five moods. Remove one before adding another.");
      return;
    }
    setDraft((current) => {
      const selected = current.moods.includes(mood);

      return {
        ...current,
        moods: selected
          ? current.moods.filter(
              (item) => item !== mood,
            )
          : [...current.moods, mood],
      };
    });
    setMomentError(null);
  };

  const moveToStudioStep = (nextStep: StudioStep): void => {
    if (nextStep !== "moment" && !activityChosen) {
      setStudioStep("moment");
      setMomentError("Choose what you are doing before continuing.");
      return;
    }

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
      const learning = await readSceneRecommendationLearning(
        operationScope,
        currentScope,
        draft,
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
        const candidates = generateSceneWithSpotifyGenreFallback(
          activationDraft,
          snapshot,
          {
            variationSeed,
            existingSceneNames,
            rejectedTrackIds: [
              ...(existing.value.rejectedTrackIds ?? []),
              ...learning.rejectedTrackIds,
              ...existing.value.trackSignals.map((signal) => signal.track.id),
              ...recentSceneTrackIds,
            ],
            deprioritizedTrackIds: learning.deprioritizedTrackIds,
            preferredTrackIds: anchorTrackId ? [anchorTrackId, ...learning.preferredTrackIds] : learning.preferredTrackIds,
            anchorTrackId,
            reasonBias: learning.reasonBias,
          },
        );
        // Returning from Preview means the listener changed the generation
        // intent. Replace the editable playlist as one regeneration instead
        // of retaining the old sequence and merely filling extra duration.
        preview = regenerateGeneratedSceneEditor(existing.value, candidates);
      } else {
        preview = generateSceneWithSpotifyGenreFallback(activationDraft, snapshot, {
          variationSeed,
          existingSceneNames,
          rejectedTrackIds: [...recentSceneTrackIds, ...learning.rejectedTrackIds],
          deprioritizedTrackIds: learning.deprioritizedTrackIds,
          preferredTrackIds: anchorTrackId ? [anchorTrackId, ...learning.preferredTrackIds] : learning.preferredTrackIds,
          anchorTrackId,
          reasonBias: learning.reasonBias,
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

        {studioStep === "moment" ? <View style={styles.hero}>
          <Text style={styles.eyebrow}>LIVING GLASS STUDIO</Text>
          <Text accessibilityRole="header" style={styles.title}>Shape the moment.</Text>
          <Text style={styles.subtitle}>Start with the feeling. Canal keeps advanced controls close without making the first decision feel heavy.</Text>
        </View> : null}

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactRail}>
            {SCENE_ACTIVITY_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                onPress={() => {
                  setActivityChosen(true);
                  setMomentError(null);
                  updateDraft("activity", option.value as SceneActivity);
                }}
                disabled={!scopeReady}
                selected={activityChosen && visibleDraft.activity === option.value}
              />
            ))}
          </ScrollView>
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            How should it feel?
          </Text>
          <View style={styles.compactSectionHeader}><Text style={styles.helperText}>Choose up to five.</Text><Text accessibilityLiveRegion="polite" style={styles.moodCount}>{visibleDraft.moods.length}/5</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactRail}>
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
          </ScrollView>
          {momentError ? (
            <Text accessibilityLiveRegion="assertive" style={styles.validationText}>
              {momentError}
            </Text>
          ) : null}
        </BlurView>
          </Animated.View>
        ) : null}

        {studioStep === "sound" ? (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.stepContent}>
        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Genres
          </Text>
          {visibleDraft.preferredGenres.length > 0 ? (
            <View style={styles.selectedGenreSection}>
              <Text style={styles.selectedGenreLabel}>Selected</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactRail}>
                {visibleDraft.preferredGenres.map((genre) => (
                  <ChoiceChip
                    key={genre}
                    label={`${genre} ×`}
                    onPress={() => toggleGenre(genre)}
                    disabled={!scopeReady}
                    selected
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <TextInput accessibilityLabel="Search genres" autoCapitalize="none" autoCorrect={false} editable={scopeReady} onChangeText={setGenreQuery} placeholder="Search genres, like dream pop or neo-soul" placeholderTextColor={canalDynamicColors.muted} returnKeyType="search" style={[styles.textInput, styles.genreSearchInput]} value={genreQuery} />
          <View accessibilityLabel={genreQuery.trim() ? "Genre search suggestions" : "Popular genre suggestions"} accessibilityLiveRegion="polite" style={styles.genreSuggestions}>
            <Text style={styles.genreSuggestionLabel}>{genreQuery.trim() ? `${genreSuggestions.length} suggestions` : "Popular genres"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactRail}>{genreSuggestions.map((genre) => <ChoiceChip key={genre} label={genre} onPress={() => { toggleGenre(genre); setGenreQuery(""); }} disabled={!scopeReady} selected={false} />)}</ScrollView>
            {genreQuery.trim() && genreSuggestions.length === 0 ? <Text style={styles.genreEmptyText}>No supported genre matches yet. Try a broader spelling.</Text> : null}
          </View>
        </BlurView>
        <BlurView intensity={38} tint="dark" style={styles.adjacentPolicyCard}>
          <Pressable
            accessibilityHint="Strict matches are selected first. If they cannot fill the requested length, Canal uses nearby genre and mood families for the remainder."
            accessibilityLabel="Allow adjacent sounds"
            accessibilityRole="switch"
            accessibilityState={{ checked: visibleDraft.allowAdjacentGenres, disabled: !scopeReady }}
            disabled={!scopeReady}
            onPress={() => updateDraft("allowAdjacentGenres", !visibleDraft.allowAdjacentGenres)}
            style={({ pressed }) => [styles.adjacentPolicyRow, pressed && styles.pressed]}
          >
            <View style={styles.adjacentPolicyCopy}>
              <Text style={styles.adjacentPolicyTitle}>Allow adjacent sounds</Text>
              <Text style={styles.adjacentPolicyHelper}>Strict matches first. If needed, fill the remaining time from nearby genre and mood families.</Text>
            </View>
            <View style={[styles.compactSwitch, visibleDraft.allowAdjacentGenres && styles.compactSwitchSelected]}>
              <View style={[styles.compactSwitchKnob, visibleDraft.allowAdjacentGenres && styles.compactSwitchKnobSelected]} />
            </View>
          </Pressable>
        </BlurView>
        <BlurView intensity={38} tint="dark" style={styles.soundTuningCard}>
          <View style={styles.energyCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Energy</Text>
            <View style={styles.energyScale}><View style={styles.energyLine} />{SCENE_ENERGY_OPTIONS.map((option) => <EnergyChoice key={option.value} label={option.label} onPress={() => updateDraft("energy", option.value as SceneEnergy)} disabled={!scopeReady} selected={visibleDraft.energy === option.value} />)}</View>
          </View>
          <View style={styles.soundTuningDivider} />
          <View style={styles.sliderCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Familiarity</Text>
            <View style={styles.familiarityLabels}><Text style={styles.familiarityLabel}>Known</Text><Text style={styles.familiarityValue}>{visibleDraft.familiarity}</Text><Text style={styles.familiarityLabel}>New</Text></View>
            <Slider accessibilityLabel="Scene familiarity" accessibilityHint="Adjusts from familiar music to new discoveries" disabled={!scopeReady} maximumTrackTintColor="#39413D" maximumValue={100} minimumTrackTintColor="#50CDB6" minimumValue={0} onValueChange={updateFamiliarityLevel} step={1} thumbTintColor="#72D8C4" value={getSceneFamiliarityLevel(visibleDraft)} />
          </View>
        </BlurView>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactRail}>
            {SCENE_ARC_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                onPress={() => updateDraft("arc", option.value as SceneArc)}
                disabled={!scopeReady}
                selected={visibleDraft.arc === option.value}
              />
            ))}
          </ScrollView>
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Preferences
          </Text>
          <View style={styles.preferencesGrid}>
          <PreferenceRow
            disabled={!scopeReady}
            helper="When off, explicit Spotify results remain visible but cannot be added."
            label="Explicit tracks"
            onValueChange={(allowExplicit) => updateDraft("allowExplicit", allowExplicit)}
            value={visibleDraft.allowExplicit}
          />
          <PreferenceRow
            disabled={!scopeReady}
            helper="Filters tracks used in your twelve most recent saved Scenes before generation."
            label="Fresh tracks"
            onValueChange={(avoidRecentSceneTracks) =>
              updateDraft("avoidRecentSceneTracks", avoidRecentSceneTracks)
            }
            value={visibleDraft.avoidRecentSceneTracks !== false}
          />
          <PreferenceRow
            disabled={!scopeReady}
            helper="Orders the playlist around the selected arc using estimated energy changes."
            label="Smooth arc"
            onValueChange={(smoothTransitions) =>
              updateDraft("smoothTransitions", smoothTransitions)
            }
            value={visibleDraft.smoothTransitions !== false}
          />
          </View>
        </BlurView>

        <BlurView intensity={46} tint="dark" style={styles.card}>
          <View style={styles.sectionHeaderRow}><Text accessibilityRole="header" style={styles.sectionTitle}>Direct Canal</Text><Text style={styles.sectionMeta}>Refines ranking</Text></View>
          <Text style={styles.helperText}>Describe what belongs—or what should stay out.</Text>
          <TextInput accessibilityLabel="Scene notes" editable={scopeReady} maxLength={300} multiline onChangeText={(notes) => updateDraft("notes", notes)} placeholder="Warm guitars, no stadium rock, leave room to think…" placeholderTextColor={canalDynamicColors.muted} style={[styles.textInput, styles.notesInput]} value={visibleDraft.notes} />
        </BlurView>
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
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Sound</Text><Text style={styles.summaryValue}>{visibleDraft.preferredGenres.slice(0, 2).join(" + ") || "Open direction"}{visibleDraft.preferredGenres.length > 0 ? visibleDraft.allowAdjacentGenres ? " · adjacent fill" : " · strict only" : ""}</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Discovery</Text><Text style={styles.summaryValue}>{getSceneFamiliarityLevel(visibleDraft)}% new</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Length</Text><Text style={styles.summaryValue}>{visibleDraft.durationMinutes} minutes</Text></View>
              <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Arc</Text><Text style={styles.summaryValue}>{visibleDraft.arc}</Text></View>
            </View>
            <BlurView intensity={46} tint="dark" style={styles.sourceCard}>
              <View style={[styles.sourceDot, spotifyConnection !== "connected" && styles.sourceDotInactive]}><Text style={styles.sourceDotText}>S</Text></View>
              <View style={styles.sourceCopy}><Text style={styles.sourceTitle}>{spotifyConnection === "connected" ? "Spotify library connected" : spotifyConnection === "loading" ? "Checking Spotify…" : "Spotify connection needed"}</Text><Text style={styles.sourceText}>{spotifyConnection === "connected" ? "Canal will build an editable preview. Nothing saves until you choose Save." : "Connect Spotify to generate this Scene. Your choices remain saved."}</Text></View>
              {spotifyConnection !== "connected" && spotifyConnection !== "loading" ? <Pressable accessibilityLabel="Open Music Services" onPress={() => router.push("/music-services")} style={styles.sourceAction}><Text style={styles.sourceActionText}>Fix</Text></Pressable> : null}
            </BlurView>
          </Animated.View>
        ) : null}

        {visibleMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            {visibleMessage}
          </Text>
        ) : null}

      </ScrollView>
      <View style={styles.actionDock}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:"transparent"}, content:{gap:9,paddingHorizontal:16,paddingTop:4,paddingBottom:220},
  topBar:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"}, topBarTitle:{color:"#F7F4EC",fontSize:16,fontWeight:"800"},
  headerIcon:{alignItems:"center",justifyContent:"center",minHeight:48,minWidth:48}, headerIconText:{color: canalDynamicColors.text,fontSize:35,lineHeight:38}, closeIconText:{color: canalDynamicColors.text,fontSize:25},
  hero:{gap:3,paddingVertical:3}, eyebrow:{color: canalDynamicColors.mint,fontSize:9,fontWeight:"900",letterSpacing:1.2}, title:{color:"#FFFFFF",fontFamily:"Georgia",fontSize:28,fontWeight:"700"}, subtitle:{color:"rgba(255,255,255,.72)",fontSize:12,lineHeight:16},
  stepBar:{borderColor:"rgba(255,255,255,.17)",borderRadius:17,borderWidth:1,flexDirection:"row",gap:3,overflow:"hidden",padding:3}, stepButton:{alignItems:"center",borderRadius:13,flex:1,justifyContent:"center",minHeight:48,paddingHorizontal:2}, stepButtonSelected:{backgroundColor:"rgba(228,255,248,.9)"}, stepButtonText:{color:"rgba(255,255,255,.58)",fontSize:9,fontWeight:"600"}, stepButtonTextSelected:{color:"#164054"}, stepContent:{gap:7},
  card:{backgroundColor:"rgba(255,255,255,.07)",borderColor:"rgba(255,255,255,.14)",borderRadius:20,borderWidth:1,gap:7,overflow:"hidden",padding:12}, sectionHeaderRow:{alignItems:"flex-start",flexDirection:"row",gap:10},sectionHeaderCopy:{flex:1,gap:4},sectionTitle:{color:"#FFFFFF",fontSize:16,fontWeight:"800"},sectionMeta:{color: canalDynamicColors.mint,fontSize:10,fontWeight:"800"},helperText:{color:"rgba(255,255,255,.68)",fontSize:11,lineHeight:15},
  wrap:{flexDirection:"row",flexWrap:"wrap",gap:6},compactRail:{alignItems:"center",gap:6,paddingRight:16},compactSectionHeader:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"},chip:{alignItems:"center",backgroundColor:"rgba(255,255,255,.06)",borderColor:"rgba(255,255,255,.15)",borderRadius:999,borderWidth:1,justifyContent:"center",minHeight:48,paddingHorizontal:12},chipSelected:{backgroundColor:"rgba(114,216,196,.9)",borderColor:"#A8F3E3"},chipText:{color:"rgba(255,255,255,.8)",fontSize:12,fontWeight:"700"},chipTextSelected:{color:"#103C46"},
  moodCount:{color:"rgba(255,255,255,.66)",fontSize:11,fontVariant:["tabular-nums"],fontWeight:"700"},moodConstellation:{flexDirection:"row",flexWrap:"wrap",gap:6},moodOrb:{alignItems:"center",borderRadius:999,justifyContent:"center",minHeight:48,minWidth:72,paddingHorizontal:12},moodOrbIdle:{backgroundColor:"rgba(255,255,255,.06)",borderColor:"rgba(255,255,255,.15)",borderWidth:1},moodOrbSelected:{backgroundColor:"rgba(114,216,196,.92)"},moodOrbPressed:{opacity:.72},moodOrbText:{color:"rgba(255,255,255,.82)",fontSize:12,fontWeight:"700"},moodOrbTextSelected:{color:"#103C46"},
  textInput:{backgroundColor:"rgba(8,29,50,.26)",borderColor:"rgba(255,255,255,.17)",borderRadius:17,borderWidth:1,color: canalDynamicColors.text,fontSize:14,minHeight:48,paddingHorizontal:12,paddingVertical:9},sceneNameInput:{fontFamily:"Georgia",fontSize:17},notesInput:{minHeight:66,textAlignVertical:"top"},genreSearchInput:{marginTop:0},genreSuggestions:{gap:5},genreSuggestionLabel:{color: canalDynamicColors.muted,fontSize:10,fontWeight:"800"},genreEmptyText:{color: canalDynamicColors.muted,fontSize:12},selectedGenreSection:{gap:5},selectedGenreLabel:{color: canalDynamicColors.mint,fontSize:10,fontWeight:"800"},
  sliderGrid:{gap:7},soundTuningCard:{alignItems:"stretch",backgroundColor:"rgba(255,255,255,.055)",borderRadius:20,flexDirection:"row",overflow:"hidden",paddingHorizontal:12,paddingVertical:10},energyCard:{flex:4,gap:3},sliderCard:{flex:6,gap:3},soundTuningDivider:{backgroundColor:"rgba(255,255,255,.1)",marginHorizontal:10,width:StyleSheet.hairlineWidth},energyScale:{flexDirection:"row",position:"relative"},energyLine:{backgroundColor:"rgba(255,255,255,.18)",height:1,left:16,position:"absolute",right:16,top:35},energyChoice:{alignItems:"center",flex:1,justifyContent:"space-between",minHeight:48,paddingTop:7},energyChoiceText:{color:"rgba(255,255,255,.54)",fontSize:9,fontWeight:"700"},energyChoiceTextSelected:{color:"#DFFFF7",fontWeight:"900"},energyMarker:{backgroundColor:"rgba(255,255,255,.28)",borderRadius:3,height:5,width:5},energyMarkerSelected:{backgroundColor:"#72D8C4",height:8,width:8},familiarityLabels:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"},familiarityLabel:{color:"rgba(255,255,255,.55)",fontSize:9,fontWeight:"700"},familiarityValue:{color:"#DFFFF7",fontSize:11,fontWeight:"800"},
  adjacentPolicyCard:{backgroundColor:"rgba(255,255,255,.055)",borderRadius:18,overflow:"hidden"},adjacentPolicyRow:{alignItems:"center",flexDirection:"row",gap:12,minHeight:64,paddingHorizontal:12,paddingVertical:8},adjacentPolicyCopy:{flex:1,gap:2},adjacentPolicyTitle:{color:canalDynamicColors.text,fontSize:13,fontWeight:"800"},adjacentPolicyHelper:{color:canalDynamicColors.muted,fontSize:10,lineHeight:14},
  preferencesGrid:{flexDirection:"row",gap:4},preferenceRow:{alignItems:"center",borderRadius:12,flex:1,gap:5,justifyContent:"center",minHeight:66,paddingHorizontal:3,paddingVertical:6},preferenceRowSelected:{backgroundColor:"rgba(114,216,196,.08)"},compactSwitch:{backgroundColor:"rgba(255,255,255,.16)",borderRadius:8,height:16,padding:2,width:28},compactSwitchSelected:{backgroundColor:"rgba(114,216,196,.72)"},compactSwitchKnob:{backgroundColor:"rgba(255,255,255,.76)",borderRadius:6,height:12,width:12},compactSwitchKnobSelected:{alignSelf:"flex-end",backgroundColor:"#F5FFFC"},preferenceLabel:{color:"rgba(255,255,255,.62)",fontSize:9,fontWeight:"700",lineHeight:11,textAlign:"center"},preferenceLabelSelected:{color:"#FFFFFF"},policyRow:{paddingBottom:2},
  inlineNavigation:{alignItems:"center",flexDirection:"row",justifyContent:"space-between",gap:10},inlineButton:{alignItems:"center",justifyContent:"center",minHeight:48,paddingHorizontal:8},inlineButtonText:{color:"#C7FFF2",fontSize:14,fontWeight:"800"},inlineHint:{color:"rgba(255,255,255,.58)",fontSize:11,flex:1},
  reviewHero:{alignItems:"center",gap:8,paddingVertical:18},reviewEyebrow:{color: canalDynamicColors.mint,fontSize:10,fontWeight:"900",letterSpacing:1.5},reviewName:{color:"#FFFFFF",fontFamily:"Georgia",fontSize:30,fontWeight:"700",textAlign:"center"},reviewSubtitle:{color:"rgba(255,255,255,.7)",fontSize:13,textAlign:"center"},miniWave:{alignItems:"center",flexDirection:"row",gap:5,height:48},waveBar:{backgroundColor:"#72D8C4",borderRadius:4,width:5},summaryGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},summaryCard:{backgroundColor:"rgba(255,255,255,.07)",borderRadius:17,gap:4,minHeight:74,padding:12,width:"48%"},summaryLabel:{color:"rgba(255,255,255,.55)",fontSize:10,fontWeight:"800"},summaryValue:{color:"#FFFFFF",fontSize:13,fontWeight:"800"},
  sourceCard:{alignItems:"center",backgroundColor:"rgba(255,255,255,.09)",borderColor:"rgba(255,255,255,.18)",borderRadius:22,borderWidth:1,flexDirection:"row",gap:12,padding:15},sourceDot:{alignItems:"center",backgroundColor:"#1DB954",borderRadius:18,height:36,justifyContent:"center",width:36},sourceDotInactive:{backgroundColor:"rgba(255,255,255,.14)"},sourceDotText:{color:"#FFFFFF",fontSize:15,fontWeight:"900"},sourceCopy:{flex:1},sourceTitle:{color:"#FFFFFF",fontSize:14,fontWeight:"800"},sourceText:{color:"rgba(255,255,255,.65)",fontSize:12,lineHeight:17},sourceAction:{alignItems:"center",justifyContent:"center",minHeight:48,minWidth:48},sourceActionText:{color: canalDynamicColors.mint,fontWeight:"900"},
  actionDock:{alignItems:"center",backgroundColor:"transparent",bottom:146,flexDirection:"row",left:0,paddingHorizontal:42,position:"absolute",right:0},dockContinue:{alignItems:"center",backgroundColor:"#DFFFF7",borderRadius:16,flex:1,justifyContent:"center",minHeight:48,paddingHorizontal:16},dockContinueText:{color:"#153F50",fontSize:14,fontWeight:"900"},
  suggestNameButton:{alignItems:"center",justifyContent:"center",minHeight:48,paddingHorizontal:8},suggestNameText:{color: canalDynamicColors.mint,fontSize:13,fontWeight:"900"},statusText:{color:"#FFFFFF",fontSize:13,lineHeight:19},validationText:{color:"#FFD1C7",fontSize:13,fontWeight:"800"},disabled:{opacity:.45},pressed:{opacity:.72},
});
