import type {
  Snapshot,
} from "./snapshots";

import {
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

export type PublicSnapshotCreator = {
  id: string;
  displayName: string;
  handle: string;
  isVerified: boolean;
  isCanal: boolean;
};

export type PublicCanalSnapshot =
  Snapshot & {
    ownerId: string;
    isMine: boolean;
    pendingCloudSync: false;
    creator: PublicSnapshotCreator;
  };

export type PublicSnapshotRow = {
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

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string | null;
  is_verified: boolean | null;
  is_canal: boolean | null;
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

const PROFILE_COLUMNS =
  "id, display_name, handle, is_verified, is_canal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;

export async function loadPublicSnapshotFeed(
  limit = 100,
): Promise<PublicCanalSnapshot[]> {
  return loadPublicSnapshots({
    limit,
  });
}

export async function loadPublicProfileSnapshots(
  ownerId: string,
): Promise<PublicCanalSnapshot[]> {
  const normalizedOwnerId =
    ownerId.trim();

  if (!normalizedOwnerId) {
    return [];
  }

  return loadPublicSnapshots({
    ownerId:
      normalizedOwnerId,
    limit: 100,
  });
}

async function loadPublicSnapshots(
  options: {
    ownerId?: string;
    limit: number;
  },
): Promise<PublicCanalSnapshot[]> {
  requireSupabaseConfiguration();

  const viewerId =
    await currentPublicSnapshotViewerId();

  let query =
    supabase
      .from(
        "snapshots",
      )
      .select(
        SNAPSHOT_COLUMNS,
      )
      .eq(
        "visibility",
        "public",
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  if (options.ownerId) {
    query =
      query.eq(
        "user_id",
        options.ownerId,
      );
  }

  const {
    data,
    error,
  } =
    await query.limit(
      Math.max(
        1,
        Math.min(
          100,
          Math.round(
            options.limit,
          ),
        ),
      ),
    );

  await assertPublicSnapshotViewer(
    viewerId,
  );

  if (error) {
    throw new Error(
      `Canal could not load public Snapshots: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as unknown as PublicSnapshotRow[];

  const creators =
    await loadCreators(
      rows.map(
        (row) =>
          row.user_id,
      ),
      viewerId,
    );

  await assertPublicSnapshotViewer(
    viewerId,
  );

  return normalizePublicSnapshotRows(
    rows.filter(
      (row) =>
        row.user_id ===
          viewerId ||
        creators.has(
          row.user_id,
        ),
    ),
    viewerId,
    creators,
  );
}

async function loadCreators(
  ownerIds: string[],
  expectedViewerId: string,
): Promise<
  Map<
    string,
    PublicSnapshotCreator
  >
> {
  const uniqueOwnerIds =
    Array.from(
      new Set(
        ownerIds.filter(
          Boolean,
        ),
      ),
    );

  const creators =
    new Map<
      string,
      PublicSnapshotCreator
    >();

  if (
    uniqueOwnerIds.length ===
    0
  ) {
    await assertPublicSnapshotViewer(
      expectedViewerId,
    );

    return creators;
  }

  await assertPublicSnapshotViewer(
    expectedViewerId,
  );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .select(
        PROFILE_COLUMNS,
      )
      .in(
        "id",
        uniqueOwnerIds,
      );

  await assertPublicSnapshotViewer(
    expectedViewerId,
  );

  if (error) {
    throw new Error(
      `Canal could not load Snapshot creators: ${error.message}`,
    );
  }

  for (
    const row of
      (
        data ??
        []
      ) as ProfileRow[]
  ) {
    creators.set(
      row.id,
      normalizeCreator(
        row,
        row.id,
      ),
    );
  }

  return creators;
}

async function currentPublicSnapshotViewerId(): Promise<string> {
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
      "Sign in to browse public Snapshots.",
    );
  }

  return user.id;
}

async function assertPublicSnapshotViewer(
  expectedViewerId: string,
): Promise<void> {
  const actualViewerId =
    await currentPublicSnapshotViewerId();

  if (
    actualViewerId !==
    expectedViewerId
  ) {
    throw new Error(
      "The signed-in Canal account changed while public Snapshots were loading. Please try again.",
    );
  }
}

export function normalizePublicSnapshotRows(
  rows: PublicSnapshotRow[],
  viewerId: string,
  creators:
    ReadonlyMap<
      string,
      PublicSnapshotCreator
    > =
      new Map(),
): PublicCanalSnapshot[] {
  return rows
    .map(
      (row) =>
        normalizePublicSnapshot(
          row,
          viewerId,
          creators.get(
            row.user_id,
          ),
        ),
    )
    .filter(
      (
        snapshot,
      ): snapshot is PublicCanalSnapshot =>
        snapshot !==
        null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        Date.parse(
          right.updatedAt,
        ) -
        Date.parse(
          left.updatedAt,
        ),
    );
}

function normalizePublicSnapshot(
  row: PublicSnapshotRow,
  viewerId: string,
  creator:
    PublicSnapshotCreator
    | undefined,
): PublicCanalSnapshot | null {
  const id =
    cleanRequiredString(
      row.id,
    );

  const ownerId =
    cleanRequiredString(
      row.user_id,
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
    row.visibility !==
      "public" ||
    !id ||
    !ownerId ||
    !sceneId ||
    !sceneName
  ) {
    return null;
  }

  const createdAt =
    cleanRequiredString(
      row.created_at,
    ) ||
      new Date(0).toISOString();

  const templateProvenance =
    templateProvenanceFromRow(
      row,
    );

  return {
    id,
    ownerId,
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
      "public",

    ...templateProvenance,

    createdAt,

    updatedAt:
      cleanRequiredString(
        row.updated_at,
      ) ||
      createdAt,

    isMine:
      ownerId ===
      viewerId,

    pendingCloudSync:
      false,

    creator:
      creator ??
      normalizeCreator(
        null,
        ownerId,
      ),
  };
}

function normalizeCreator(
  row: ProfileRow | null,
  ownerId: string,
): PublicSnapshotCreator {
  const displayName =
    cleanRequiredString(
      row?.display_name,
    ) ||
    "Canal Listener";

  const handle =
    cleanRequiredString(
      row?.handle,
    );

  return {
    id:
      ownerId,

    displayName,

    handle:
      handle
        ? `@${handle.replace(/^@+/, "")}`
        : "@canal_listener",

    isVerified:
      row?.is_verified ===
        true,

    isCanal:
      row?.is_canal ===
        true,
  };
}

function templateProvenanceFromRow(
  row: PublicSnapshotRow,
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
  return (
    cleanRequiredString(
      value,
    ) ||
    undefined
  );
}
