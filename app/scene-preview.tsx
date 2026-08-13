import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  Fragment,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
} from "expo-router";

import * as ExpoRouter from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  Image,
} from "expo-image";

import {
  StatusBar,
} from "expo-status-bar";
import {
  Ionicons,
} from "@expo/vector-icons";

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
  addMusicTrackToGeneratedScene,
  musicCatalogTrackSceneId,
  regenerateGeneratedSceneEditor,
  replaceTrackInGeneratedSceneEditor,
  reorderTrackInGeneratedSceneEditor,
} from "../lib/scene-preview-editor";

import { musicProviders } from "../lib/music-services";

import type {
  MusicCatalogTrack,
} from "../lib/music-provider-model";

import {
  captureSceneStudioScope,
  sameSceneStudioScope,
  sceneStudioScopeIsVisible,
} from "../lib/scene-studio-scope";
import {
  readSceneRecommendationLearning,
  recordSceneRecommendationFeedback,
} from "../lib/scene-recommendation-feedback";
import {
  MAX_SCENE_FEEDBACK_REASONS,
  SCENE_FEEDBACK_REASONS,
  SCENE_FEEDBACK_REASON_LABELS,
} from "../lib/scene-recommendation-reasons";
import type {
  SceneFeedbackReason,
} from "../lib/scene-recommendation-reasons";

import type {
  SceneStudioScope,
} from "../lib/scene-studio-scope";

import {
  useAuth,
} from "../providers/auth-provider";

import {
  LinerNotesAction,
  LinerNotesOverlay,
} from "../components/liner-notes/LinerNotesOverlay";

import type {
  LinerNotesTrack,
} from "../components/liner-notes/LinerNotesOverlay";

import {
  useLinerNotesContext,
} from "../components/liner-notes/useLinerNotesContext";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import type {
  GeneratedSceneResult,
} from "../lib/scene-studio";

import {
  saveGeneratedSceneToLibrary,
  generateSceneWithSpotifyGenreFallback,
} from "../lib/scene-studio";

import {
  captureSpotifyCanalAccountGuard,
} from "../lib/spotify-auth";

import type {
  SpotifyCanalAccountGuard,
} from "../lib/spotify-auth";

import {
  addUserSelectedGenreCatalogTracksFromProviders,
} from "../lib/scene-genre-catalog";

import {
  readCombinedSceneMusicLibrary,
} from "../lib/combined-music-library";

import {
  addSpotifyArtworkToGeneratedScene,
} from "../lib/spotify-scene-artwork";
import { ExplicitBadge } from "../components/explicit-badge";

import {
  sceneAtmosphere,
} from "../components/canal-ui/scene-signature";

import {
  CanalAtmosphereContext,
} from "../theme/canal-atmosphere-context";

import {
  readScenes,
} from "../lib/scenes";

type MismatchContext = {
  artistIds: string[];
  genres: string[];
  explicit: boolean;
};

const MAX_REGENERATION_ATTEMPTS = 3;
const MIN_REGENERATION_CHANGE_RATIO = 0.3;

function regenerationChangeRatio(
  current: GeneratedSceneResult,
  candidate: GeneratedSceneResult,
): number {
  const currentIds = new Set(
    current.trackSignals.map((signal) => signal.track.id),
  );
  const candidateIds = new Set(
    candidate.trackSignals.map((signal) => signal.track.id),
  );
  const denominator = Math.max(currentIds.size, candidateIds.size, 1);
  let overlap = 0;
  candidateIds.forEach((trackId) => {
    if (currentIds.has(trackId)) overlap += 1;
  });
  return 1 - overlap / denominator;
}

