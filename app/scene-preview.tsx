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

import {
  spotifyMusicProvider,
} from "../lib/music-providers/spotify";

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
  readSpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import {
  addUserSelectedGenreCatalogTracks,
} from "../lib/scene-genre-catalog";

import {
  addSpotifyArtworkToGeneratedScene,
} from "../lib/spotify-scene-artwork";

import {
  sceneAtmosphere,
} from "../components/canal-ui/scene-signature";

import {
  CanalAtmosphereContext,
} from "../theme/canal-atmosphere-context";

import {
  readScenes,
} from "../lib/scenes";

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
    setCatalogQuery("");
    setCatalogResults([]);
    mutationSequenceRef.current += 1;
    saveSequenceRef.current += 1;
    mutationInFlightRef.current = false;
    saveInFlightRef.current = false;
    generationInFlightRef.current = false;
  }, [scope]);

  useEffect(() => {
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

      const preview =
        await repositoryRef.current.readPreview({
          scope: operationScope,
          currentScope,
          operationGuard: canCommit,
        });

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
    scope,
  ]);

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

  const searchSpotify = useCallback(async (): Promise<void> => {
    if (catalogBusy || mutationInFlightRef.current || saveInFlightRef.current) {
      return;
    }

    const query = catalogQuery.trim();
    const operationScope = scope;

    if (!operationScope || query.length < 2) {
      setEditorStatus("Enter at least two characters to search Spotify.");
      return;
    }

    if (connectivityStatus !== "online") {
      setEditorStatus("Connect to the internet to search Spotify.");
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
    setEditorStatus("Searching Spotify…");

    try {
      const results = await spotifyMusicProvider.searchCatalog({
        query,
        limit: 10,
      });

      if (!operationGuard()) {
        return;
      }

      setCatalogResults(results);
      setEditorStatus(
        results.length > 0
          ? `${results.length} Spotify result${results.length === 1 ? "" : "s"}. Choose tracks to add.`
          : "Spotify found no matching tracks.",
      );
    } catch (error) {
      if (operationGuard()) {
        setCatalogResults([]);
        setEditorStatus(
          error instanceof Error
            ? error.message
            : "Canal could not search Spotify.",
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
      const startingSpotifyGuard =
        await captureSpotifyCanalAccountGuard();
      const storedSnapshot = await readSpotifyLibrarySnapshot();

      if (
        !storedSnapshot ||
        storedSnapshot.importStatus?.state === "incomplete"
      ) {
        throw new Error("Sync your Spotify Library before regenerating this Scene.");
      }

      const snapshot = await addUserSelectedGenreCatalogTracks(
        current.draft,
        storedSnapshot,
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
      const endingSpotifyGuard =
        await captureSpotifyCanalAccountGuard();

      if (
        !operationGuard() ||
        !sameSpotifyAccountGuard(startingSpotifyGuard, endingSpotifyGuard)
      ) {
        throw new Error("The active account changed. No playlist changes were saved.");
      }

      const generated = generateSceneWithSpotifyGenreFallback(
        current.draft,
        snapshot,
        {
          variationSeed: `${operationScope.userId}:${Date.now()}:${mutationSequenceRef.current}`,
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
      const generated = await generateAlternative(current);
      await mutatePreview(
        (preview) => regenerateGeneratedSceneEditor(preview, generated),
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
        const generated = await generateAlternative(current);
        await mutatePreview(
          (preview) => replaceTrackInGeneratedSceneEditor(
            preview,
            trackId,
            generated,
          ),
          mismatch
            ? `${trackName} was rejected and replaced with a better fit.`
            : `${trackName} was removed and replaced with a new track.`,
        );
        await recordSceneRecommendationFeedback({
          scope: operationScope,
          currentScope,
          draft: current.draft,
          action: mismatch ? "swap" : "remove",
          trackId,
          sceneId: current.scene.id,
        });
        if (mismatch) {
          await recordSceneRecommendationFeedback({
            scope: operationScope,
            currentScope,
            draft: current.draft,
            action: "doesnt_match",
            trackId,
            sceneId: current.scene.id,
          });
        }
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

  const controlsBusy = editorBusy || saveBusy || catalogBusy || generationBusy;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={styles.title}>
          Edit Scene
        </Text>

        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>
            Spotify catalog
          </Text>
          <Text style={styles.noticeText}>
            Canal generated this private draft from your synced Spotify library. Reorder, replace, regenerate, or add tracks before saving.
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
                Add Spotify tracks
              </Text>
              <TextInput
                accessibilityLabel="Search Spotify tracks"
                autoCapitalize="none"
                editable={!controlsBusy}
                maxLength={100}
                onChangeText={setCatalogQuery}
                onSubmitEditing={() => void searchSpotify()}
                placeholder="Song or artist"
                placeholderTextColor={canalDynamicColors.muted}
                returnKeyType="search"
                style={styles.searchInput}
                value={catalogQuery}
              />
              <Pressable
                accessibilityLabel="Search Spotify"
                accessibilityRole="button"
                accessibilityState={{ busy: catalogBusy, disabled: controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online" }}
                disabled={controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online"}
                onPress={() => void searchSpotify()}
                style={[styles.secondaryButton, (controlsBusy || catalogQuery.trim().length < 2 || connectivityStatus !== "online") && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>{catalogBusy ? "Searching…" : "Search Spotify"}</Text>
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
                <View key={signal.track.id} style={styles.trackRow}>
                  {artworkUrl ? (
                    <Image
                      accessibilityLabel={`${signal.track.album?.name ?? signal.track.name} cover art from Spotify`}
                      contentFit="cover"
                      source={{ uri: artworkUrl }}
                      style={styles.trackArtwork}
                      transition={120}
                    />
                  ) : (
                    <View accessibilityElementsHidden style={styles.trackArtworkFallback}>
                      <Text style={styles.trackArtworkNote}>♪</Text>
                    </View>
                  )}
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
                    <Pressable
                      accessibilityLabel={`Swap ${signal.track.name}`}
                      accessibilityHint="Removes this track from the current Scene and generates a different replacement"
                      accessibilityRole="button"
                      accessibilityState={{ busy: generationBusy, disabled: controlsBusy }}
                      disabled={controlsBusy}
                      onPress={() => void replaceTrack(signal.track.id, signal.track.name, true)}
                      style={styles.mismatchButton}
                    >
                      <Ionicons
                        color={canalDynamicColors.mint}
                        name="sync-outline"
                        size={14}
                      />
                      <Text style={styles.mismatchButtonText}>Swap</Text>
                    </Pressable>
                  </View>
                  <View style={styles.compactControls}>
                    <View style={styles.arrowStack}>
                      <Pressable
                        accessibilityLabel={`Move ${signal.track.name} up`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: controlsBusy || index === 0 }}
                        disabled={controlsBusy || index === 0}
                            hitSlop={{ bottom: 8, left: 4, right: 4, top: 8 }}
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
                            hitSlop={{ bottom: 8, left: 4, right: 4, top: 8 }}
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
                      hitSlop={{ left: 4, right: 4 }}
                      onPress={() => void replaceTrack(signal.track.id, signal.track.name, false)}
                      style={[styles.trashButton, controlsBusy && styles.disabled]}
                    >
                      <Ionicons color={canalDynamicColors.danger} name="trash" size={16} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Text style={styles.spotifyAttribution}>
              Album artwork and track metadata provided by Spotify.
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
    gap: 0,
  },
  iconButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 40,
  },
  trashButton: {
    alignItems: "center",
    borderRadius: 9,
    height: 48,
    justifyContent: "center",
    width: 40,
  },
  mismatchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 32,
  },
  mismatchButtonText: {
    color: canalDynamicColors.mint,
    fontSize: 12,
    fontWeight: "700",
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
