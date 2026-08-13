import type {
  Snapshot,
} from "./snapshots";

import {
  File,
} from "expo-file-system";

import {
  isSupabaseConfigured,
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  canonicalSpotifyTrackUrl,
} from "./spotify-track-links";
import {
  addSpotifyArtworkToSnapshot,
  addSpotifyArtworkToSnapshots,
} from "./spotify-scene-artwork";

import {
  isSnapshotTemplateTheme,
} from "./snapshot-templates";
import { normalizeSceneTrackGenreEvidence } from "./scenes";

import type {
  SnapshotTemplateTheme,
} from "./snapshot-templates";

type SnapshotRow = {
  id: string;
  user_id: string;
  scene_id: string;
  scene_name: string;
  scene_activity: string | null;
  track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  track_image_url: string | null;
  spotify_url: string | null;
  provider_id: string | null;
  provider_track_id: string | null;
  provider_url: string | null;
  genre_evidence: unknown;
  track_explicit: boolean | null;
  media_path: string | null;
  media_type: string | null;
  media_mime_type: string | null;
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
  "scene_activity",
  "track_id",
  "track_title",
  "track_artist",
  "track_image_url",
  "spotify_url",
  "provider_id",
  "provider_track_id",
  "provider_url",
  "genre_evidence",
  "track_explicit",
  "media_path",
  "media_type",
  "media_mime_type",
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

    snapshots: await addSpotifyArtworkToSnapshots(await Promise.all(
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
        ).map((snapshot) => hydrateSnapshotMedia(snapshot, expectedUserId)),
    )),
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

  const snapshot = data
    ? snapshotFromRow(
        data as unknown as SnapshotRow,
        expectedUserId,
      )
    : null;

  return snapshot
    ? addSpotifyArtworkToSnapshot(
        await hydrateSnapshotMedia(snapshot, expectedUserId),
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

  const snapshotWithArtwork = await addSpotifyArtworkToSnapshot(snapshot);

  const media = await uploadSnapshotMediaIfNeeded(
    snapshotWithArtwork,
    expectedUserId,
  );

  const { data: existingMedia, error: existingMediaError } =
    await supabase
      .from("snapshots")
      .select("media_path, media_type, media_mime_type")
      .eq("id", snapshot.id)
      .eq("user_id", expectedUserId)
      .maybeSingle();

  await assertExpectedSnapshotUser(expectedUserId);

  if (existingMediaError) {
    throw new Error(
      `Canal could not preserve this Snapshot's media: ${existingMediaError.message}`,
    );
  }

  const preservedMedia = existingMedia as {
    media_path?: string | null;
    media_type?: string | null;
    media_mime_type?: string | null;
  } | null;

  const mediaPath =
    media.mediaPath ?? cleanOptionalString(preservedMedia?.media_path);
  const mediaType =
    media.mediaType ?? normalizeSnapshotMediaType(preservedMedia?.media_type);
  const mediaMimeType =
    media.mediaMimeType ?? cleanOptionalString(preservedMedia?.media_mime_type);

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

          scene_activity:
            snapshot.sceneActivity ??
            null,

          track_id:
            snapshot.trackId ??
            null,

          track_title:
            snapshot.trackTitle ??
            null,

          track_artist:
            snapshot.trackArtist ??
            null,

          track_image_url:
            snapshotWithArtwork.trackImageUrl ??
            null,

          spotify_url:
            snapshot.spotifyUrl ??
            null,

          provider_id:
            snapshot.providerId ??
            null,

          provider_track_id:
            snapshot.providerTrackId ??
            null,

          provider_url:
            snapshot.providerUrl ??
            null,

          genre_evidence:
            snapshot.genreEvidence ??
            null,

          track_explicit:
            snapshot.trackExplicit ??
            null,

          media_path: mediaPath ?? null,
          media_type: mediaType ?? null,
          media_mime_type: mediaMimeType ?? null,

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

          template_brand_label:
            snapshot.templateBrandLabel ??
            null,

          template_theme:
            snapshot.templateTheme ??
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

  return hydrateSnapshotMedia(syncedSnapshot, expectedUserId);
}