function returnToStudio(stageId?: string): void {
  router.replace({
    pathname: "/scene-studio",
    params: {
      mode: "edit",
      ...(stageId
        ? { stageId }
        : {}),
    },
  } as never);
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

export default function ScenePreviewScreen() {
  const { setOverride } = use(CanalAtmosphereContext);
  const params = ExpoRouter.useLocalSearchParams?.<{
    stageId?: string | string[];
  }>() ?? {};
  const stageId = Array.isArray(params.stageId)
    ? params.stageId[0] ?? ""
    : params.stageId ?? "";
  const {
    user,
    accountEpoch,
    sessionGeneration,
  } = useAuth();
  const {
    status: connectivityStatus,
  } = useConnectivity();
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

  const [loading, setLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState<unknown>(null);
  const [reloadEpoch, setReloadEpoch] =
    useState(0);
  const [scopedPreview, setScopedPreview] =
    useState<GeneratedSceneResult | null>(null);
  const [hasScopedPreview, setHasScopedPreview] =
    useState(false);
  const [loadedScope, setLoadedScope] =
    useState<SceneStudioScope | null>(null);
  const [contextTrack, setContextTrack] =
    useState<LinerNotesTrack | null>(null);
  const [previewRevision, setPreviewRevision] =
    useState<number | null>(null);
  const [undoPreview, setUndoPreview] =
    useState<GeneratedSceneResult | null>(null);
  const [editorStatus, setEditorStatus] =
    useState<string | null>(null);
  const [editorBusy, setEditorBusy] =
    useState(false);
  const [saveBusy, setSaveBusy] =
    useState(false);
  const [catalogQuery, setCatalogQuery] =
    useState("");
  const [catalogResults, setCatalogResults] =
    useState<readonly MusicCatalogTrack[]>([]);
  const [catalogBusy, setCatalogBusy] =
    useState(false);
  const [generationBusy, setGenerationBusy] =
    useState(false);
  const [pendingMismatch, setPendingMismatch] =
    useState<({ trackId: string; trackName: string } & MismatchContext) | null>(null);
  const [mismatchReasons, setMismatchReasons] =
    useState<SceneFeedbackReason[]>([]);
  const previewRef =
    useRef<GeneratedSceneResult | null>(null);
  const revisionRef =
    useRef<number | null>(null);
  const mutationInFlightRef =
    useRef(false);
  const saveInFlightRef =
    useRef(false);
  const generationInFlightRef =
    useRef(false);
  const reasonHeadingRef =
    useRef<Text | null>(null);
  const swapButtonRefs =
    useRef(new Map<string, View | null>());
  const mutationSequenceRef =
    useRef(0);
  const saveSequenceRef =
    useRef(0);
  const linerNotes = useLinerNotesContext({
    track: contextTrack,
    visible: Boolean(contextTrack),
    userId: user?.id ?? null,
    sessionGeneration,
    connectivityStatus,
  });

  const currentScope = useCallback(
    () => currentScopeRef.current,
    [],
  );
  const scopeReady =
    Boolean(scope) &&
    !loading &&
    sceneStudioScopeIsVisible(
      loadedScope,
      scope,
    );
  const visibleLoading =
    loading ||
    !scopeReady;
  const visiblePreview =
    scopeReady ? scopedPreview : null;

  useEffect(() => {
    if (!visiblePreview) {
      return;
    }

    setOverride(sceneAtmosphere(visiblePreview.scene));

    return () => {
      setOverride(null);
    };
  }, [setOverride, visiblePreview]);

  previewRef.current = scopedPreview;
  revisionRef.current = previewRevision;

  useEffect(() => {
    setContextTrack(null);
    setUndoPreview(null);
    setEditorStatus(null);
    setEditorBusy(false);
    setSaveBusy(false);
    setCatalogBusy(false);
    setGenerationBusy(false);
    setPendingMismatch(null);
    setMismatchReasons([]);
    setCatalogQuery("");
    setCatalogResults([]);
    mutationSequenceRef.current += 1;
    saveSequenceRef.current += 1;
    mutationInFlightRef.current = false;
    saveInFlightRef.current = false;
    generationInFlightRef.current = false;
  }, [scope]);

  useFocusEffect(useCallback(() => {
    void reloadEpoch;
    let active = true;
    const operationScope = scope;
    const operationGeneration =
      captureSceneStudioInvalidationGeneration(operationScope);

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
            setScopedPreview(null);
            setHasScopedPreview(false);
            setPreviewRevision(null);
            setUndoPreview(null);
            setEditorStatus(null);
            setPendingMismatch(null);
            setMismatchReasons([]);

            if (invalidation.reason === "device-clear") {
              setLoadedScope(operationScope);
              setLoading(false);
            } else {
              setLoadedScope(null);
              setLoading(true);
            }
          }
        },
      );

    const load = async (): Promise<void> => {
      if (!operationScope) {
        if (active) {
          setScopedPreview(null);
          setHasScopedPreview(false);
          setPreviewRevision(null);
          setCatalogQuery("");
          setCatalogResults([]);
          setLoadedScope(null);
          setLoading(false);
        }

        return;
      }

      setLoadError(null);

      let preview;
      try {
        preview = await repositoryRef.current.readPreview({
          scope: operationScope,
          currentScope,
          operationGuard: canCommit,
        });
      } catch (error) {
        if (canCommit()) {
          setLoadError(error);
          setLoading(false);
        }
        return;
      }

      if (!canCommit()) {
        return;
      }

      setScopedPreview(
        preview.kind === "ready"
          ? preview.value
          : null,
      );
      setHasScopedPreview(preview.kind === "ready");
      setPreviewRevision(
        preview.kind === "ready"
          ? preview.revision
          : null,
      );
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
    reloadEpoch,
    scope,
  ]));

  const reloadPreview = useCallback(() => {
    setReloadEpoch((current) => current + 1);
  }, []);

  useReconnectReload(reloadPreview);

  const previewRecoveryIssue = useMemo(
    () =>
      loadError
        ? classifyRecoveryIssue(loadError, {
            service: "canal",
            connectivityStatus,
          })
        : null,
    [connectivityStatus, loadError],
  );

  const mutatePreview = useCallback(
    async (
      transform: (preview: GeneratedSceneResult) => GeneratedSceneResult,
      successMessage: string,
      undoValue?: GeneratedSceneResult | null,
    ): Promise<void> => {
      if (mutationInFlightRef.current || saveInFlightRef.current) {
        return;
      }

      const operationScope = scope;
      const before = previewRef.current;
      const expectedRevision = revisionRef.current;

      if (!operationScope || !before || expectedRevision === null) {
        return;
      }

      let next: GeneratedSceneResult;

      try {
        next = transform(before);
      } catch (error) {
        setEditorStatus(
          error instanceof Error
            ? error.message
            : "Canal could not edit this Scene.",
        );
        return;
      }

      if (next === before) {
        return;
      }

      mutationInFlightRef.current = true;
      const operationId = ++mutationSequenceRef.current;
      setEditorBusy(true);
      setEditorStatus("Saving this edit privately…");
      const operationGeneration =
        captureSceneStudioInvalidationGeneration(operationScope);
      const operationGuard = (): boolean =>
        sceneStudioInvalidationGenerationIsCurrent(
          operationGeneration,
          operationScope,
        ) &&
        sameSceneStudioScope(operationScope, currentScope());

      try {
        const result = await repositoryRef.current.savePreview({
          scope: operationScope,
          currentScope,
          operationGuard,
          preview: next,
          expectedRevision,
        });

        if (!operationGuard()) {
          return;
        }

        if (result.kind === "committed") {
          previewRef.current = next;
          revisionRef.current = result.revision;
          setScopedPreview(next);
          setPreviewRevision(result.revision);
          setUndoPreview(
            undoValue === undefined
              ? before
              : undoValue,
          );
          setEditorStatus(successMessage);
          return;
        }

        if (result.kind === "conflict") {
          const latest = await repositoryRef.current.readPreview({
            scope: operationScope,
            currentScope,
            operationGuard,
          });

          if (!operationGuard()) {
            return;
          }

          if (latest.kind === "ready") {
            previewRef.current = latest.value;
            revisionRef.current = latest.revision;
            setScopedPreview(latest.value);
            setPreviewRevision(latest.revision);
            setUndoPreview(null);
          }

          setEditorStatus(
            "This Scene changed elsewhere. The latest version was reloaded; try the edit again.",
          );
        }
      } catch {
        if (operationGuard()) {
          setEditorStatus(
            "Canal could not save that edit. The previous Scene is unchanged.",
          );
        }
      } finally {
        if (mutationSequenceRef.current === operationId) {
          mutationInFlightRef.current = false;
        }

        if (
          mutationSequenceRef.current === operationId &&
          operationGuard()
        ) {
          setEditorBusy(false);
        }
      }
    },
    [currentScope, scope],
  );

  const saveScene = useCallback(async (): Promise<void> => {
    if (saveInFlightRef.current || mutationInFlightRef.current) {
      return;
    }

    const operationScope = scope;
    const preview = previewRef.current;

    if (!operationScope || !preview) {
      return;
    }

    if (connectivityStatus !== "online") {
      setEditorStatus(
        "Connect to the internet to save this Scene privately.",
      );
      return;
    }

    saveInFlightRef.current = true;
    const operationId = ++saveSequenceRef.current;
    setSaveBusy(true);
    setEditorStatus("Saving Scene privately…");
    const operationGeneration =
      captureSceneStudioInvalidationGeneration(operationScope);
    const operationGuard = (): boolean =>
      sceneStudioInvalidationGenerationIsCurrent(
        operationGeneration,
        operationScope,
      ) &&
      sameSceneStudioScope(operationScope, currentScope());

    try {
      const savedScene = await saveGeneratedSceneToLibrary(
        preview,
        {
          scope: operationScope,
          currentScope,
        },
        "private",
      );

      if (operationGuard()) {
        setEditorStatus(
          `“${preview.scene.name}” was saved privately.`,
        );
        router.replace(
          stageId
            ? {
                pathname: "/stage-contribution",
                params: { stageId, sceneId: savedScene.id },
              }
            : {
                pathname: "/scenes/[sceneId]",
                params: { sceneId: savedScene.id },
              },
        );
      }
    } catch {
      if (operationGuard()) {
        setEditorStatus(
          "Canal could not save this Scene. Nothing was published.",
        );
      }
    } finally {
      if (saveSequenceRef.current === operationId) {
        saveInFlightRef.current = false;
      }

      if (
        saveSequenceRef.current === operationId &&
        operationGuard()
      ) {
        setSaveBusy(false);
      }
    }
  }, [connectivityStatus, currentScope, scope, stageId]);

  const searchMusicCatalogs = useCallback(async (): Promise<void> => {
    if (catalogBusy || mutationInFlightRef.current || saveInFlightRef.current) {
      return;
    }

    const query = catalogQuery.trim();
    const operationScope = scope;

    if (!operationScope || query.length < 2) {
      setEditorStatus("Enter at least two characters to search music catalogs.");
      return;
    }

    if (connectivityStatus !== "online") {
      setEditorStatus("Connect to the internet to search music catalogs.");
      return;
    }

    const operationGeneration =
      captureSceneStudioInvalidationGeneration(operationScope);
    const operationGuard = (): boolean =>
      sceneStudioInvalidationGenerationIsCurrent(
        operationGeneration,
        operationScope,
      ) && sameSceneStudioScope(operationScope, currentScope());

    setCatalogBusy(true);
    setEditorStatus("Searching connected music services…");

    try {
      const combined = await readCombinedSceneMusicLibrary();
      const providerIds = combined?.readyProviderIds ?? [];
      const searches = await Promise.allSettled(providerIds.map(async (providerId) =>
        musicProviders.require(providerId, "catalog-search").searchCatalog({
          query,
          limit: 10,
        }),
      ));
      const results = searches.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ).sort((left, right) =>
        left.reference.providerId === right.reference.providerId
          ? 0
          : left.reference.providerId === "apple-music" ? -1 : 1,
      ).filter((track, index, all) => {
        const key = `${track.name.trim().toLowerCase()}::${track.artists[0]?.name.trim().toLowerCase() ?? ""}`;
        return all.findIndex((candidate) =>
          `${candidate.name.trim().toLowerCase()}::${candidate.artists[0]?.name.trim().toLowerCase() ?? ""}` === key,
        ) === index;
      }).slice(0, 20);

      if (!operationGuard()) {
        return;
      }

      setCatalogResults(results);
      setEditorStatus(
        results.length > 0
          ? `${results.length} music result${results.length === 1 ? "" : "s"}. Choose tracks to add.`
          : "Your connected music services found no matching tracks.",
      );
    } catch (error) {
      if (operationGuard()) {
        setCatalogResults([]);
        setEditorStatus(
          error instanceof Error
            ? error.message
            : "Canal could not search connected music services.",
        );
      }
    } finally {
      if (operationGuard()) {
        setCatalogBusy(false);
      }
    }
  }, [catalogBusy, catalogQuery, connectivityStatus, currentScope, scope]);

  const generateAlternative = useCallback(
    async (
      current: GeneratedSceneResult,
      variationAttempt = 0,
    ): Promise<GeneratedSceneResult> => {
      const operationScope = scope;

      if (!operationScope) {
        throw new Error("This Scene is no longer available for this account.");
      }

      const operationGeneration =
        captureSceneStudioInvalidationGeneration(operationScope);
      const operationGuard = (): boolean =>
        sceneStudioInvalidationGenerationIsCurrent(
          operationGeneration,
          operationScope,
        ) && sameSceneStudioScope(operationScope, currentScope());
      const combined = await readCombinedSceneMusicLibrary();
      const startingSpotifyGuard = combined?.readyProviderIds.includes("spotify")
        ? await captureSpotifyCanalAccountGuard()
        : null;

      if (
        !combined ||
        combined.readyProviderIds.length === 0
      ) {
        throw new Error("Sync Spotify or Apple Music before regenerating this Scene.");
      }

      const snapshot = await addUserSelectedGenreCatalogTracksFromProviders(
        current.draft,
        combined.snapshot,
        combined.readyProviderIds,
      );
      const learning = await readSceneRecommendationLearning(
        operationScope,
        currentScope,
        current.draft,
      );
      const existingSceneNames = (await readScenes()).map(
        (scene) => scene.name,
      );
      existingSceneNames.push(current.scene.name);
      const endingSpotifyGuard = startingSpotifyGuard
        ? await captureSpotifyCanalAccountGuard()
        : null;

      if (
        !operationGuard() ||
        (startingSpotifyGuard && endingSpotifyGuard &&
          !sameSpotifyAccountGuard(startingSpotifyGuard, endingSpotifyGuard))
      ) {
        throw new Error("The active account changed. No playlist changes were saved.");
      }

      const generated = generateSceneWithSpotifyGenreFallback(
        current.draft,
        snapshot,
        {
          variationSeed: `${operationScope.userId}:${Date.now()}:${mutationSequenceRef.current}:${variationAttempt}`,
          existingSceneNames,
          rejectedTrackIds: [
            ...(current.rejectedTrackIds ?? []),
            ...learning.rejectedTrackIds,
          ],
          deprioritizedTrackIds: [
            ...learning.deprioritizedTrackIds,
            ...current.trackSignals.map(
            (signal) => signal.track.id,
            ),
          ],
          preferredTrackIds: learning.preferredTrackIds,
          reasonBias: learning.reasonBias,
        },
      );

      return addSpotifyArtworkToGeneratedScene(generated);
    },
    [currentScope, scope],
  );

  const regenerateScene = useCallback(async (): Promise<void> => {
    const current = previewRef.current;

    if (
      !current ||
      generationInFlightRef.current ||
      mutationInFlightRef.current ||
      saveInFlightRef.current
    ) {
      return;
    }

    generationInFlightRef.current = true;
    setGenerationBusy(true);
    setEditorStatus("Generating a different playlist…");

    try {
      let materiallyDifferent: GeneratedSceneResult | null = null;
      for (let attempt = 0; attempt < MAX_REGENERATION_ATTEMPTS; attempt += 1) {
        const candidate = await generateAlternative(current, attempt);
        if (
          regenerationChangeRatio(current, candidate) >=
          MIN_REGENERATION_CHANGE_RATIO
        ) {
          materiallyDifferent = candidate;
          break;
        }
      }
      if (!materiallyDifferent) {
        setEditorStatus(
          "Canal could not find enough different matching tracks. Your playlist is unchanged.",
        );
        return;
      }
      await mutatePreview(
        (preview) => regenerateGeneratedSceneEditor(preview, materiallyDifferent),
        "A different editable playlist is ready.",
      );
    } catch (error) {
      setEditorStatus(
        error instanceof Error
          ? error.message
          : "Canal could not regenerate this playlist.",
      );
    } finally {
      generationInFlightRef.current = false;
      setGenerationBusy(false);
    }
  }, [generateAlternative, mutatePreview]);

  const replaceTrack = useCallback(
    async (
      trackId: string,
      trackName: string,
      mismatch: boolean,
      reasons: SceneFeedbackReason[] = [],
      context?: MismatchContext,
    ): Promise<void> => {
      const current = previewRef.current;
      const operationScope = scope;

      if (
        !current ||
        !operationScope ||
        generationInFlightRef.current ||
        mutationInFlightRef.current ||
        saveInFlightRef.current
      ) {
        return;
      }

      generationInFlightRef.current = true;
      setGenerationBusy(true);
      setEditorStatus(`Finding a better replacement for ${trackName}…`);

      try {
        const feedbackResult = await recordSceneRecommendationFeedback({
          scope: operationScope,
          currentScope,
          draft: current.draft,
          action: mismatch ? "doesnt_match" : "remove",
          reasons: mismatch ? reasons : [],
          ...(mismatch && context ? context : {}),
          trackId,
          sceneId: current.scene.id,
        });
        if (!sameSceneStudioScope(operationScope, currentScope())) {
          setEditorStatus("Your account changed, so Canal stopped this swap safely.");
          return;
        }
        if (feedbackResult.outcome === "skipped") {
          setEditorStatus("Canal could not save that feedback, so the track was not swapped.");
          return;
        }
        const feedbackWasSaved = feedbackResult.outcome !== "failure";
        const generated = await generateAlternative(current);
        await mutatePreview(
          (preview) => replaceTrackInGeneratedSceneEditor(
            preview,
            trackId,
            generated,
          ),
          mismatch
            ? feedbackWasSaved
              ? `${trackName} was rejected and replaced with a better fit.`
              : `${trackName} was replaced, but your feedback could not be saved.`
            : feedbackWasSaved
              ? `${trackName} was removed and replaced with a new track.`
              : `${trackName} was replaced, but your removal feedback could not be saved.`,
        );
      } catch (error) {
        setEditorStatus(
          error instanceof Error
            ? error.message
            : "Canal could not replace that track.",
        );
      } finally {
        generationInFlightRef.current = false;
        setGenerationBusy(false);
      }
    },
    [currentScope, generateAlternative, mutatePreview, scope],
  );

  const toggleMismatchReason = useCallback((reason: SceneFeedbackReason): void => {
    setMismatchReasons((current) => {
      if (current.includes(reason)) {
        return current.filter((item) => item !== reason);
      }
      if (current.length >= MAX_SCENE_FEEDBACK_REASONS) {
        setEditorStatus(`Choose up to ${MAX_SCENE_FEEDBACK_REASONS} reasons.`);
        return current;
      }
      setEditorStatus(null);
      return [...current, reason];
    });
  }, []);

  const confirmMismatchSwap = useCallback((reasons: SceneFeedbackReason[]): void => {
    const pending = pendingMismatch;
    if (!pending) return;
    setPendingMismatch(null);
    setMismatchReasons([]);
    void replaceTrack(pending.trackId, pending.trackName, true, reasons, {
      artistIds: pending.artistIds,
      genres: pending.genres,
      explicit: pending.explicit,
    });
  }, [pendingMismatch, replaceTrack]);

  const restoreSwapFocus = useCallback((trackId: string): void => {
    requestAnimationFrame(() => {
      const target = swapButtonRefs.current.get(trackId) ?? null;
      const handle = findNodeHandle(target);
      if (handle !== null) {
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
    });
  }, []);

  const cancelMismatchSwap = useCallback((): void => {
    const trackId = pendingMismatch?.trackId;
    setPendingMismatch(null);
    setMismatchReasons([]);
    setEditorStatus("Swap canceled. The playlist is unchanged.");
    if (trackId) restoreSwapFocus(trackId);
  }, [pendingMismatch?.trackId, restoreSwapFocus]);

  const controlsBusy = editorBusy || saveBusy || catalogBusy || generationBusy;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back from Scene editor"
            accessibilityRole="button"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/scene-studio" as never);
            }}
            style={styles.backButton}
          >
            <Ionicons color={canalDynamicColors.text} name="chevron-back" size={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>
            Edit Scene
          </Text>
        </View>

        {previewRecoveryIssue ? (
          <RecoveryNotice
            issue={previewRecoveryIssue}
            onAction={reloadPreview}
          />
        ) : null}

        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>
            Connected music catalogs
          </Text>
          <Text style={styles.noticeText}>
            Canal generated this private draft from your connected Apple Music and Spotify libraries. Reorder, replace, regenerate, or add tracks before saving.
          </Text>
          {visibleLoading ? (
            <Text style={styles.noticeText}>
              Checking this account’s scoped preview…
            </Text>
          ) : visiblePreview && hasScopedPreview ? (
            <Text style={styles.noticeText}>
              This private preview is ready for your track choices.
            </Text>
          ) : null}
        </View>

        {visiblePreview ? (
          <View style={styles.previewCard}>
            <Text accessibilityRole="header" style={styles.previewTitle}>
              {visiblePreview.scene.name}
            </Text>
            <Pressable
              accessibilityLabel="Regenerate Scene playlist"
              accessibilityHint="Replaces this playlist with a different automatically generated set of tracks"
              accessibilityRole="button"
              accessibilityState={{ busy: generationBusy, disabled: controlsBusy }}
              disabled={controlsBusy}
              onPress={() => void regenerateScene()}
              style={[styles.regenerateButton, controlsBusy && styles.disabled]}
            >
              <Text style={styles.regenerateButtonText}>
                {generationBusy ? "Regenerating…" : "Regenerate playlist"}
              </Text>
            </Pressable>
            {visiblePreview.selectionStatus?.underfilled ? (
              <Text accessibilityLiveRegion="polite" style={styles.underfillText}>
                {visiblePreview.selectionStatus.message}
              </Text>
            ) : null}
            <View style={styles.catalogSearch}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Add tracks
              </Text>
              <TextInput
                accessibilityLabel="Search connected music catalogs"
                autoCapitalize="none"
                editable={!controlsBusy}
                maxLength={100}
                onChangeText={setCatalogQuery}
                onSubmitEditing={() => void searchMusicCatalogs()}
                placeholder="Song or artist"
                placeholderTextColor={canalDynamicColors.muted}
                returnKeyType="search"
                style={styles.searchInput}
                value={catalogQuery}
              />
              <Pressable
                accessibilityLabel="Search music catalogs"
                accessibilityRole="button"
                accessibilityState={{ busy: catalogBusy, disabled: controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online" }}
                disabled={controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online"}
                onPress={() => void searchMusicCatalogs()}
                style={[styles.secondaryButton, (controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online") && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>{catalogBusy ? "Searching…" : "Search music"}</Text>
              </Pressable>
              {catalogResults.map((track) => {
                const alreadyAdded = visiblePreview.trackSignals.some(
                  (signal) => signal.track.id === musicCatalogTrackSceneId(track),
                );

                return (
                  <View key={`${track.reference.providerId}:${track.reference.itemId}`} style={styles.catalogResult}>
                    <View style={styles.catalogResultText}>
                      <Text style={styles.trackTitle}>{track.name}</Text>
                      <Text style={styles.trackArtist}>{track.artists.map((artist) => artist.name).join(", ")}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`${alreadyAdded ? "Added" : "Add"} ${track.name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: controlsBusy || alreadyAdded }}
                      disabled={controlsBusy || alreadyAdded}
                      onPress={() => void mutatePreview(
                        (preview) => addMusicTrackToGeneratedScene(preview, track),
                        `${track.name} added to this Scene.`,
                      )}
                      style={[styles.secondaryButton, (controlsBusy || alreadyAdded) && styles.disabled]}
                    >
                      <Text style={styles.secondaryButtonText}>{alreadyAdded ? "Added" : "Add"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {visiblePreview.trackSignals.map((signal, index) => {
              const artworkUrl = signal.track.album?.imageUrl ?? signal.track.album?.images?.[0]?.url;

              return (
                <Fragment key={signal.track.id}>
                <View style={styles.trackRow}>
                  <View style={styles.artworkBadgeWrap}>{artworkUrl ? (
                    <Image
                      accessibilityLabel={`${signal.track.album?.name ?? signal.track.name} cover art`}
                      contentFit="cover"
                      source={{ uri: artworkUrl }}
                      style={styles.trackArtwork}
                      transition={120}
                    />
                  ) : (
                    <View accessibilityElementsHidden style={styles.trackArtworkFallback}>
                      <Text style={styles.trackArtworkNote}>♪</Text>
                    </View>
                  )}<ExplicitBadge explicit={signal.track.explicit} style={styles.artworkBadge} /></View>
                  <View style={styles.trackBody}>
                    <Text numberOfLines={1} style={styles.trackTitle}>{signal.track.name}</Text>
                    <Text numberOfLines={1} style={styles.trackArtist}>
                      {(signal.track.artists ?? []).map((artist) => artist.name).join(", ")}
                    </Text>
                    {signal.genreMatch ? (
                      <Text
                        accessibilityLabel={`Why ${signal.track.name} matched: ${signal.genreMatch.whyMatched}`}
                        numberOfLines={1}
                        style={signal.genreMatch.confidence === "low" ? styles.lowConfidenceText : styles.matchText}
                      >
                        {signal.genreMatch.confidence === "low" ? "Low confidence · " : "Matched · "}
                        {signal.genreMatch.whyMatched}
                      </Text>
                    ) : null}
                    <LinerNotesAction
                      onPress={() =>
                        setContextTrack({
                          title: signal.track.name,
                          artist: (signal.track.artists ?? []).map((artist) => artist.name).join(", "),
                          ...(signal.track.album?.name ? { album: signal.track.album.name } : {}),
                        })
                      }
                    />
                    <View style={styles.trackFeedbackActions}>
                    <Pressable
                      ref={(node) => {
                        swapButtonRefs.current.set(signal.track.id, node);
                      }}
                      accessibilityLabel={`Swap ${signal.track.name}`}
                      accessibilityHint="Removes this track from the current Scene and generates a different replacement"
                      accessibilityRole="button"
                      accessibilityState={{ busy: generationBusy, disabled: controlsBusy }}
                      disabled={controlsBusy}
                      onPress={() => {
                        setPendingMismatch({
                          trackId: signal.track.id,
                          trackName: signal.track.name,
                          artistIds: (signal.track.artists ?? [])
                            .map((artist) => artist.id)
                            .filter((artistId): artistId is string => Boolean(artistId)),
                          genres: [...signal.genres],
                          explicit: signal.track.explicit === true,
                        });
                        setMismatchReasons([]);
                        setEditorStatus(`Optionally tell Canal why ${signal.track.name} does not fit.`);
                      }}
                      style={styles.mismatchButton}
                    >
                      <Ionicons
                        color={canalDynamicColors.mint}
                        name="sync-outline"
                        size={14}
                      />
                      <Text style={styles.mismatchButtonText}>Swap</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Dislike ${signal.track.name}`}
                      accessibilityHint="Marks this song as a mismatch for this Scene and opens optional reasons before replacing it"
                      accessibilityRole="button"
                      accessibilityState={{ busy: generationBusy, disabled: controlsBusy }}
                      disabled={controlsBusy}
                      onPress={() => {
                        setPendingMismatch({
                          trackId: signal.track.id,
                          trackName: signal.track.name,
                          artistIds: (signal.track.artists ?? []).map((artist) => artist.id).filter((artistId): artistId is string => Boolean(artistId)),
                          genres: [...signal.genres],
                          explicit: signal.track.explicit === true,
                        });
                        setMismatchReasons([]);
                        setEditorStatus(`Optionally tell Canal why ${signal.track.name} does not fit.`);
                      }}
                      style={styles.mismatchButton}
                    >
                      <Ionicons color={canalDynamicColors.danger} name="remove-circle-outline" size={14} />
                      <Text style={[styles.mismatchButtonText, styles.dislikeButtonText]}>Dislike</Text>
                    </Pressable>
                    </View>
                  </View>
                  <View style={styles.compactControls}>
                    <View style={styles.arrowStack}>
                      <Pressable
                        accessibilityLabel={`Move ${signal.track.name} up`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: controlsBusy || index === 0 }}
                        disabled={controlsBusy || index === 0}
                        onPress={() => void mutatePreview(
                          (preview) => reorderTrackInGeneratedSceneEditor(preview, signal.track.id, "up"),
                          `${signal.track.name} moved up.`,
                        )}
                        style={[styles.iconButton, (controlsBusy || index === 0) && styles.disabled]}
                      >
                            <Ionicons color={canalDynamicColors.muted} name="chevron-up" size={16} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Move ${signal.track.name} down`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: controlsBusy || index === visiblePreview.trackSignals.length - 1 }}
                        disabled={controlsBusy || index === visiblePreview.trackSignals.length - 1}
                        onPress={() => void mutatePreview(
                          (preview) => reorderTrackInGeneratedSceneEditor(preview, signal.track.id, "down"),
                          `${signal.track.name} moved down.`,
                        )}
                        style={[styles.iconButton, (controlsBusy || index === visiblePreview.trackSignals.length - 1) && styles.disabled]}
                      >
                            <Ionicons color={canalDynamicColors.muted} name="chevron-down" size={16} />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityLabel={`Remove and replace ${signal.track.name}`}
                      accessibilityHint="Removes this track and automatically generates a replacement"
                      accessibilityRole="button"
                      accessibilityState={{ busy: generationBusy, disabled: controlsBusy }}
                      disabled={controlsBusy}
                      onPress={() => void replaceTrack(signal.track.id, signal.track.name, false)}
                      style={[styles.trashButton, controlsBusy && styles.disabled]}
                    >
                      <Ionicons color={canalDynamicColors.danger} name="trash" size={16} />
                    </Pressable>
                  </View>
                </View>
                </Fragment>
              );
            })}
            <Text style={styles.spotifyAttribution}>
              Artwork prioritizes Apple Music, with Spotify and Genius as fallbacks. Track metadata reflects connected services.
            </Text>
            <View accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.editorStatus}>
              {editorStatus ? <Text style={styles.noticeText}>{editorStatus}</Text> : null}
            </View>
            {undoPreview ? (
              <Pressable
                accessibilityLabel="Undo last Scene edit"
                accessibilityRole="button"
                accessibilityState={{ busy: editorBusy, disabled: controlsBusy }}
                disabled={controlsBusy}
                onPress={() => void mutatePreview(
                  () => undoPreview,
                  "Last Scene edit undone.",
                  null,
                )}
                style={[styles.secondaryButton, controlsBusy && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>Undo</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="Save Scene privately"
              accessibilityHint={connectivityStatus === "online" ? "Saves this Scene to your private Library" : "Requires an internet connection"}
              accessibilityRole="button"
              accessibilityState={{ busy: saveBusy, disabled: controlsBusy || connectivityStatus !== "online" || visiblePreview.trackSignals.length === 0 }}
              disabled={controlsBusy || connectivityStatus !== "online" || visiblePreview.trackSignals.length === 0}
              onPress={() => void saveScene()}
              style={[styles.button, (controlsBusy || connectivityStatus !== "online") && styles.disabled]}
            >
              <Text style={styles.buttonText}>{saveBusy ? "Saving…" : "Save Scene privately"}</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="Return to Scene Studio"
          accessibilityRole="button"
          accessibilityHint="Returns to edit while preserving this account’s scoped draft"
          accessibilityState={{ disabled: controlsBusy }}
          disabled={controlsBusy}
          onPress={() => returnToStudio(stageId)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            Return to Scene Studio
          </Text>
        </Pressable>
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={cancelMismatchSwap}
        onShow={() => {
          const handle = findNodeHandle(reasonHeadingRef.current);
          if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
        }}
        transparent
        visible={Boolean(pendingMismatch)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.reasonBackdrop}>
          <View
            accessibilityViewIsModal
            style={styles.reasonPanel}
          >
            <View style={styles.reasonHeader}>
              <Text ref={reasonHeadingRef} accessibilityRole="header" style={styles.reasonTitle}>
                Why doesn’t {pendingMismatch?.trackName ?? "this track"} fit?
              </Text>
              <Pressable
                accessibilityLabel="Cancel track swap"
                accessibilityRole="button"
                onPress={cancelMismatchSwap}
                style={styles.reasonClose}
              >
                <Ionicons color={canalDynamicColors.text} name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.reasonScrollContent}
              keyboardShouldPersistTaps="handled"
              style={styles.reasonScroll}
            >
              <Text style={styles.reasonHelper}>Optional · choose up to {MAX_SCENE_FEEDBACK_REASONS}</Text>
              <View style={styles.reasonWrap}>
                {SCENE_FEEDBACK_REASONS.map((reason) => {
                  const checked = mismatchReasons.includes(reason);
                  return (
                    <Pressable
                      key={reason}
                      accessibilityLabel={SCENE_FEEDBACK_REASON_LABELS[reason]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled: controlsBusy }}
                      disabled={controlsBusy}
                      onPress={() => toggleMismatchReason(reason)}
                      style={[styles.reasonChip, checked && styles.reasonChipSelected]}
                    >
                      <Text style={[styles.reasonChipText, checked && styles.reasonChipTextSelected]}>
                        {SCENE_FEEDBACK_REASON_LABELS[reason]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.reasonActions}>
                <Pressable
                  accessibilityLabel={`Skip reasons and swap ${pendingMismatch?.trackName ?? "track"}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: controlsBusy }}
                  disabled={controlsBusy}
                  onPress={() => confirmMismatchSwap([])}
                  style={styles.reasonSecondary}
                >
                  <Text style={styles.reasonSecondaryText}>Skip reasons</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Swap ${pendingMismatch?.trackName ?? "track"}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: controlsBusy }}
                  disabled={controlsBusy}
                  onPress={() => confirmMismatchSwap(mismatchReasons)}
                  style={styles.reasonPrimary}
                >
                  <Text style={styles.reasonPrimaryText}>Swap track</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      <LinerNotesOverlay
        context={linerNotes.context}
        onClose={() => setContextTrack(null)}
        onRetry={linerNotes.retry}
        state={linerNotes.state}
        track={contextTrack}
        visible={Boolean(contextTrack)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: canalDynamicColors.baseCanvas,
  },
  content: {
    flexGrow: 1,
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 120,
  },
  title: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 34,
    fontWeight: "700",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  backButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  notice: {
    backgroundColor: "rgba(16, 28, 25, 0.94)",
    borderColor: "#2D695E",
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  noticeTitle: {
    color: canalDynamicColors.mint,
    fontSize: 17,
    fontWeight: "800",
  },
  noticeText: {
    color: canalDynamicColors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#50CDB6",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 20,
  },
  previewCard: {
    backgroundColor: "rgba(15, 21, 20, 0.94)",
    borderColor: "#29332F",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  previewTitle: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 24,
    fontWeight: "700",
  },
  regenerateButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#2D244A",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  regenerateButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitle: {
    color: canalDynamicColors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  catalogSearch: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: "#0B100F",
    borderColor: "#39433F",
    borderRadius: 14,
    borderWidth: 1,
    color: canalDynamicColors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  catalogResult: {
    alignItems: "center",
    borderTopColor: "#29332F",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingTop: 10,
  },
  catalogResultText: {
    flex: 1,
  },
  underfillText: {
    color: "#F0D17E",
    fontSize: 15,
    lineHeight: 22,
  },
  trackRow: {
    alignItems: "center",
    borderTopColor: "#29332F",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingVertical: 8,
  },
  trackArtwork: {
    backgroundColor: "#1A2320",
    borderRadius: 8,
    height: 54,
    width: 54,
  },
  artworkBadgeWrap: { position: "relative" },
  artworkBadge: { bottom: -3, position: "absolute", right: -3 },
  trackArtworkFallback: {
    alignItems: "center",
    backgroundColor: "#1A2320",
    borderRadius: 8,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  trackArtworkNote: {
    color: "#A5AEA9",
    fontSize: 22,
  },
  trackBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  compactControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  arrowStack: {
    gap: 2,
  },
  iconButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  trashButton: {
    alignItems: "center",
    borderRadius: 9,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  mismatchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 48,
  },
  trackFeedbackActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  dislikeButtonText: {
    color: canalDynamicColors.danger,
  },
  mismatchButtonText: {
    color: canalDynamicColors.mint,
    fontSize: 12,
    fontWeight: "700",
  },
  reasonPanel: {
    backgroundColor: "rgba(255,255,255,.07)",
    borderColor: "rgba(255,255,255,.15)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    maxHeight: "88%",
    padding: 12,
  },
  reasonBackdrop: {
    backgroundColor: "rgba(0,0,0,.58)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 12,
  },
  reasonHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  reasonClose: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  reasonTitle: {
    color: canalDynamicColors.text,
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  reasonHelper: {
    color: canalDynamicColors.muted,
    fontSize: 12,
  },
  reasonScroll: {
    flexShrink: 1,
  },
  reasonScrollContent: {
    gap: 10,
    paddingBottom: 2,
  },
  reasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  reasonChip: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,.18)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  reasonChipSelected: {
    backgroundColor: canalDynamicColors.mint,
  },
  reasonChipText: {
    color: canalDynamicColors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  reasonChipTextSelected: {
    color: "#103C46",
  },
  reasonActions: {
    flexDirection: "row",
    gap: 8,
  },
  reasonSecondary: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  reasonSecondaryText: {
    color: canalDynamicColors.mint,
    fontSize: 13,
    fontWeight: "800",
  },
  reasonPrimary: {
    alignItems: "center",
    backgroundColor: canalDynamicColors.mint,
    borderRadius: 13,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10,
  },
  reasonPrimaryText: {
    color: "#103C46",
    fontSize: 13,
    fontWeight: "900",
  },
  spotifyAttribution: {
    color: "#A5AEA9",
    fontSize: 12,
    lineHeight: 17,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#3B655D",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: canalDynamicColors.mint,
    fontSize: 14,
    fontWeight: "800",
  },
  editorStatus: {
    minHeight: 24,
  },
  disabled: {
    opacity: 0.45,
  },
  trackTitle: {
    color: canalDynamicColors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  trackArtist: {
    color: "#A5AEA9",
    fontSize: 13,
  },
  matchText: {
    color: canalDynamicColors.mint,
    fontSize: 13,
    lineHeight: 17,
  },
  lowConfidenceText: {
    color: "#F0D17E",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  buttonText: {
    color: "#10201C",
    fontSize: 16,
    fontWeight: "800",
  },
});
