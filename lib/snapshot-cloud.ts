import type {
  Snapshot,
} from "./snapshots";

import {
  isSupabaseConfigured,
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type SnapshotRow = {
  id: string;
  user_id: string;
  scene_id: string;
  scene_name: string;
  track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  spotify_url: string | null;
  position_ms: number;
  note: string;
  mood: string | null;
  visibility:
    | "public"
    | "private";
  created_at: string;
  updated_at: string;
};

const SNAPSHOT_COLUMNS = [
  "id",
  "user_id",
  "scene_id",
  "scene_name",
  "track_id",
  "track_title",
  "track_artist",
  "spotify_url",
  "position_ms",
  "note",
  "mood",
  "visibility",
  "created_at",
  "updated_at",
].join(", ");

export async function getSnapshotSessionUserId(): Promise<
  string | null
> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const {
    data: {
      session,
    },
  } =
    await supabase.auth.getSession();

  return session?.user.id ?? null;
}

export async function listOwnCloudSnapshots(): Promise<{
  userId: string;
  snapshots: Snapshot[];
}> {
  const userId =
    await requireSnapshotUserId();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "snapshots",
      )
      .select(
        SNAPSHOT_COLUMNS,
      )
      .eq(
        "user_id",
        userId,
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Canal could not load cloud Snapshots: ${error.message}`,
    );
  }

  return {
    userId,

    snapshots:
      (
        (data ?? []) as unknown as SnapshotRow[]
      )
        .map((row) =>
          snapshotFromRow(
            row,
            userId,
          ),
        )
        .filter(
          (
            snapshot,
          ): snapshot is Snapshot =>
            snapshot !== null,
        ),
  };
}

export async function readCloudSnapshot(
  snapshotId: string,
): Promise<Snapshot | null> {
  const userId =
    await requireSnapshotUserId();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "snapshots",
      )
      .select(
        SNAPSHOT_COLUMNS,
      )
      .eq(
        "id",
        snapshotId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Canal could not load this cloud Snapshot: ${error.message}`,
    );
  }

  return data
    ? snapshotFromRow(
        data as unknown as SnapshotRow,
        userId,
      )
    : null;
}

export async function upsertCloudSnapshot(
  snapshot: Snapshot,
): Promise<Snapshot> {
  const userId =
    await requireSnapshotUserId();

  if (
    snapshot.ownerId &&
    snapshot.ownerId !==
      userId
  ) {
    throw new Error(
      "Canal will not save another listener's Snapshot.",
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "snapshots",
      )
      .upsert(
        {
          id:
            snapshot.id,

          user_id:
            userId,

          scene_id:
            snapshot.sceneId,

          scene_name:
            snapshot.sceneName,

          track_id:
            snapshot.trackId ??
            null,

          track_title:
            snapshot.trackTitle ??
            null,

          track_artist:
            snapshot.trackArtist ??
            null,

          spotify_url:
            snapshot.spotifyUrl ??
            null,

          position_ms:
            snapshot.positionMs,

          note:
            snapshot.note,

          mood:
            snapshot.mood ??
            null,

          visibility:
            snapshot.visibility,

          created_at:
            snapshot.createdAt,

          updated_at:
            snapshot.updatedAt,
        },
        {
          onConflict:
            "id",
        },
      )
      .select(
        SNAPSHOT_COLUMNS,
      )
      .single();

  if (error) {
    throw new Error(
      `Canal could not sync this Snapshot: ${error.message}`,
    );
  }

  const syncedSnapshot =
    snapshotFromRow(
      data as unknown as SnapshotRow,
      userId,
    );

  if (!syncedSnapshot) {
    throw new Error(
      "Supabase returned an invalid Snapshot.",
    );
  }

  return syncedSnapshot;
}

export async function deleteCloudSnapshot(
  snapshotId: string,
): Promise<void> {
  const userId =
    await requireSnapshotUserId();

  const {
    error,
  } =
    await supabase
      .from(
        "snapshots",
      )
      .delete()
      .eq(
        "id",
        snapshotId,
      )
      .eq(
        "user_id",
        userId,
      );

  if (error) {
    throw new Error(
      `Canal could not delete this cloud Snapshot: ${error.message}`,
    );
  }
}

async function requireSnapshotUserId(): Promise<string> {
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
      "You must be signed into Canal to sync Snapshots.",
    );
  }

  return user.id;
}

function snapshotFromRow(
  row: SnapshotRow,
  viewerId: string,
): Snapshot | null {
  const id =
    cleanRequiredString(
      row.id,
    );

  const sceneId =
    cleanRequiredString(
      row.scene_id,
    );

  const sceneName =
    cleanRequiredString(
      row.scene_name,
    );

  if (
    !id ||
    !sceneId ||
    !sceneName
  ) {
    return null;
  }

  return {
    id,
    sceneId,
    sceneName,

    trackId:
      cleanOptionalString(
        row.track_id,
      ),

    trackTitle:
      cleanOptionalString(
        row.track_title,
      ),

    trackArtist:
      cleanOptionalString(
        row.track_artist,
      ),

    spotifyUrl:
      cleanOptionalString(
        row.spotify_url,
      ),

    positionMs:
      typeof row.position_ms ===
        "number" &&
      Number.isFinite(
        row.position_ms,
      )
        ? Math.max(
            0,
            row.position_ms,
          )
        : 0,

    note:
      cleanRequiredString(
        row.note,
      ),

    mood:
      cleanOptionalString(
        row.mood,
      ),

    visibility:
      row.visibility ===
      "public"
        ? "public"
        : "private",

    createdAt:
      cleanRequiredString(
        row.created_at,
      ) ||
      new Date().toISOString(),

    updatedAt:
      cleanRequiredString(
        row.updated_at,
      ) ||
      cleanRequiredString(
        row.created_at,
      ) ||
      new Date().toISOString(),

    ownerId:
      row.user_id,

    isMine:
      row.user_id ===
      viewerId,

    pendingCloudSync:
      false,
  };
}

function cleanRequiredString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function cleanOptionalString(
  value: unknown,
): string | undefined {
  const cleaned =
    cleanRequiredString(
      value,
    );

  return cleaned ||
    undefined;
}
