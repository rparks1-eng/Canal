import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createSceneStudioDraft,
  getSceneFamiliarityLevel,
  SCENE_ACTIVITY_OPTIONS,
} from "./scene-studio";
import type { SceneStudioDraft } from "./scene-studio";
import type { StoredScene } from "./scenes";
import {
  buildSceneReasonBias,
  normalizeSceneFeedbackReasonsForAction,
} from "./scene-recommendation-reasons";
import type {
  SceneFeedbackReason,
  SceneReasonBias,
} from "./scene-recommendation-reasons";
import type { SceneStudioScope } from "./scene-studio-scope";
import {
  sameSceneStudioScope,
  sceneStudioScopeKey,
} from "./scene-studio-scope";
import { isSupabaseConfigured, supabase } from "./supabase";

export type SceneRecommendationAction =
  | "swap"
  | "remove"
  | "doesnt_match"
  | "favorite"
  | "unfavorite"
  | "skip"
  | "replay";

export type SceneRecommendationFeedback = Readonly<{
  id: string;
  userId: string;
  intentKey: string;
  action: SceneRecommendationAction;
  trackId: string;
  sceneId?: string;
  reasons: readonly SceneFeedbackReason[];
  artistIds: readonly string[];
  genres: readonly string[];
  explicit: boolean | null;
  createdAt: string;
}>;

export type SceneRecommendationLearning = Readonly<{
  rejectedTrackIds: string[];
  deprioritizedTrackIds: string[];
  preferredTrackIds: string[];
  reasonBias: SceneReasonBias;
}>;

export type SceneRecommendationFeedbackReasonCode =
  | "invalid_track_id"
  | "scope_changed_before_write"
  | "local_persistence_failed"
  | "cloud_not_configured"
  | "scope_changed_after_local_write"
  | "cloud_account_unavailable"
  | "cloud_sync_failed"
  | "no_pending_feedback";

export type SceneRecommendationFeedbackWriteResult = Readonly<
  | {
      outcome: "skipped";
      reason: "invalid_track_id" | "scope_changed_before_write" | "no_pending_feedback";
      localStored: false;
      cloud: "skipped";
    }
  | {
      outcome: "failure";
      reason: "local_persistence_failed";
      localStored: false;
      cloud: "skipped";
    }
  | {
      outcome: "local_stored";
      reason:
        | "cloud_not_configured"
        | "cloud_sync_scheduled"
        | "scope_changed_after_local_write"
        | "cloud_account_unavailable"
        | "cloud_sync_failed";
      localStored: true;
      cloud: "pending";
      eventId?: string;
    }
  | {
      outcome: "cloud_synced";
      localStored: true;
      cloud: "synced";
      eventId?: string;
      syncedCount: number;
    }
>;

const PREFIX = "@canal/scene-recommendation-feedback:v1";
const PENDING_PREFIX = "@canal/scene-recommendation-feedback-pending:v1";
const MAX_EVENTS = 1_000;
const MAX_SYNC_BATCH = 100;
const MAX_ARTIST_IDS = 20;
const MAX_ARTIST_ID_LENGTH = 128;
const MAX_GENRES = 12;
const MAX_GENRE_LENGTH = 80;
let lastEventTimeMs = 0;
const storageTails = new Map<string, Promise<void>>();
const backgroundFlushes = new Map<string, Promise<void>>();
const BACKGROUND_FLUSH_RETRY_DELAYS_MS = [0, 1_000, 5_000] as const;
const CLOUD_REQUEST_TIMEOUT_MS = 10_000;
const CLOUD_SCOPE_POLL_MS = 100;

type SceneFeedbackFlushTiming = Readonly<{
  requestTimeoutMs?: number;
  scopePollMs?: number;
  retryDelaysMs?: readonly number[];
}>;

function normalizedList(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

function normalizedContext(
  values: readonly unknown[] | null | undefined,
  maxValues: number,
  maxLength: number,
  lowerCase: boolean,
): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const normalized = value.trim().slice(0, maxLength);
    if (!normalized) return [];
    return [lowerCase ? normalized.toLowerCase() : normalized];
  }))).slice(0, maxValues);
}

