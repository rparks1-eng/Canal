import type { SceneStudioDraft } from "./scene-studio";
import type { SceneStudioScope } from "./scene-studio-scope";
import { sameSceneStudioScope } from "./scene-studio-scope";
import type { CanalSongDna, SongSceneMoodEvidence } from "./song-dna";
import type { SongSceneActionInput } from "./song-scene-actions";
import { readAccountCanalSettings } from "./app-settings";
import { isSupabaseConfigured, requireSupabaseConfiguration, supabase } from "./supabase";

type PreferenceRow = {
  user_id: string;
  track_id: string;
  liked: boolean;
  genre_labels: unknown;
  mood_labels: unknown;
  disliked_until?: unknown;
};

function labels(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 4)
    : [];
}

function taxonomyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

async function assertScope(scope: SceneStudioScope, currentScope: () => SceneStudioScope | null): Promise<void> {
  if (!sameSceneStudioScope(scope, currentScope())) throw new Error("The active Canal account changed.");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (user?.id !== scope.userId || !sameSceneStudioScope(scope, currentScope())) {
    throw new Error("The active Canal account changed.");
  }
}

export async function readSongLiked(
  trackId: string,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  await assertScope(scope, currentScope);
  const { data, error } = await supabase
    .from("user_song_preferences")
    .select("liked")
    .eq("user_id", scope.userId)
    .eq("track_id", trackId)
    .maybeSingle();
  if (error) throw error;
  await assertScope(scope, currentScope);
  return data?.liked === true;
}

export async function persistSongDna(
  song: SongSceneActionInput,
  dna: CanalSongDna,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await assertScope(scope, currentScope);
  const now = new Date().toISOString();
  const { error } = await supabase.from("user_song_dna").upsert({
    user_id: scope.userId,
    track_id: song.trackId,
    track_title: song.title,
    track_artist: song.artist,
    genre_labels: [...dna.genres],
    mood_labels: [...dna.moods],
    confidence: dna.confidence,
    signal_sources: [...dna.sources],
    taxonomy_version: dna.taxonomyVersion,
    classified_at: now,
    updated_at: now,
  }, { onConflict: "user_id,track_id" });
  if (error) throw error;
  await assertScope(scope, currentScope);
}

export async function readSongSceneMoodEvidence(
  trackId: string,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<SongSceneMoodEvidence[]> {
  if (!isSupabaseConfigured) return [];
  try {
    await assertScope(scope, currentScope);
    const { data, error } = await supabase.rpc("get_song_scene_mood_evidence", { track_id_value: trackId });
    if (error) throw error;
    await assertScope(scope, currentScope);
    return (Array.isArray(data) ? data : []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const value = row as Record<string, unknown>;
      const label = typeof value.mood_label === "string" ? value.mood_label.trim().slice(0, 80) : "";
      const personalCount = Number(value.personal_count);
      const communityCount = Number(value.community_count);
      if (!label || !Number.isSafeInteger(personalCount) || !Number.isSafeInteger(communityCount)) return [];
      return [{ label, personalCount: Math.max(0, Math.min(20, personalCount)), communityCount: Math.max(0, Math.min(100, communityCount)) }];
    }).slice(0, 12);
  } catch {
    return [];
  }
}

export async function readSongDisliked(
  trackId: string,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  await assertScope(scope, currentScope);
  const { data, error } = await supabase
    .from("user_song_preferences")
    .select("liked,disliked_until")
    .eq("user_id", scope.userId)
    .eq("track_id", trackId)
    .maybeSingle();
  if (error) throw error;
  await assertScope(scope, currentScope);
  return data?.liked === false && typeof data.disliked_until === "string" && Date.parse(data.disliked_until) > Date.now();
}

export async function setSongLiked(
  song: SongSceneActionInput,
  dna: CanalSongDna,
  liked: boolean,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<void> {
  requireSupabaseConfiguration();
  await assertScope(scope, currentScope);
  const operation = liked
    ? supabase.from("user_song_preferences").upsert({
        user_id: scope.userId,
        track_id: song.trackId,
        track_title: song.title,
        track_artist: song.artist,
        liked: true,
        disliked_until: null,
        genre_labels: [...dna.genres],
        mood_labels: [...dna.moods],
        taxonomy_version: dna.taxonomyVersion,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,track_id" })
    : supabase.from("user_song_preferences").delete()
        .eq("user_id", scope.userId)
        .eq("track_id", song.trackId);
  const { error } = await operation;
  if (error) throw error;
  await assertScope(scope, currentScope);
}

export async function setSongDisliked(
  song: SongSceneActionInput,
  dna: CanalSongDna,
  disliked: boolean,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<void> {
  requireSupabaseConfiguration();
  await assertScope(scope, currentScope);
  const accountSettings = await readAccountCanalSettings(scope.userId);
  await assertScope(scope, currentScope);
  const operation = disliked
    ? supabase.from("user_song_preferences").upsert({
        user_id: scope.userId,
        track_id: song.trackId,
        track_title: song.title,
        track_artist: song.artist,
        liked: false,
        disliked_until: new Date(Date.now() + accountSettings.dislikeWindowDays * 86_400_000).toISOString(),
        genre_labels: [...dna.genres],
        mood_labels: [...dna.moods],
        taxonomy_version: dna.taxonomyVersion,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,track_id" })
    : supabase.from("user_song_preferences").delete()
        .eq("user_id", scope.userId)
        .eq("track_id", song.trackId)
        .eq("liked", false);
  const { error } = await operation;
  if (error) throw error;
  await assertScope(scope, currentScope);
}

export async function readTemporarilyDislikedTrackIds(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    await assertScope(scope, currentScope);
    const { data, error } = await supabase
      .from("user_song_preferences")
      .select("user_id,track_id,liked,genre_labels,mood_labels,disliked_until")
      .eq("user_id", scope.userId)
      .eq("liked", false)
      .gt("disliked_until", new Date().toISOString())
      .order("disliked_until", { ascending: false })
      .limit(500);
    if (error) throw error;
    await assertScope(scope, currentScope);
    return ((data ?? []) as PreferenceRow[]).filter((row) => row.user_id === scope.userId && row.liked === false).map((row) => row.track_id).slice(0, 100);
  } catch {
    return [];
  }
}

export async function readRelevantLikedTrackIds(
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
  draft: SceneStudioDraft,
): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    await assertScope(scope, currentScope);
    const { data, error } = await supabase
      .from("user_song_preferences")
      .select("user_id,track_id,liked,genre_labels,mood_labels")
      .eq("user_id", scope.userId)
      .eq("liked", true)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    await assertScope(scope, currentScope);
    const desiredGenres = new Set(draft.preferredGenres.map(taxonomyKey).filter(Boolean));
    const desiredMoods = new Set(draft.moods.map(taxonomyKey).filter(Boolean));
    return ((data ?? []) as PreferenceRow[])
      .filter((row) => {
        if (row.user_id !== scope.userId || !row.liked) return false;
        const rowGenres = labels(row.genre_labels).map(taxonomyKey);
        const rowMoods = labels(row.mood_labels).map(taxonomyKey);
        const noIntentLabels = desiredGenres.size === 0 && desiredMoods.size === 0;
        return noIntentLabels || rowGenres.some((item) => desiredGenres.has(item)) || rowMoods.some((item) => desiredMoods.has(item));
      })
      .map((row) => row.track_id)
      .slice(0, 100);
  } catch {
    return [];
  }
}
