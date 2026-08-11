import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  buildSoundscapeArchive,
} from "./soundscape-aggregation";

import type {
  SoundscapeAggregationInput,
  SoundscapeArchive,
  SoundscapeCommonGroundProjection,
  SoundscapeCommonGroundState,
  SoundscapePeriod,
  SoundscapeRefreshState,
  SoundscapeShareProjection,
  SoundscapeShareVisibility,
} from "./soundscape-types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "@canal/soundscape/archive/v1";

type SoundscapeArchiveRow = {
  id: string;
  user_id: string;
  period_kind: string;
  period_key: string;
  period_starts_at: string;
  period_ends_at: string;
  version: number;
  history_state: string;
  insufficient_reason: string | null;
  schema_version: number;
  generated_at: string;
  refreshed_at: string;
  visibility: string;
  content: unknown;
  share_projection: unknown;
};

type CommonGroundStateRow = {
  mutual_connection: boolean;
  approved_by_account: boolean;
  approved_by_peer: boolean;
};

type CacheEnvelope = {
  cachedAt: string;
  archive: SoundscapeArchive;
};

function cacheKey(
  userId: string,
  period: SoundscapePeriod,
): string {
  return `${CACHE_PREFIX}/${userId}/${period.kind}/${period.key}`;
}

function validIdentity(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f/]/u.test(normalized)) {
    throw new Error("A valid Soundscape account identifier is required.");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function assertCurrentAccount(
  expectedUserId: string,
): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user || user.id !== expectedUserId) {
    throw Object.assign(
      new Error("The Canal account changed while Soundscape data was loading."),
      { code: "CANAL_SOUNDSCAPE_ACCOUNT_CHANGED" },
    );
  }
}

function archiveFromRow(row: SoundscapeArchiveRow): SoundscapeArchive {
  if (
    row.schema_version !== 1 ||
    !isRecord(row.content) ||
    !isRecord(row.share_projection)
  ) {
    throw new Error("This Soundscape archive uses unsupported or invalid data.");
  }
  return {
    schemaVersion: 1,
    archiveId: row.id,
    accountId: row.user_id,
    period: {
      kind: row.period_kind === "season" ? "season" : "year",
      key: row.period_key,
      startsAt: row.period_starts_at,
      endsAt: row.period_ends_at,
    },
    version: row.version,
    historyState: row.history_state === "ready" ? "ready" : "insufficient_history",
    insufficientReason: row.insufficient_reason,
    generatedAt: row.generated_at,
    refreshedAt: row.refreshed_at,
    visibility: row.visibility === "public"
      ? "public"
      : row.visibility === "connections"
        ? "connections"
        : "private",
    content: row.content as SoundscapeArchive["content"],
    shareProjection: row.share_projection as SoundscapeArchive["shareProjection"],
  };
}

async function readCachedArchive(
  expectedUserId: string,
  period: SoundscapePeriod,
): Promise<SoundscapeArchive | null> {
  const raw = await AsyncStorage.getItem(cacheKey(expectedUserId, period));
  await assertCurrentAccount(expectedUserId);
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (
      !envelope.archive ||
      envelope.archive.accountId !== expectedUserId ||
      envelope.archive.period.kind !== period.kind ||
      envelope.archive.period.key !== period.key ||
      !envelope.cachedAt ||
      Date.now() - Date.parse(envelope.cachedAt) > CACHE_TTL_MS
    ) {
      return null;
    }
    return envelope.archive;
  } catch {
    return null;
  }
}

async function writeCachedArchive(
  expectedUserId: string,
  archive: SoundscapeArchive,
): Promise<void> {
  await assertCurrentAccount(expectedUserId);
  const key = cacheKey(expectedUserId, archive.period);
  await AsyncStorage.setItem(
    key,
    JSON.stringify({ cachedAt: new Date().toISOString(), archive } satisfies CacheEnvelope),
  );
  try {
    await assertCurrentAccount(expectedUserId);
  } catch (error) {
    await AsyncStorage.removeItem(key);
    throw error;
  }
}

