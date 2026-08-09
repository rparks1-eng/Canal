import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createSceneStudioDraft,
} from "./scene-studio";
import type { SceneStudioDraft } from "./scene-studio";
import type { StoredScene } from "./scenes";
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
  createdAt: string;
}>;

export type SceneRecommendationLearning = Readonly<{
  rejectedTrackIds: string[];
  deprioritizedTrackIds: string[];
  preferredTrackIds: string[];
}>;

const PREFIX = "@canal/scene-recommendation-feedback:v1";
const MAX_EVENTS = 1_000;
let lastEventTimeMs = 0;

function normalizedList(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

export function sceneRecommendationIntentKey(draft: Pick<
  SceneStudioDraft,
  "activity" | "moods" | "preferredGenres" | "energy" | "arc" | "allowExplicit"
>): string {
  return JSON.stringify({
    activity: draft.activity.trim().toLowerCase(),
    moods: normalizedList(draft.moods),
    genres: normalizedList(draft.preferredGenres),
    energy: draft.energy.trim().toLowerCase(),
    arc: draft.arc.trim().toLowerCase(),
    explicit: draft.allowExplicit,
  });
}

function storageKey(scope: SceneStudioScope): string {
  return `${PREFIX}:${sceneStudioScopeKey(scope)}`;
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

export async function recordSceneRecommendationFeedback(input: {
  scope: SceneStudioScope;
  currentScope: () => SceneStudioScope | null;
  draft: SceneStudioDraft;
  action: SceneRecommendationAction;
  trackId: string;
  sceneId?: string;
}): Promise<void> {
  const trackId = input.trackId.trim();
  if (!trackId || !sameSceneStudioScope(input.scope, input.currentScope())) return;

  const eventTimeMs = Math.max(Date.now(), lastEventTimeMs + 1);
  lastEventTimeMs = eventTimeMs;
  const event: SceneRecommendationFeedback = {
    id: `${eventTimeMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    userId: input.scope.userId,
    intentKey: sceneRecommendationIntentKey(input.draft),
    action: input.action,
    trackId,
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    createdAt: new Date(eventTimeMs).toISOString(),
  };
  const current = await readLocal(input.scope);
  if (!sameSceneStudioScope(input.scope, input.currentScope())) return;
  await AsyncStorage.setItem(storageKey(input.scope), JSON.stringify([...current, event].slice(-MAX_EVENTS)));

  if (!isSupabaseConfigured || !sameSceneStudioScope(input.scope, input.currentScope())) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id !== input.scope.userId || !sameSceneStudioScope(input.scope, input.currentScope())) return;
    const { error } = await supabase.from("scene_recommendation_feedback").upsert({
      id: event.id,
      user_id: event.userId,
      intent_key: event.intentKey,
      action: event.action,
      track_id: event.trackId,
      scene_id: event.sceneId ?? null,
      created_at: event.createdAt,
    }, { onConflict: "id" });
    if (error) console.warn("Canal saved recommendation feedback locally but cloud sync is pending:", error.message);
  } catch (error) {
    console.warn("Canal saved recommendation feedback locally but cloud sync is pending:", error);
  }
}

export async function readSceneRecommendationLearning(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  draft: SceneStudioDraft,
): Promise<SceneRecommendationLearning> {
  const intentKey = sceneRecommendationIntentKey(draft);
  let events = await readLocal(scope);
  if (!sameSceneStudioScope(scope, currentScope())) return { rejectedTrackIds: [], deprioritizedTrackIds: [], preferredTrackIds: [] };

  if (isSupabaseConfigured) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === scope.userId && sameSceneStudioScope(scope, currentScope())) {
        const { data } = await supabase
          .from("scene_recommendation_feedback")
          .select("id,user_id,intent_key,action,track_id,scene_id,created_at")
          .eq("user_id", scope.userId)
          .eq("intent_key", intentKey)
          .order("created_at", { ascending: false })
          .limit(500);
        const cloud = (data ?? []).map((row) => ({
          id: String(row.id), userId: String(row.user_id), intentKey: String(row.intent_key),
          action: row.action as SceneRecommendationAction, trackId: String(row.track_id),
          ...(row.scene_id ? { sceneId: String(row.scene_id) } : {}), createdAt: String(row.created_at),
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
    // `unfavorite` intentionally returns the track to a neutral state.
  }
  return { rejectedTrackIds: [...rejected], deprioritizedTrackIds: [...deprioritized], preferredTrackIds: [...preferred] };
}

export function sceneRecommendationDraftFromStoredScene(scene: StoredScene): SceneStudioDraft {
  const fallback = createSceneStudioDraft();
  const activity = ["focus", "workout", "commute", "unwind", "party", "sleep", "social", "explore"].includes(scene.activity)
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
}): Promise<void> {
  const draft = sceneRecommendationDraftFromStoredScene(input.scene);
  const trackIds = input.trackIds ?? input.scene.tracks.map((track) => track.id);
  for (const trackId of trackIds.slice(0, 100)) {
    await recordSceneRecommendationFeedback({
      scope: input.scope,
      currentScope: input.currentScope,
      draft,
      action: input.action,
      trackId,
      sceneId: input.scene.id,
    });
  }
}
