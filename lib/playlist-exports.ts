import type {
  StoredScene,
} from "./scenes";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type ScenePlaylistExportRow = {
  id: string;
  user_id: string;
  source_owner_id: string | null;
  source_scene_id: string;
  scene_name: string;
  spotify_playlist_id: string;
  spotify_playlist_url: string | null;
  track_count: number;
  created_at: string;
};

export type SpotifyPlaylistExportDetails = {
  playlistId: string;
  playlistUrl?: string | null;
  trackCount?: number;
  matchedCount?: number;
};

export type ScenePlaylistExportSource = {
  sourceOwnerId?: string | null;
  sourceSceneId?: string | null;
  account?:
    ScenePlaylistExportAccount;
};

export type ScenePlaylistExportAccount = {
  userId: string;
};

export type ScenePlaylistExport = {
  id: string;
  userId: string;
  sourceOwnerId: string | null;
  sourceSceneId: string;
  sceneName: string;
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string | null;
  trackCount: number;
  createdAt: string;
};

export type ReadScenePlaylistExportsOptions = {
  limit?: number;
  sourceOwnerId?: string;
  sourceSceneId?: string;
};

const PLAYLIST_EXPORT_COLUMNS = [
  "id",
  "user_id",
  "source_owner_id",
  "source_scene_id",
  "scene_name",
  "spotify_playlist_id",
  "spotify_playlist_url",
  "track_count",
  "created_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SPOTIFY_PLAYLIST_URL_PATTERN =
  /^https:\/\/open[.]spotify[.]com\/playlist\/[^/?#]+(?:[/?#].*)?$/;

export async function captureScenePlaylistExportAccount(): Promise<
  ScenePlaylistExportAccount
> {
  return {
    userId:
      await currentUserId(),
  };
}

export async function recordScenePlaylistExport(
  scene: StoredScene,
  spotify: SpotifyPlaylistExportDetails,
  source: ScenePlaylistExportSource = {},
): Promise<ScenePlaylistExport> {
  const userId =
    source.account
      ? requireUuid(
          source.account.userId,
          "playlist export account",
        )
      : await currentUserId();

  await assertCurrentUser(
    userId,
  );

  const sourceOwnerId =
    source.sourceOwnerId
      ? requireUuid(
          source.sourceOwnerId,
          "source owner",
        )
      : null;

  const sourceSceneId =
    requireText(
      source.sourceSceneId ??
      scene.id,
      "source Scene ID",
    );

  const sceneName =
    requireText(
      scene.name,
      "Scene name",
    ).slice(
      0,
      120,
    );

  const playlistId =
    requireText(
      spotify.playlistId,
      "Spotify playlist ID",
    );

  const playlistUrl =
    normalizeSpotifyPlaylistUrl(
      spotify.playlistUrl,
    );

  const trackCount =
    normalizeTrackCount(
      spotify.trackCount ??
      spotify.matchedCount ??
      scene.tracks.length,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "scene_playlist_exports",
      )
      .upsert(
        {
          user_id:
            userId,

          source_owner_id:
            sourceOwnerId,

          source_scene_id:
            sourceSceneId,

          scene_name:
            sceneName,

          spotify_playlist_id:
            playlistId,

          spotify_playlist_url:
            playlistUrl,

          track_count:
            trackCount,
        },
        {
          onConflict:
            "user_id,spotify_playlist_id",
        },
      )
      .select(
        PLAYLIST_EXPORT_COLUMNS,
      )
      .single();

  await assertCurrentUser(
    userId,
  );

  if (error) {
    throw new Error(
      `Canal could not save this playlist export: ${error.message}`,
    );
  }

  return normalizeExportRow(
    data as unknown as
      ScenePlaylistExportRow,
  );
}

export async function readScenePlaylistExports(
  options: ReadScenePlaylistExportsOptions = {},
): Promise<ScenePlaylistExport[]> {
  const userId =
    await currentUserId();

  let query =
    supabase
      .from(
        "scene_playlist_exports",
      )
      .select(
        PLAYLIST_EXPORT_COLUMNS,
      )
      .eq(
        "user_id",
        userId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        clampLimit(
          options.limit,
        ),
      );

  if (
    options.sourceOwnerId
  ) {
    query =
      query.eq(
        "source_owner_id",
        requireUuid(
          options.sourceOwnerId,
          "source owner",
        ),
      );
  }

  if (
    options.sourceSceneId
  ) {
    query =
      query.eq(
        "source_scene_id",
        requireText(
          options.sourceSceneId,
          "source Scene ID",
        ),
      );
  }

  const {
    data,
    error,
  } =
    await query;

  await assertCurrentUser(
    userId,
  );

  if (error) {
    throw new Error(
      `Canal could not load your playlist exports: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as unknown as
      ScenePlaylistExportRow[]
  ).map(
    normalizeExportRow,
  );
}

export async function deleteScenePlaylistExport(
  exportId: string,
): Promise<boolean> {
  const userId =
    await currentUserId();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "scene_playlist_exports",
      )
      .delete()
      .eq(
        "id",
        requireUuid(
          exportId,
          "playlist export",
        ),
      )
      .eq(
        "user_id",
        userId,
      )
      .select(
        "id",
      )
      .maybeSingle();

  await assertCurrentUser(
    userId,
  );

  if (error) {
    throw new Error(
      `Canal could not delete this playlist export: ${error.message}`,
    );
  }

  return Boolean(
    data,
  );
}

async function currentUserId(): Promise<string> {
  requireSupabaseConfiguration();

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(
      "You must be signed into Canal to manage playlist exports.",
    );
  }

  return user.id;
}

async function assertCurrentUser(
  expectedUserId: string,
): Promise<void> {
  const actualUserId =
    await currentUserId();

  if (
    actualUserId !==
    expectedUserId
  ) {
    throw new Error(
      "The signed-in Canal account changed while playlist export data was loading. Please try again.",
    );
  }
}

function normalizeExportRow(
  row: ScenePlaylistExportRow,
): ScenePlaylistExport {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    sourceOwnerId:
      row.source_owner_id,

    sourceSceneId:
      row.source_scene_id,

    sceneName:
      row.scene_name,

    spotifyPlaylistId:
      row.spotify_playlist_id,

    spotifyPlaylistUrl:
      row.spotify_playlist_url,

    trackCount:
      row.track_count,

    createdAt:
      row.created_at,
  };
}

function normalizeSpotifyPlaylistUrl(
  value: string | null | undefined,
): string | null {
  const normalized =
    value
      ?.trim() ||
    null;

  if (
    normalized &&
    !SPOTIFY_PLAYLIST_URL_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Spotify returned an invalid playlist URL.",
    );
  }

  return normalized;
}

function normalizeTrackCount(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    ) ||
    !Number.isInteger(
      value,
    ) ||
    value <
      1
  ) {
    throw new Error(
      "A playlist export must contain at least one track.",
    );
  }

  return value;
}

function clampLimit(
  value: number | undefined,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    )
  ) {
    return 50;
  }

  return Math.min(
    100,
    Math.max(
      1,
      Math.trunc(
        value,
      ),
    ),
  );
}

function requireText(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function requireUuid(
  value: string,
  label: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `A valid Canal ${label} ID is required.`,
    );
  }

  return normalized;
}