async function writeRefreshState(
  expectedUserId: string,
  period: SoundscapePeriod,
  input: {
    status: SoundscapeRefreshState["status"];
    requestedAt: string | null;
    completedAt: string | null;
    lastArchiveVersion: number | null;
    errorCode: string | null;
  },
): Promise<void> {
  await assertCurrentAccount(expectedUserId);
  const { error } = await supabase.from("soundscape_refresh_state").upsert({
    user_id: expectedUserId,
    period_kind: period.kind,
    period_key: period.key,
    status: input.status,
    requested_at: input.requestedAt,
    completed_at: input.completedAt,
    last_archive_version: input.lastArchiveVersion,
    error_code: input.errorCode,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,period_kind,period_key" });
  await assertCurrentAccount(expectedUserId);
  if (error) throw error;
}

export async function loadSoundscapeArchive(
  expectedUserId: string,
  period: SoundscapePeriod,
): Promise<SoundscapeArchive | null> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  await assertCurrentAccount(userId);
  const cached = await readCachedArchive(userId, period);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("soundscape_archives")
    .select("id, user_id, period_kind, period_key, period_starts_at, period_ends_at, version, history_state, insufficient_reason, schema_version, generated_at, refreshed_at, visibility, content, share_projection")
    .eq("user_id", userId)
    .eq("period_kind", period.kind)
    .eq("period_key", period.key)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  await assertCurrentAccount(userId);
  if (error) throw error;
  if (!data) return null;
  const archive = archiveFromRow(data as SoundscapeArchiveRow);
  await writeCachedArchive(userId, archive);
  return archive;
}

export async function refreshSoundscapeArchive(
  expectedUserId: string,
  input: SoundscapeAggregationInput,
): Promise<SoundscapeArchive> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  if (input.accountId !== userId) {
    throw new Error("Soundscape input must belong to the signed-in account.");
  }
  await assertCurrentAccount(userId);
  const requestedAt = new Date().toISOString();
  await writeRefreshState(userId, input.period, {
    status: "refreshing",
    requestedAt,
    completedAt: null,
    lastArchiveVersion: null,
    errorCode: null,
  });

  try {
    const archive = buildSoundscapeArchive(input, 1);
    const { data, error } = await supabase.rpc("soundscape_insert_archive", {
      requested_period_kind: archive.period.kind,
      requested_period_key: archive.period.key,
      requested_period_starts_at: archive.period.startsAt,
      requested_period_ends_at: archive.period.endsAt,
      requested_history_state: archive.historyState,
      requested_insufficient_reason: archive.insufficientReason,
      requested_schema_version: archive.schemaVersion,
      requested_generated_at: archive.generatedAt,
      requested_content: archive.content,
      requested_share_projection: archive.shareProjection,
    });
    await assertCurrentAccount(userId);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as SoundscapeArchiveRow | null;
    if (!row) throw new Error("Soundscape refresh did not create an owned archive version.");
    const stored = archiveFromRow(row);
    await writeCachedArchive(userId, stored);
    await writeRefreshState(userId, input.period, {
      status: "ready",
      requestedAt,
      completedAt: new Date().toISOString(),
      lastArchiveVersion: stored.version,
      errorCode: null,
    });
    return stored;
  } catch (error) {
    await writeRefreshState(userId, input.period, {
      status: "failed",
      requestedAt,
      completedAt: new Date().toISOString(),
      lastArchiveVersion: null,
      errorCode: "refresh_failed",
    }).catch(() => undefined);
    throw error;
  }
}

export async function invalidateSoundscapeCache(
  expectedUserId: string,
): Promise<void> {
  const userId = validIdentity(expectedUserId);
  await assertCurrentAccount(userId);
  const keys = await AsyncStorage.getAllKeys();
  await assertCurrentAccount(userId);
  const ownedPrefix = `${CACHE_PREFIX}/${userId}/`;
  const ownedKeys = keys.filter((key) => key.startsWith(ownedPrefix)).slice(0, 100);
  if (ownedKeys.length > 0) await AsyncStorage.multiRemove(ownedKeys);
  await assertCurrentAccount(userId);
}

export async function setSoundscapeShareVisibility(
  expectedUserId: string,
  archiveId: string,
  visibility: SoundscapeShareVisibility,
): Promise<void> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  await assertCurrentAccount(userId);
  const { data, error } = await supabase
    .from("soundscape_archives")
    .update({ visibility })
    .eq("id", validIdentity(archiveId))
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  await assertCurrentAccount(userId);
  if (error) throw error;
  if (!data) throw new Error("The owned Soundscape archive no longer exists.");
  await invalidateSoundscapeCache(userId);
}