export function sceneRecommendationIntentKey(draft: Pick<
  SceneStudioDraft,
  | "activity"
  | "moods"
  | "preferredGenres"
  | "allowAdjacentGenres"
  | "durationMinutes"
  | "energy"
  | "familiarity"
  | "familiarityLevel"
  | "arc"
  | "includeRecent"
  | "allowExplicit"
  | "avoidRecentSceneTracks"
  | "smoothTransitions"
  | "notes"
>): string {
  return JSON.stringify({
    version: 2,
    activity: draft.activity.trim().toLowerCase(),
    moods: normalizedList(draft.moods),
    genres: normalizedList(draft.preferredGenres),
    allowAdjacentGenres: draft.allowAdjacentGenres,
    durationMinutes: Number.isFinite(draft.durationMinutes)
      ? draft.durationMinutes
      : 0,
    energy: draft.energy.trim().toLowerCase(),
    familiarityLevel: getSceneFamiliarityLevel(draft),
    arc: draft.arc.trim().toLowerCase(),
    includeRecent: draft.includeRecent,
    allowExplicit: draft.allowExplicit,
    avoidRecentSceneTracks: draft.avoidRecentSceneTracks !== false,
    smoothTransitions: draft.smoothTransitions !== false,
    notes: draft.notes.trim().replace(/\s+/gu, " ").toLowerCase(),
  });
}

function storageKey(scope: SceneStudioScope): string {
  return `${PREFIX}:${sceneStudioScopeKey(scope)}`;
}

function pendingStorageKey(scope: SceneStudioScope): string {
  return `${PENDING_PREFIX}:${sceneStudioScopeKey(scope)}`;
}

async function withScopeStorageLock<T>(
  scope: SceneStudioScope,
  work: () => Promise<T>,
): Promise<T> {
  const key = sceneStudioScopeKey(scope);
  const previous = storageTails.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const tail = run.then(() => undefined, () => undefined);
  storageTails.set(key, tail);
  try {
    return await run;
  } finally {
    if (storageTails.get(key) === tail) storageTails.delete(key);
  }
}

function isAction(value: unknown): value is SceneRecommendationAction {
  return ["swap", "remove", "doesnt_match", "favorite", "unfavorite", "skip", "replay"].includes(String(value));
}

function parseEvents(value: string | null, userId: string): SceneRecommendationFeedback[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): SceneRecommendationFeedback[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (
        row.userId !== userId ||
        typeof row.id !== "string" ||
        typeof row.intentKey !== "string" ||
        typeof row.trackId !== "string" ||
        typeof row.createdAt !== "string" ||
        !isAction(row.action)
      ) return [];
      return [{
        id: row.id,
        userId,
        intentKey: row.intentKey,
        action: row.action,
        trackId: row.trackId,
        ...(typeof row.sceneId === "string" ? { sceneId: row.sceneId } : {}),
        reasons: normalizeSceneFeedbackReasonsForAction(
          row.action,
          Array.isArray(row.reasons) ? row.reasons : [],
        ),
        artistIds: normalizedContext(
          Array.isArray(row.artistIds) ? row.artistIds : [],
          MAX_ARTIST_IDS,
          MAX_ARTIST_ID_LENGTH,
          false,
        ),
        genres: normalizedContext(
          Array.isArray(row.genres) ? row.genres : [],
          MAX_GENRES,
          MAX_GENRE_LENGTH,
          true,
        ),
        explicit: typeof row.explicit === "boolean" ? row.explicit : null,
        createdAt: row.createdAt,
      }];
    }).slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

async function readLocal(scope: SceneStudioScope): Promise<SceneRecommendationFeedback[]> {
  return parseEvents(await AsyncStorage.getItem(storageKey(scope)), scope.userId);
}

async function readPending(scope: SceneStudioScope): Promise<SceneRecommendationFeedback[]> {
  return parseEvents(await AsyncStorage.getItem(pendingStorageKey(scope)), scope.userId);
}