export async function deleteCloudSnapshot(
  snapshotId: string,
  expectedUserId: string,
): Promise<void> {
  await assertExpectedSnapshotUser(
    expectedUserId,
  );

  const { data: existing } = await supabase
    .from("snapshots")
    .select("media_path")
    .eq("id", snapshotId)
    .eq("user_id", expectedUserId)
    .maybeSingle();

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


  const mediaPath = cleanOptionalString(
    (existing as { media_path?: unknown } | null)?.media_path,
  );
  if (mediaPath) {
    await supabase.storage.from("snapshot-media").remove([mediaPath]);
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

    sceneActivity:
      cleanOptionalString(
        row.scene_activity,
      ),

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

    trackImageUrl:
      cleanOptionalString(
        row.track_image_url,
      ),

    spotifyUrl:
      canonicalSpotifyTrackUrl(
        row.spotify_url,
      ) ??
      undefined,

    providerId:
      row.provider_id === "spotify" ||
      row.provider_id === "apple-music"
        ? row.provider_id
        : undefined,

    providerTrackId:
      cleanOptionalString(
        row.provider_track_id,
      ),

    providerUrl:
      normalizeSnapshotProviderUrl(
        row.provider_id,
        row.provider_url,
      ),

    genreEvidence:
      normalizeSceneTrackGenreEvidence(
        row.genre_evidence,
      ),

    trackExplicit:
      typeof row.track_explicit === "boolean"
        ? row.track_explicit
        : undefined,

    mediaPath: cleanOptionalString(row.media_path),
    mediaType:
      row.media_type === "photo" || row.media_type === "video"
        ? row.media_type
        : undefined,
    mediaMimeType: cleanOptionalString(row.media_mime_type),

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

async function uploadSnapshotMediaIfNeeded(
  snapshot: Snapshot,
  expectedUserId: string,
): Promise<Pick<Snapshot, "mediaPath" | "mediaType" | "mediaMimeType">> {
  if (snapshot.mediaPath || !snapshot.mediaUri || !snapshot.mediaType) {
    return snapshot;
  }
  await assertExpectedSnapshotUser(expectedUserId);
  const uploadBody =
    await readSnapshotMediaUploadBody(
      snapshot.mediaUri,
    );
  const mimeType = snapshot.mediaMimeType ||
    (snapshot.mediaType === "photo" ? "image/jpeg" : "video/mp4");
  const extension = snapshot.mediaType === "photo" ? "jpg" : "mp4";
  const mediaPath = `${expectedUserId}/${snapshot.id}/capture.${extension}`;
  const { error } = await supabase.storage
    .from("snapshot-media")
    .upload(mediaPath, uploadBody, { contentType: mimeType, upsert: true });
  await assertExpectedSnapshotUser(expectedUserId);
  if (error) throw new Error(`Canal could not upload Snapshot media: ${error.message}`);
  return { mediaPath, mediaType: snapshot.mediaType, mediaMimeType: mimeType };
}

const MAX_SNAPSHOT_MEDIA_BYTES =
  100 * 1024 * 1024;

export async function readSnapshotMediaUploadBody(
  mediaUri: string,
): Promise<ArrayBuffer> {
  let uploadBody: ArrayBuffer;

  if (
    mediaUri.startsWith("file:") ||
    mediaUri.startsWith("content:")
  ) {
    const mediaFile =
      new File(mediaUri);

    if (!mediaFile.exists) {
      throw new Error(
        "Snapshot media is no longer available on this device.",
      );
    }

    if (
      typeof mediaFile.size === "number" &&
      mediaFile.size > MAX_SNAPSHOT_MEDIA_BYTES
    ) {
      throw new Error(
        "Snapshot media must be 100 MB or smaller.",
      );
    }

    uploadBody =
      await mediaFile.arrayBuffer();
  } else {
    const response =
      await fetch(mediaUri);

    if (!response.ok) {
      throw new Error(
        "Canal could not read the Snapshot media before upload.",
      );
    }

    uploadBody =
      await response.arrayBuffer();
  }

  if (uploadBody.byteLength === 0) {
    throw new Error(
      "Snapshot media is empty. Capture it again before publishing.",
    );
  }

  if (
    uploadBody.byteLength >
      MAX_SNAPSHOT_MEDIA_BYTES
  ) {
    throw new Error(
      "Snapshot media must be 100 MB or smaller.",
    );
  }

  return uploadBody;
}

async function hydrateSnapshotMedia(
  snapshot: Snapshot,
  expectedUserId: string,
): Promise<Snapshot> {
  if (!snapshot.mediaPath) return snapshot;
  await assertExpectedSnapshotUser(expectedUserId);
  const { data, error } = await supabase.storage
    .from("snapshot-media")
    .createSignedUrl(snapshot.mediaPath, 3600);
  await assertExpectedSnapshotUser(expectedUserId);
  return error || !data?.signedUrl
    ? snapshot
    : { ...snapshot, mediaUri: data.signedUrl };
}

function normalizeSnapshotMediaType(
  value: unknown,
): Snapshot["mediaType"] {
  return value === "photo" || value === "video"
    ? value
    : undefined;
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

function normalizeSnapshotProviderUrl(
  providerId: unknown,
  value: unknown,
): string | undefined {
  if (
    (providerId !== "spotify" &&
      providerId !== "apple-music") ||
    typeof value !== "string" ||
    value.length > 2_048
  ) {
    return undefined;
  }

  if (providerId === "spotify") {
    return canonicalSpotifyTrackUrl(value) ??
      undefined;
  }

  try {
    const url = new URL(value);
    const host =
      url.hostname.toLowerCase();

    return url.protocol === "https:" &&
      (
        host === "music.apple.com" ||
        host === "geo.music.apple.com"
      ) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
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

  const hasStoredTemplate =
    UUID_PATTERN.test(
      templateId,
    );
  const hasBuiltInStyle =
    !templateId &&
    templateBrandLabel.toLowerCase() === "canal";

  if (
    (!hasStoredTemplate && !hasBuiltInStyle) ||
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
    templateId:
      hasStoredTemplate
        ? templateId
        : undefined,
    templateBrandLabel,
    templateTheme:
      row.template_theme,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f]/;