export async function setCommonGroundApproval(
  expectedUserId: string,
  peerUserId: string,
  approved: boolean,
): Promise<void> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  const peerId = validIdentity(peerUserId);
  if (userId === peerId) throw new Error("Common Ground requires another Canal account.");
  await assertCurrentAccount(userId);
  const { error } = await supabase.rpc("soundscape_set_common_ground_approval", {
    peer_user_id: peerId,
    approved,
  });
  await assertCurrentAccount(userId);
  if (error) throw error;
}

export async function loadCommonGroundState(
  expectedUserId: string,
  peerUserId: string,
): Promise<SoundscapeCommonGroundState> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  const peerId = validIdentity(peerUserId);
  await assertCurrentAccount(userId);
  const { data, error } = await supabase.rpc("soundscape_common_ground_state", {
    peer_user_id: peerId,
  });
  await assertCurrentAccount(userId);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as CommonGroundStateRow | null;
  const mutualConnection = row?.mutual_connection === true;
  const approvedByAccount = row?.approved_by_account === true;
  const approvedByPeer = row?.approved_by_peer === true;
  const status = !mutualConnection
    ? "ineligible"
    : !approvedByAccount
      ? "awaiting_you"
      : !approvedByPeer
        ? "awaiting_peer"
        : "approved";
  return { accountId: userId, peerUserId: peerId, mutualConnection, approvedByAccount, approvedByPeer, status };
}

export async function loadCommonGroundProjection(
  expectedUserId: string,
  peerUserId: string,
  period: SoundscapePeriod,
): Promise<SoundscapeCommonGroundProjection> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  const peerId = validIdentity(peerUserId);
  await assertCurrentAccount(userId);
  const { data, error } = await supabase.rpc("soundscape_common_ground_projection", {
    peer_user_id: peerId,
    requested_period_kind: period.kind,
    requested_period_key: period.key,
  });
  await assertCurrentAccount(userId);
  if (error) throw error;
  if (!data || typeof data !== "object") {
    return { status: "ineligible", period, members: [] };
  }
  const projection = data as SoundscapeCommonGroundProjection;
  return projection.status === "approved"
    ? projection
    : { status: projection.status ?? "ineligible", period, members: [] };
}

export async function loadSoundscapeShareProjection(
  ownerUserId: string,
  period: SoundscapePeriod,
): Promise<SoundscapeShareProjection | null> {
  requireSupabaseConfiguration();
  const ownerId = validIdentity(ownerUserId);
  const { data, error } = await supabase.rpc("soundscape_share_projection", {
    owner_user_id: ownerId,
    requested_period_kind: period.kind,
    requested_period_key: period.key,
  });
  if (error) throw error;
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    !isRecord(data.period) ||
    data.period.kind !== period.kind ||
    data.period.key !== period.key
  ) {
    return null;
  }
  return data as SoundscapeShareProjection;
}

export async function loadSoundscapeRefreshState(
  expectedUserId: string,
  period: SoundscapePeriod,
): Promise<SoundscapeRefreshState> {
  requireSupabaseConfiguration();
  const userId = validIdentity(expectedUserId);
  await assertCurrentAccount(userId);
  const { data, error } = await supabase
    .from("soundscape_refresh_state")
    .select("status, requested_at, completed_at, last_archive_version, error_code")
    .eq("user_id", userId)
    .eq("period_kind", period.kind)
    .eq("period_key", period.key)
    .maybeSingle();
  await assertCurrentAccount(userId);
  if (error) throw error;
  const row = data as null | {
    status?: SoundscapeRefreshState["status"];
    requested_at?: string | null;
    completed_at?: string | null;
    last_archive_version?: number | null;
    error_code?: string | null;
  };
  return {
    accountId: userId,
    period,
    status: row?.status ?? "idle",
    requestedAt: row?.requested_at ?? null,
    completedAt: row?.completed_at ?? null,
    lastArchiveVersion: row?.last_archive_version ?? null,
    errorCode: row?.error_code ?? null,
  };
}