async function persistLocalAndPending(
  scope: SceneStudioScope,
  nextEvents: readonly SceneRecommendationFeedback[],
): Promise<boolean> {
  return withScopeStorageLock(scope, async () => {
    const eventKey = storageKey(scope);
    const pendingKey = pendingStorageKey(scope);
    let priorEvents: string | null = null;
    let priorPending: string | null = null;
    let snapshotsLoaded = false;
    try {
      [priorEvents, priorPending] = await Promise.all([
        AsyncStorage.getItem(eventKey),
        AsyncStorage.getItem(pendingKey),
      ]);
      snapshotsLoaded = true;
      const events = [...parseEvents(priorEvents, scope.userId), ...nextEvents].slice(-MAX_EVENTS);
      const pending = [...parseEvents(priorPending, scope.userId), ...nextEvents].slice(-MAX_EVENTS);
      await AsyncStorage.setItem(eventKey, JSON.stringify(events));
      await AsyncStorage.setItem(pendingKey, JSON.stringify(pending));
      return true;
    } catch {
      try {
        if (!snapshotsLoaded) return false;
        if (priorEvents === null) await AsyncStorage.removeItem(eventKey);
        else await AsyncStorage.setItem(eventKey, priorEvents);
        if (priorPending === null) await AsyncStorage.removeItem(pendingKey);
        else await AsyncStorage.setItem(pendingKey, priorPending);
      } catch {
        // A later scoped write can safely repair the bounded local queue.
      }
      return false;
    }
  });
}

function cloudRows(events: readonly SceneRecommendationFeedback[]) {
  return events.map((event) => ({
    id: event.id,
    user_id: event.userId,
    intent_key: event.intentKey,
    action: event.action,
    track_id: event.trackId,
    scene_id: event.sceneId ?? null,
    reasons: event.reasons,
    track_artist_ids: event.artistIds,
    track_genres: event.genres,
    track_explicit: event.explicit,
    created_at: event.createdAt,
  }));
}

async function removeSyncedPending(
  scope: SceneStudioScope,
  syncedIds: ReadonlySet<string>,
  currentScope: () => SceneStudioScope | null,
): Promise<boolean> {
  return withScopeStorageLock(scope, async () => {
    try {
      if (!sameSceneStudioScope(scope, currentScope())) return false;
      const pending = await readPending(scope);
      if (!sameSceneStudioScope(scope, currentScope())) return false;
      await AsyncStorage.setItem(
        pendingStorageKey(scope),
        JSON.stringify(pending.filter((event) => !syncedIds.has(event.id))),
      );
      return true;
    } catch {
      return false;
    }
  });
}

