import type {
  Snapshot,
} from "./snapshots";

import {
  isSupabaseConfigured,
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  canonicalSpotifyTrackUrl,
} from "./spotify-track-links";

import {
  isSnapshotTemplateTheme,
} from "./snapshot-templates";

import type {
  SnapshotTemplateTheme,
} from "./snapshot-templates";

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
  template_id: string | null;
  template_brand_label: string | null;
  template_theme: string | null;
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
  "template_id",
  "template_brand_label",
  "template_theme",
  "created_at",
  "updated_at",
].join(", ");

const SNAPSHOT_ACCOUNT_CHANGED_ERROR_NAME =
  "SnapshotAccountChangedError";

class SnapshotAccountChangedError extends Error {
  constructor() {
    super(
      "The active Snapshot account changed while Canal was working. Try again for the current account.",
    );

    this.name =
      SNAPSHOT_ACCOUNT_CHANGED_ERROR_NAME;
  }
}

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

export async function listOwnCloudSnapshots(
  expectedUserId: string,
): Promise<{
  userId: string;
  snapshots: Snapshot[];
}> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

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
        expectedUserId,
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  if (error) {
    throw new Error(
      `Canal could not load cloud Snapshots: ${error.message}`,
    );
  }

  return {
    userId:
      expectedUserId,

    snapshots:
      (
        (data ?? []) as unknown as SnapshotRow[]
      )
        .map((row) =>
          snapshotFromRow(
            row,
            expectedUserId,
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
  expectedUserId: string,
): Promise<Snapshot | null> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

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

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  if (error) {
    throw new Error(
      `Canal could not load this cloud Snapshot: ${error.message}`,
    );
  }

  return data
    ? snapshotFromRow(
        data as unknown as SnapshotRow,
        expectedUserId,
      )
    : null;
}

export async function upsertCloudSnapshot(
  snapshot: Snapshot,
  expectedUserId: string,
): Promise<Snapshot> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  if (
    snapshot.ownerId &&
    snapshot.ownerId !==
      expectedUserId
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
            expectedUserId,

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

          template_id:
            snapshot.templateId ??
            null,

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

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  if (error) {
    throw new Error(
      `Canal could not sync this Snapshot: ${error.message}`,
    );
  }

  const syncedSnapshot =
    snapshotFromRow(
      data as unknown as SnapshotRow,
      expectedUserId,
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
  expectedUserId: string,
): Promise<void> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

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
        expectedUserId,
      );

  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  if (error) {
    throw new Error(
      `Canal could not delete this cloud Snapshot: ${error.message}`,
    );
  }
}

async function assertExpectedSnapshotUser(
  expectedUserId: string,
): Promise<void> {
  const actualUserId =
    await requireSnapshotUserId();

  if (
    actualUserId !==
    expectedUserId
  ) {
    throw new SnapshotAccountChangedError();
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

  const templateProvenance =
    templateProvenanceFromRow(
      row,
    );

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
      canonicalSpotifyTrackUrl(
        row.spotify_url,
      ) ??
      undefined,

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

    ...templateProvenance,

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

function templateProvenanceFromRow(
  row: SnapshotRow,
): {
  templateId?: string;
  templateBrandLabel?: string;
  templateTheme?: SnapshotTemplateTheme;
} {
  const templateId =
    cleanRequiredString(
      row.template_id,
    );

  const templateBrandLabel =
    cleanRequiredString(
      row.template_brand_label,
    );

  if (
    !UUID_PATTERN.test(
      templateId,
    ) ||
    !templateBrandLabel ||
    Array.from(
      templateBrandLabel,
    ).length >
      32 ||
    CONTROL_CHARACTER_PATTERN.test(
      templateBrandLabel,
    ) ||
    !isSnapshotTemplateTheme(
      row.template_theme,
    )
  ) {
    return {};
  }

  return {
    templateId,
    templateBrandLabel,
    templateTheme:
      row.template_theme,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;
