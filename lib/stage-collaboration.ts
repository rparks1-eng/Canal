import type {
  StoredScene,
} from "./scenes";

import type {
  LiveStage,
  LiveStageTrack,
} from "./live-stages";

import {
  readLiveStage,
} from "./live-stages";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type StageContributionSource =
  | "existing_scene"
  | "fresh_scene"
  | "selected_music";

export type StageContributionPreferences = {
  activity: string;
  moods: string[];
  genres: string[];
  energy: string;
  familiarity: string;
  sceneArc: string;
  allowExplicit: boolean;
  notes: string;
};

export type StageContributionStatus = {
  userId: string;
  displayName: string;
  handle: string;
  sourceType: StageContributionSource | null;
  sceneName: string | null;
  ready: boolean;
  trackCount: number;
  sharesMusicContext: boolean;
  updatedAt: string | null;
};

type StageContributionStatusRow = {
  user_id: unknown;
  display_name: unknown;
  handle: unknown;
  source_type: unknown;
  scene_name: unknown;
  ready: unknown;
  track_count: unknown;
  shares_music_context: unknown;
  updated_at: unknown;
};

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function list(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,&/]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export function normalizeStageArtworkUrl(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url =
      new URL(value);
    const hostAllowed =
      url.hostname ===
        "i.scdn.co" ||
      url.hostname ===
        "image-cdn-ak.spotifycdn.com" ||
      url.hostname ===
        "image-cdn-fa.spotifycdn.com";

    if (
      url.protocol !== "https:" ||
      !hostAllowed ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^\/image\/[A-Za-z0-9]{16,128}$/u.test(
        url.pathname,
      )
    ) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function sceneTracks(scene: StoredScene): LiveStageTrack[] {
  return scene.tracks.slice(0, 100).map((track) => {
    const imageUrl =
      normalizeStageArtworkUrl(
        track.imageUrl,
      );

    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      source: track.source ?? "canal-scene",
      ...(track.spotifyUri ? { spotifyUri: track.spotifyUri } : {}),
      ...(track.spotifyUrl ? { spotifyUrl: track.spotifyUrl } : {}),
      ...(track.durationMs ? { durationMs: track.durationMs } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
  });
}

export function stagePreferencesFromScene(
  scene: StoredScene,
): StageContributionPreferences {
  return {
    activity: text(scene.activity).slice(0, 120),
    moods: list(text(scene.emotions)),
    genres: list(text(scene.genres)),
    energy: text(scene.energy).slice(0, 80),
    familiarity: text(scene.familiarity).slice(0, 80),
    sceneArc: text(scene.sceneArc).slice(0, 80),
    allowExplicit: scene.allowExplicit === true,
    notes: text(scene.songRequest || scene.avoid).slice(0, 300),
  };
}

async function currentUserId(): Promise<string> {
  requireSupabaseConfiguration();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new Error("Sign in to contribute to this Stage.");
  }

  return user.id;
}

async function assertSameUser(expectedUserId: string): Promise<void> {
  if (await currentUserId() !== expectedUserId) {
    throw new Error("Your Canal account changed. Reopen the Stage and try again.");
  }
}

export async function submitSceneToStage(
  stageId: string,
  scene: StoredScene,
  options: {
    sourceType?: StageContributionSource;
    sharesMusicContext?: boolean;
  } = {},
): Promise<void> {
  const userId = await currentUserId();
  const tracks = sceneTracks(scene);

  if (tracks.length < 1) {
    throw new Error("Choose a Scene with at least one track.");
  }

  const { error } = await supabase.rpc(
    "submit_live_stage_contribution",
    {
      stage_id_value: stageId,
      expected_user_id_value: userId,
      source_type_value: options.sourceType ?? "existing_scene",
      scene_id_value: scene.id,
      scene_name_value: scene.name,
      preferences_value: stagePreferencesFromScene(scene),
      tracks_value: tracks,
      shares_music_context_value: options.sharesMusicContext === true,
    },
  );

  await assertSameUser(userId);

  if (error) {
    throw new Error(error.message || "Canal could not submit this Stage contribution.");
  }
}

export async function readStageContributionStatuses(
  stageId: string,
): Promise<StageContributionStatus[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc(
    "list_live_stage_contribution_statuses",
    { stage_id_value: stageId },
  );

  await assertSameUser(userId);

  if (error) {
    throw new Error(error.message || "Canal could not load Stage contributions.");
  }

  return ((data ?? []) as StageContributionStatusRow[]).map((row) => {
    const source = text(row.source_type);
    return {
      userId: text(row.user_id),
      displayName: text(row.display_name) || "Canal Listener",
      handle: text(row.handle),
      sourceType:
        source === "existing_scene" || source === "fresh_scene" || source === "selected_music"
          ? source
          : null,
      sceneName: text(row.scene_name) || null,
      ready: row.ready === true,
      trackCount:
        typeof row.track_count === "number" && Number.isFinite(row.track_count)
          ? Math.max(0, Math.round(row.track_count))
          : 0,
      sharesMusicContext: row.shares_music_context === true,
      updatedAt: text(row.updated_at) || null,
    };
  });
}

export async function buildCollaborativeStageMix(
  stageId: string,
): Promise<LiveStage> {
  const userId = await currentUserId();
  const { error } = await supabase.rpc(
    "build_collaborative_stage_mix",
    {
      stage_id_value: stageId,
      expected_host_id_value: userId,
    },
  );

  await assertSameUser(userId);

  if (error) {
    throw new Error(error.message || "Canal could not build this collaborative mix.");
  }

  const stage = await readLiveStage(stageId);
  if (!stage) {
    throw new Error("This Stage is no longer available.");
  }

  return stage;
}