export async function flushPendingSceneRecommendationFeedback(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  timing: SceneFeedbackFlushTiming = {},
): Promise<SceneRecommendationFeedbackWriteResult> {
  if (!sameSceneStudioScope(scope, currentScope())) {
    return { outcome: "skipped", reason: "scope_changed_before_write", localStored: false, cloud: "skipped" };
  }
  let pending: SceneRecommendationFeedback[];
  try {
    pending = await withScopeStorageLock(scope, () => readPending(scope));
  } catch {
    return { outcome: "failure", reason: "local_persistence_failed", localStored: false, cloud: "skipped" };
  }
  if (pending.length < 1) {
    return { outcome: "skipped", reason: "no_pending_feedback", localStored: false, cloud: "skipped" };
  }
  if (!isSupabaseConfigured) {
    return { outcome: "local_stored", reason: "cloud_not_configured", localStored: true, cloud: "pending" };
  }
  if (!sameSceneStudioScope(scope, currentScope())) {
    return { outcome: "local_stored", reason: "scope_changed_after_local_write", localStored: true, cloud: "pending" };
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (
      authError ||
      user?.id !== scope.userId ||
      !sameSceneStudioScope(scope, currentScope())
    ) {
      return { outcome: "local_stored", reason: "cloud_account_unavailable", localStored: true, cloud: "pending" };
    }

    const batch = pending.slice(0, MAX_SYNC_BATCH);
    const controller = new AbortController();
    const request = supabase
      .from("scene_recommendation_feedback")
      .upsert(cloudRows(batch), { onConflict: "id" });
    const abortableRequest = typeof request.abortSignal === "function"
      ? request.abortSignal(controller.signal)
      : request;
    const requestResult = await new Promise<{
      error: unknown;
      scopeChanged: boolean;
    }>((resolve) => {
      let settled = false;
      let scopeTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error: unknown, scopeChanged = false): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        if (scopeTimer) clearTimeout(scopeTimer);
        resolve({ error, scopeChanged });
      };
      const timeoutTimer = setTimeout(() => {
        controller.abort();
        finish(new Error("feedback_cloud_timeout"));
      }, Math.max(1, timing.requestTimeoutMs ?? CLOUD_REQUEST_TIMEOUT_MS));
      const checkScope = (): void => {
        if (!sameSceneStudioScope(scope, currentScope())) {
          controller.abort();
          finish(null, true);
          return;
        }
        scopeTimer = setTimeout(
          checkScope,
          Math.max(1, timing.scopePollMs ?? CLOUD_SCOPE_POLL_MS),
        );
      };
      checkScope();
      Promise.resolve(abortableRequest).then(
        (result) => finish(result.error),
        (error) => finish(error),
      );
    });
    if (requestResult.error || requestResult.scopeChanged || !sameSceneStudioScope(scope, currentScope())) {
      return {
        outcome: "local_stored",
        reason: requestResult.scopeChanged || !sameSceneStudioScope(scope, currentScope())
          ? "scope_changed_after_local_write"
          : "cloud_sync_failed",
        localStored: true,
        cloud: "pending",
      };
    }

    const syncedIds = new Set(batch.map((event) => event.id));
    if (!await removeSyncedPending(scope, syncedIds, currentScope)) {
      return { outcome: "local_stored", reason: "cloud_sync_failed", localStored: true, cloud: "pending" };
    }
    return { outcome: "cloud_synced", localStored: true, cloud: "synced", syncedCount: batch.length };
  } catch {
    return { outcome: "local_stored", reason: "cloud_sync_failed", localStored: true, cloud: "pending" };
  }
}

function waitForBackgroundRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function scheduleSceneRecommendationFeedbackFlush(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  timing: SceneFeedbackFlushTiming = {},
): void {
  const key = sceneStudioScopeKey(scope);
  if (backgroundFlushes.has(key)) return;

  const worker = (async (): Promise<void> => {
    let failureAttempt = 0;
    let successfulBatches = 0;

    const retryDelays = timing.retryDelaysMs ?? BACKGROUND_FLUSH_RETRY_DELAYS_MS;
    while (failureAttempt < retryDelays.length && successfulBatches < 10) {
      await waitForBackgroundRetry(retryDelays[failureAttempt] ?? 0);
      if (!sameSceneStudioScope(scope, currentScope())) return;

      const result = await flushPendingSceneRecommendationFeedback(scope, currentScope, timing)
        .catch((): SceneRecommendationFeedbackWriteResult => ({
          outcome: "local_stored",
          reason: "cloud_sync_failed",
          localStored: true,
          cloud: "pending",
        }));

      if (result.outcome === "cloud_synced") {
        successfulBatches += 1;
        failureAttempt = 0;
        continue;
      }
      if (result.outcome === "skipped") return;
      if (
        result.outcome === "local_stored" &&
        (result.reason === "cloud_sync_failed" || result.reason === "cloud_account_unavailable")
      ) {
        failureAttempt += 1;
        continue;
      }
      return;
    }
  })().catch(() => undefined).finally(() => {
    if (backgroundFlushes.get(key) === worker) backgroundFlushes.delete(key);
  });

  backgroundFlushes.set(key, worker);
}

export async function recordSceneRecommendationFeedback(input: {
  scope: SceneStudioScope;
  currentScope: () => SceneStudioScope | null;
  draft: SceneStudioDraft;
  action: SceneRecommendationAction;
  trackId: string;
  sceneId?: string;
  reasons?: readonly unknown[];
  artistIds?: readonly unknown[];
  genres?: readonly unknown[];
  explicit?: boolean;
}): Promise<SceneRecommendationFeedbackWriteResult> {
  const trackId = input.trackId.trim();
  if (!trackId) {
    return { outcome: "skipped", reason: "invalid_track_id", localStored: false, cloud: "skipped" };
  }
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return { outcome: "skipped", reason: "scope_changed_before_write", localStored: false, cloud: "skipped" };
  }

  const event = createFeedbackEvent(input, trackId);

  if (!await persistLocalAndPending(input.scope, [event])) {
    return { outcome: "failure", reason: "local_persistence_failed", localStored: false, cloud: "skipped" };
  }
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return {
      outcome: "local_stored",
      reason: "scope_changed_after_local_write",
      localStored: true,
      cloud: "pending",
      eventId: event.id,
    };
  }

  const flush = await flushPendingSceneRecommendationFeedback(input.scope, input.currentScope);
  if (flush.outcome === "cloud_synced") {
    const pending = await readPending(input.scope).catch(() => [event]);
    if (!pending.some((candidate) => candidate.id === event.id)) {
      return { ...flush, eventId: event.id };
    }
    return {
      outcome: "local_stored",
      reason: "cloud_sync_failed",
      localStored: true,
      cloud: "pending",
      eventId: event.id,
    };
  }
  if (flush.outcome === "local_stored") return { ...flush, eventId: event.id };
  return {
    outcome: "local_stored",
    reason: (flush.outcome === "skipped" || flush.outcome === "failure") && flush.reason === "scope_changed_before_write"
      ? "scope_changed_after_local_write"
      : "cloud_sync_failed",
    localStored: true,
    cloud: "pending",
    eventId: event.id,
  };
}

function createFeedbackEvent(
  input: {
    scope: SceneStudioScope;
    draft: SceneStudioDraft;
    action: SceneRecommendationAction;
    sceneId?: string;
    reasons?: readonly unknown[];
    artistIds?: readonly unknown[];
    genres?: readonly unknown[];
    explicit?: boolean;
  },
  trackId: string,
): SceneRecommendationFeedback {
  const eventTimeMs = Math.max(Date.now(), lastEventTimeMs + 1);
  lastEventTimeMs = eventTimeMs;
  const supportsNegativeContext = ["swap", "remove", "doesnt_match"].includes(input.action);
  return {
    id: `${eventTimeMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    userId: input.scope.userId,
    intentKey: sceneRecommendationIntentKey(input.draft),
    action: input.action,
    trackId,
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    reasons: normalizeSceneFeedbackReasonsForAction(input.action, input.reasons),
    artistIds: supportsNegativeContext
      ? normalizedContext(input.artistIds, MAX_ARTIST_IDS, MAX_ARTIST_ID_LENGTH, false)
      : [],
    genres: supportsNegativeContext
      ? normalizedContext(input.genres, MAX_GENRES, MAX_GENRE_LENGTH, true)
      : [],
    explicit: supportsNegativeContext && typeof input.explicit === "boolean" ? input.explicit : null,
    createdAt: new Date(eventTimeMs).toISOString(),
  };
}

export async function readSceneRecommendationLearning(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  draft: SceneStudioDraft,
): Promise<SceneRecommendationLearning> {
  const intentKey = sceneRecommendationIntentKey(draft);
  let events = await readLocal(scope);
  if (!sameSceneStudioScope(scope, currentScope())) return {
    rejectedTrackIds: [],
    deprioritizedTrackIds: [],
    preferredTrackIds: [],
    reasonBias: buildSceneReasonBias([]),
  };

  await flushPendingSceneRecommendationFeedback(scope, currentScope);

  if (isSupabaseConfigured) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === scope.userId && sameSceneStudioScope(scope, currentScope())) {
        const { data } = await supabase
          .from("scene_recommendation_feedback")
          .select("id,user_id,intent_key,action,track_id,scene_id,reasons,track_artist_ids,track_genres,track_explicit,created_at")
          .eq("user_id", scope.userId)
          .eq("intent_key", intentKey)
          .order("created_at", { ascending: false })
          .limit(500);
        const cloud = (data ?? []).map((row) => ({
          id: String(row.id), userId: String(row.user_id), intentKey: String(row.intent_key),
          action: row.action as SceneRecommendationAction, trackId: String(row.track_id),
          ...(row.scene_id ? { sceneId: String(row.scene_id) } : {}),
          reasons: normalizeSceneFeedbackReasonsForAction(row.action, Array.isArray(row.reasons) ? row.reasons : []),
          artistIds: normalizedContext(Array.isArray(row.track_artist_ids) ? row.track_artist_ids : [], MAX_ARTIST_IDS, MAX_ARTIST_ID_LENGTH, false),
          genres: normalizedContext(Array.isArray(row.track_genres) ? row.track_genres : [], MAX_GENRES, MAX_GENRE_LENGTH, true),
          explicit: typeof row.track_explicit === "boolean" ? row.track_explicit : null,
          createdAt: String(row.created_at),
        })).filter((event) => event.userId === scope.userId && isAction(event.action));
        const merged = new Map([...events, ...cloud].map((event) => [event.id, event]));
        events = [...merged.values()].slice(-MAX_EVENTS);
        if (sameSceneStudioScope(scope, currentScope())) {
          await AsyncStorage.setItem(storageKey(scope), JSON.stringify(events));
        }
      }
    } catch {
      // Local learning remains available while cloud feedback is offline.
    }
  }

  const relevant = events
    .filter((event) => event.intentKey === intentKey)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latestByTrack = new Map<string, SceneRecommendationFeedback>();
  for (const event of relevant) latestByTrack.set(event.trackId, event);

  const rejected = new Set<string>();
  const deprioritized = new Set<string>();
  const preferred = new Set<string>();
  for (const event of latestByTrack.values()) {
    if (event.action === "doesnt_match") rejected.add(event.trackId);
    else if (["swap", "remove", "skip"].includes(event.action)) deprioritized.add(event.trackId);
    else if (["favorite", "replay"].includes(event.action)) preferred.add(event.trackId);
  }
  return {
    rejectedTrackIds: [...rejected],
    deprioritizedTrackIds: [...deprioritized],
    preferredTrackIds: [...preferred],
    reasonBias: buildSceneReasonBias(
      [...latestByTrack.values()].map((event) => ({
        ...event,
        trackArtistIds: event.artistIds,
        trackGenres: event.genres,
        trackExplicit: event.explicit ?? undefined,
      })),
    ),
  };
}

export function sceneRecommendationDraftFromStoredScene(scene: StoredScene): SceneStudioDraft {
  const fallback = createSceneStudioDraft();
  const activity = SCENE_ACTIVITY_OPTIONS.some((option) => option.value === scene.activity)
    ? scene.activity as SceneStudioDraft["activity"]
    : fallback.activity;
  const energy = ["low", "medium", "high"].includes(scene.energy)
    ? scene.energy as SceneStudioDraft["energy"]
    : fallback.energy;
  const sceneArc = typeof scene.sceneArc === "string" ? scene.sceneArc : "";
  const arc = ["steady", "build", "wave", "peak-and-release"].includes(sceneArc)
    ? sceneArc as SceneStudioDraft["arc"]
    : fallback.arc;
  const familiarityLevel = scene.familiarity === "familiar" ? 0 : scene.familiarity === "discovery" ? 100 : 50;
  return {
    ...fallback,
    name: scene.name,
    activity,
    moods: scene.emotions.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).slice(0, 5) as SceneStudioDraft["moods"],
    preferredGenres: scene.genres.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12),
    energy,
    familiarityLevel,
    arc,
    allowExplicit: scene.allowExplicit === true,
    notes: scene.songRequest || scene.avoid || "",
  };
}

export async function recordStoredSceneRecommendationFeedback(input: {
  scope: SceneStudioScope;
  currentScope: () => SceneStudioScope | null;
  scene: StoredScene;
  action: SceneRecommendationAction;
  trackIds?: readonly string[];
  reasons?: readonly unknown[];
  artistIds?: readonly unknown[];
  genres?: readonly unknown[];
  explicit?: boolean;
}): Promise<SceneRecommendationFeedbackWriteResult[]> {
  const draft = sceneRecommendationDraftFromStoredScene(input.scene);
  const trackIds = (input.trackIds ?? input.scene.tracks.map((track) => track.id))
    .map((trackId) => trackId.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (trackIds.length < 1) return [];
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return trackIds.map(() => ({
      outcome: "skipped",
      reason: "scope_changed_before_write",
      localStored: false,
      cloud: "skipped",
    }));
  }

  const events = trackIds.map((trackId) => createFeedbackEvent({
    scope: input.scope,
    draft,
    action: input.action,
    sceneId: input.scene.id,
    reasons: input.reasons,
    artistIds: input.artistIds,
    genres: input.genres,
    explicit: input.explicit,
  }, trackId));
  if (!await persistLocalAndPending(input.scope, events)) {
    return events.map(() => ({
      outcome: "failure",
      reason: "local_persistence_failed",
      localStored: false,
      cloud: "skipped",
    }));
  }
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return events.map((event) => ({
      outcome: "local_stored",
      reason: "scope_changed_after_local_write",
      localStored: true,
      cloud: "pending",
      eventId: event.id,
    }));
  }

  const flush = await flushPendingSceneRecommendationFeedback(input.scope, input.currentScope);
  const pendingIds = new Set((await readPending(input.scope).catch(() => events)).map((event) => event.id));
  return events.map((event) => {
    if (flush.outcome === "cloud_synced" && !pendingIds.has(event.id)) {
      return { ...flush, eventId: event.id };
    }
    return {
      outcome: "local_stored",
      reason: flush.outcome === "local_stored"
        ? flush.reason
        : "cloud_sync_failed",
      localStored: true,
      cloud: "pending",
      eventId: event.id,
    };
  });
}

/**
 * Durably enqueues stored-Scene feedback without putting cloud latency in a
 * playback or gesture critical path. Cloud delivery is coalesced per account
 * scope and retried in the background with bounded backoff.
 */
export async function enqueueStoredSceneRecommendationFeedback(input: {
  scope: SceneStudioScope;
  currentScope: () => SceneStudioScope | null;
  scene: StoredScene;
  action: SceneRecommendationAction;
  trackIds?: readonly string[];
  reasons?: readonly unknown[];
  artistIds?: readonly unknown[];
  genres?: readonly unknown[];
  explicit?: boolean;
  flushTiming?: SceneFeedbackFlushTiming;
}): Promise<SceneRecommendationFeedbackWriteResult[]> {
  const draft = sceneRecommendationDraftFromStoredScene(input.scene);
  const trackIds = (input.trackIds ?? input.scene.tracks.map((track) => track.id))
    .map((trackId) => trackId.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (trackIds.length < 1) return [];
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return trackIds.map(() => ({
      outcome: "skipped",
      reason: "scope_changed_before_write",
      localStored: false,
      cloud: "skipped",
    }));
  }

  const events = trackIds.map((trackId) => createFeedbackEvent({
    scope: input.scope,
    draft,
    action: input.action,
    sceneId: input.scene.id,
    reasons: input.reasons,
    artistIds: input.artistIds,
    genres: input.genres,
    explicit: input.explicit,
  }, trackId));
  if (!await persistLocalAndPending(input.scope, events)) {
    return events.map(() => ({
      outcome: "failure",
      reason: "local_persistence_failed",
      localStored: false,
      cloud: "skipped",
    }));
  }
  if (!sameSceneStudioScope(input.scope, input.currentScope())) {
    return events.map((event) => ({
      outcome: "local_stored",
      reason: "scope_changed_after_local_write",
      localStored: true,
      cloud: "pending",
      eventId: event.id,
    }));
  }

  if (isSupabaseConfigured) {
    scheduleSceneRecommendationFeedbackFlush(input.scope, input.currentScope, input.flushTiming);
  }
  return events.map((event) => ({
    outcome: "local_stored",
    reason: isSupabaseConfigured ? "cloud_sync_scheduled" : "cloud_not_configured",
    localStored: true,
    cloud: "pending",
    eventId: event.id,
  }));
}
