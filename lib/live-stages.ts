import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  readLocalProfile,
} from "./canal-session";
import {
  isSupabaseConfigured,
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";
import { STORAGE_KEYS } from "./storage-keys";

export type LiveStageStatus =
  | "live"
  | "ended";

export type LiveStageVisibility =
  | "public"
  | "private";

export type LiveStageKind =
  | "community"
  | "verified"
  | "canal";

export type LiveStageRole =
  | "host"
  | "collaborator"
  | "listener";

export type LiveStageReportReason =
  | "spam"
  | "harassment"
  | "unsafe_content"
  | "other";

export type LiveStageMemberModerationAction =
  | "promote"
  | "demote"
  | "remove";

export type LiveStageTrack = {
  id: string;
  title: string;
  artist: string;
  source: string;
  spotifyUri?: string;
  spotifyUrl?: string;
  durationMs?: number;
  imageUrl?: string;
};

export type LiveStageParticipant = {
  userId?: string;
  username: string;
  displayName: string;
  initials: string;
  role: LiveStageRole;
  joinedAt?: string;
};

export type LiveStage = {
  id: string;
  code: string;
  stageCode: string;
  name: string;
  hostId?: string;
  hostUsername: string;
  hostName: string;
  stageKind: LiveStageKind;
  hostIsVerified: boolean;
  hostIsCanal: boolean;
  sceneId?: string;
  activity: string;
  atmosphereSignals?: string[];
  visibility: LiveStageVisibility;
  status: LiveStageStatus;
  participants: LiveStageParticipant[];
  participantCount: number;
  listenerCount: number;
  tracks: LiveStageTrack[];
  currentTrackIndex: number;
  membershipRole: LiveStageRole | null;
  startedAt?: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
};

export type CreateLiveStageInput = {
  name?: string;
  activity?: string;
  visibility?: LiveStageVisibility;
  sceneId?: string;
  hostUsername?: string;
  hostName?: string;
  participants?: LiveStageParticipant[];
  tracks?: LiveStageTrack[];
};

export type LiveStageMessage = {
  id: string;
  stageId: string;
  userId: string;
  username: string;
  displayName: string;
  initials: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  isMine: boolean;
  reactions: Record<LiveStageMessageReaction, number>;
  myReactions: LiveStageMessageReaction[];
  reactionUsers: Record<LiveStageMessageReaction, LiveStageReactionUser[]>;
};

export type LiveStageMessageReaction = string;

export type LiveStageReactionUser = {
  userId: string;
  displayName: string;
};

const EMOJI_REACTION_PATTERN = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|[#*0-9]\uFE0F?\u20E3)(?:[\u200D\uFE0F\uFE0E\p{Emoji_Modifier}\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Presentation}]*)$/u;

export function normalizeLiveStageMessageReaction(value: unknown): LiveStageMessageReaction | null {
  if (typeof value !== "string") return null;
  const reaction = value.trim();
  if (!reaction || Array.from(reaction).length > 16 || reaction.length > 32) return null;
  return EMOJI_REACTION_PATTERN.test(reaction) ? reaction : null;
}

export type LiveStageRoom = {
  stage: LiveStage | null;
  messages: LiveStageMessage[];
};

export type LiveStageSubscriptionStatus =
  | "connecting"
  | "connected"
  | "error";

export type LiveStageRow = {
  id: string;
  host_id: string;
  host_display_name: string;
  host_handle: string;
  stage_kind: string;
  host_is_verified: boolean;
  host_is_canal: boolean;
  scene_id: string | null;
  stage_code: string;
  name: string;
  activity: string;
  atmosphere_signals?: unknown;
  visibility: string;
  status: string;
  tracks: unknown;
  current_track_index: number;
  started_at?: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

export type LiveStageMemberRow = {
  stage_id: string;
  user_id: string;
  display_name: string;
  handle: string;
  role: string;
  joined_at: string;
};

export type LiveStageMessageRow = {
  id: string;
  stage_id: string;
  user_id: string;
  display_name: string;
  handle: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
};

export const LIVE_STAGE_STORAGE_KEY =
  STORAGE_KEYS.liveStages;

const LIVE_STAGE_MESSAGE_STORAGE_KEY =
  `${STORAGE_KEYS.liveStages}:messages`;

const LOCAL_LIVE_STAGE_STORE_VERSION =
  1;

const MAX_LIVE_STAGE_TRACKS =
  100;

const MAX_LIVE_STAGE_MODERATION_REASON_CHARACTERS =
  240;

const MAX_LIVE_STAGE_MODERATION_REASON_BYTES =
  960;

const LIVE_STAGE_REPORT_REASONS:
  readonly LiveStageReportReason[] = [
    "spam",
    "harassment",
    "unsafe_content",
    "other",
  ];

const LIVE_STAGE_MEMBER_MODERATION_ACTIONS:
  readonly LiveStageMemberModerationAction[] = [
    "promote",
    "demote",
    "remove",
  ];

const MAX_TRACK_ID_CHARACTERS =
  128;

const MAX_TRACK_ID_BYTES =
  256;

const MAX_TRACK_TITLE_CHARACTERS =
  200;

const MAX_TRACK_TITLE_BYTES =
  800;

const MAX_TRACK_ARTIST_CHARACTERS =
  200;

const MAX_TRACK_ARTIST_BYTES =
  800;

const MAX_TRACK_SOURCE_CHARACTERS =
  40;

const MAX_TRACK_SOURCE_BYTES =
  160;

const MAX_SPOTIFY_URI_CHARACTERS =
  64;

const MAX_SPOTIFY_URI_BYTES =
  128;

const MAX_SPOTIFY_URL_CHARACTERS =
  96;

const MAX_SPOTIFY_URL_BYTES =
  192;

const MAX_TRACK_IMAGE_URL_CHARACTERS =
  1024;

const MAX_TRACK_IMAGE_URL_BYTES =
  2048;

const MAX_TRACK_DURATION_MS =
  86_400_000;

const SPOTIFY_TRACK_ID_PATTERN =
  /^[A-Za-z0-9]{22}$/;

const SPOTIFY_TRACK_URI_PATTERN =
  /^spotify:track:([A-Za-z0-9]{22})$/;

const SPOTIFY_TRACK_URL_PATTERN =
  /^https:\/\/open[.]spotify[.]com(\/track\/([A-Za-z0-9]{22}))$/i;

const SPOTIFY_IMAGE_URL_PATTERN =
  /^https:\/\/i[.]scdn[.]co(\/image\/[A-Za-z0-9]{16,128})$/i;

const LIVE_STAGE_COLUMNS =
  "id, host_id, host_display_name, host_handle, stage_kind, host_is_verified, host_is_canal, scene_id, stage_code, name, activity, atmosphere_signals, visibility, status, tracks, current_track_index, started_at, created_at, updated_at, ended_at";

const LIVE_STAGE_MEMBER_COLUMNS =
  "stage_id, user_id, display_name, handle, role, joined_at";

const LIVE_STAGE_MESSAGE_COLUMNS =
  "id, stage_id, user_id, display_name, handle, body, created_at, edited_at";

const DEFAULT_LIVE_STAGES: LiveStage[] = [
  {
    id: "local-stage-1",
    code: "248319",
    stageCode: "248319",
    name: "Friday Night Drive",
    hostId: "local-maya",
    hostUsername: "maya.wav",
    hostName: "Maya Thompson",
    stageKind: "community",
    hostIsVerified: false,
    hostIsCanal: false,
    activity: "Driving through the city",
    atmosphereSignals: ["night", "driving", "reflective"],
    visibility: "public",
    status: "live",
    participants: [
      {
        userId: "local-maya",
        username: "maya.wav",
        displayName: "Maya Thompson",
        initials: "MT",
        role: "host",
      },
      {
        userId: "local-nico",
        username: "nico.fm",
        displayName: "Nico Alvarez",
        initials: "NA",
        role: "collaborator",
      },
    ],
    participantCount: 2,
    listenerCount: 0,
    tracks: [
      {
        id: "live-1-track-1",
        title: "Snooze",
        artist: "SZA",
        source: "Spotify",
      },
      {
        id: "live-1-track-2",
        title: "Hush",
        artist: "The Marías",
        source: "Spotify",
      },
      {
        id: "live-1-track-3",
        title: "Pink + White",
        artist: "Frank Ocean",
        source: "Spotify",
      },
    ],
    currentTrackIndex: 0,
    membershipRole: null,
    startedAt: "2026-07-22T20:00:00.000Z",
    createdAt: "2026-07-22T20:00:00.000Z",
    updatedAt: "2026-07-22T20:00:00.000Z",
  },
];

const localSubscribers =
  new Map<
    string,
    Set<() => void>
  >();

type LocalLiveStageIdentity = {
  ownerId: string;
  username: string;
  displayName: string;
  initials: string;
};

type LocalLiveStageStore = {
  version: typeof LOCAL_LIVE_STAGE_STORE_VERSION;
  ownerId: string;
  stages: LiveStage[];
};

type LocalLiveStageMessageStore = {
  version: typeof LOCAL_LIVE_STAGE_STORE_VERSION;
  ownerId: string;
  messages: LiveStageMessage[];
};

const DEFAULT_LOCAL_IDENTITY:
  LocalLiveStageIdentity = {
    ownerId:
      "local-profile:canaluser",
    username:
      "canaluser",
    displayName:
      "Canal Listener",
    initials:
      "CL",
  };

let localMutationQueue:
  Promise<void> =
    Promise.resolve();

const pendingMutations =
  new Map<
    string,
    Promise<unknown>
  >();

export function normalizeLiveStageRows(
  stageRows: LiveStageRow[],
  memberRows: LiveStageMemberRow[],
  currentUserId: string | null,
): LiveStage[] {
  const membersByStage =
    new Map<
      string,
      LiveStageMemberRow[]
    >();

  for (const member of memberRows) {
    const existing =
      membersByStage.get(
        member.stage_id,
      ) ?? [];

    existing.push(member);
    membersByStage.set(
      member.stage_id,
      existing,
    );
  }

  return stageRows
    .map((row) => {
      const members =
        membersByStage.get(
          row.id,
        ) ?? [];

      const participants =
        members
          .map(
            memberRowToParticipant,
          )
          .sort(
            (
              first,
              second,
            ) =>
              rolePriority(
                first.role,
              ) -
                rolePriority(
                  second.role,
                ) ||
              timestamp(
                first.joinedAt,
              ) -
                timestamp(
                  second.joinedAt,
                ),
          );

      const membership =
        members.find(
          (member) =>
            member.user_id ===
            currentUserId,
        );

      const tracks =
        normalizeTracks(
          row.tracks,
        );

      return {
        id: row.id,
        code:
          normalizeStageCode(
            row.stage_code,
          ),
        stageCode:
          normalizeStageCode(
            row.stage_code,
          ),
        name:
          cleanText(
            row.name,
          ) ||
          "Untitled Stage",
        hostId:
          row.host_id,
        hostUsername:
          normalizeUsername(
            row.host_handle,
          ) ||
          "canal_listener",
        hostName:
          cleanText(
            row.host_display_name,
          ) ||
          "Canal Listener",
        stageKind:
          normalizeStageKind(
            row.stage_kind,
          ),
        hostIsVerified:
          row.host_is_verified ===
          true,
        hostIsCanal:
          row.host_is_canal ===
          true,
        sceneId:
          cleanText(
            row.scene_id,
          ) ||
          undefined,
        activity:
          cleanText(
            row.activity,
          ) ||
          "Listening together",
        atmosphereSignals: normalizeAtmosphereSignals(row.atmosphere_signals),
        visibility:
          row.visibility ===
          "private"
            ? "private"
            : "public",
        status:
          row.status ===
          "ended"
            ? "ended"
            : "live",
        participants,
        participantCount:
          participants.length,
        listenerCount:
          participants.filter(
            (participant) =>
              participant.role ===
              "listener",
          ).length,
        tracks,
        currentTrackIndex:
          safeTrackIndex(
            row.current_track_index,
            tracks.length,
          ),
        membershipRole:
          normalizeRole(
            membership?.role,
          ) ?? null,
        startedAt:
          validDate(
            row.started_at,
          ),
        createdAt:
          validDate(
            row.created_at,
          ),
        updatedAt:
          validDate(
            row.updated_at,
          ),
        endedAt:
          cleanText(
            row.ended_at,
          ) ||
          undefined,
      } satisfies LiveStage;
    })
    .sort(
      (first, second) =>
        timestamp(
          second.updatedAt,
        ) -
        timestamp(
          first.updatedAt,
        ),
    );
}

export function normalizeLiveStageMessageRows(
  rows: LiveStageMessageRow[],
  currentUserId: string | null,
): LiveStageMessage[] {
  return rows
    .map((row) => {
      const displayName =
        cleanText(
          row.display_name,
        ) ||
        "Canal Listener";

      return {
        id: row.id,
        stageId:
          row.stage_id,
        userId:
          row.user_id,
        username:
          normalizeUsername(
            row.handle,
          ) ||
          "canal_listener",
        displayName,
        initials:
          getInitials(
            displayName,
          ),
        body:
          cleanText(
            row.body,
          ),
        createdAt:
          validDate(
            row.created_at,
          ),
        editedAt: cleanText(row.edited_at) || undefined,
        isMine:
          currentUserId ===
          row.user_id,
        reactions: {},
        myReactions: [],
        reactionUsers: {},
      };
    })
    .filter(
      (message) =>
        Boolean(
          message.id &&
          message.stageId &&
          message.body,
        ),
    )
    .sort(
      (first, second) =>
        timestamp(
          first.createdAt,
        ) -
        timestamp(
          second.createdAt,
        ),
    );
}

export async function readLiveStages(): Promise<
  LiveStage[]
> {
  if (!isSupabaseConfigured) {
    return readLocalLiveStages();
  }

  const currentUserId =
    await getCurrentUserId();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "live_stages",
      )
      .select(
        LIVE_STAGE_COLUMNS,
      )
      .eq(
        "status",
        "live",
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      )
      .limit(100);

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  if (error) {
    throw stageError(
      "load live Stages",
      error.message,
    );
  }

  const rows =
    (data ??
      []) as unknown as
      LiveStageRow[];

  const members =
    await readCloudMembers(
      rows.map(
        (row) => row.id,
      ),
    );

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  return normalizeLiveStageRows(
    rows,
    members,
    currentUserId,
  );
}

export async function readHostedLiveStages(): Promise<LiveStage[]> {
  if (!isSupabaseConfigured) {
    const identity = await resolveLocalIdentity();
    const stages = await readLocalLiveStagesForIdentity(identity);
    return stages.filter((stage) => stage.hostId === identity.ownerId);
  }

  const currentUserId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("live_stages")
    .select(LIVE_STAGE_COLUMNS)
    .eq("host_id", currentUserId)
    .order("started_at", { ascending: false })
    .limit(100);

  await assertCurrentLiveStageUser(currentUserId);

  if (error) {
    throw stageError("load your hosted Stages", error.message);
  }

  const rows = (data ?? []) as unknown as LiveStageRow[];
  const members = await readCloudMembers(rows.map((row) => row.id));
  await assertCurrentLiveStageUser(currentUserId);

  return normalizeLiveStageRows(rows, members, currentUserId);
}

export function formatLiveStageElapsed(
  stage: Pick<LiveStage, "createdAt" | "endedAt" | "startedAt" | "status">,
  nowMs = Date.now(),
): string {
  const startedMs = new Date(stage.startedAt ?? stage.createdAt).getTime();
  const endedMs = stage.status === "ended" && stage.endedAt
    ? new Date(stage.endedAt).getTime()
    : nowMs;
  const elapsedMinutes = Math.max(0, Math.floor((endedMs - startedMs) / 60_000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export async function readLiveStage(
  stageIdOrCode: string,
): Promise<LiveStage | null> {
  if (!isSupabaseConfigured) {
    const stages =
      await readLocalLiveStages();

    return findLocalLiveStage(
      stages,
      stageIdOrCode,
    );
  }

  const identifier =
    stageIdOrCode.trim();

  let query =
    supabase
      .from(
        "live_stages",
      )
      .select(
        LIVE_STAGE_COLUMNS,
      );

  if (isUuid(identifier)) {
    query =
      query.eq(
        "id",
        identifier,
      );
  } else if (
    /^\d{6}$/.test(
      identifier,
    )
  ) {
    query =
      query.eq(
        "stage_code",
        identifier,
      );
  } else {
    return null;
  }

  const currentUserId =
    await getCurrentUserId();

  const {
    data,
    error,
  } =
    await query.maybeSingle();

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  if (error) {
    throw stageError(
      "load this Stage",
      error.message,
    );
  }

  if (!data) {
    return null;
  }

  const members =
    await readCloudMembers([
      (
        data as unknown as
          LiveStageRow
      ).id,
    ]);

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  return (
    normalizeLiveStageRows(
      [
        data as unknown as
          LiveStageRow,
      ],
      members,
      currentUserId,
    )[0] ?? null
  );
}

export async function getLiveStage(
  stageIdOrCode: string,
): Promise<LiveStage | null> {
  return readLiveStage(
    stageIdOrCode,
  );
}

export async function readLiveStageMessages(
  stageId: string,
): Promise<LiveStageMessage[]> {
  if (!isSupabaseConfigured) {
    return readLocalMessages(
      stageId,
    );
  }

  const currentUserId =
    await getCurrentUserId();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "live_stage_messages",
      )
      .select(
        LIVE_STAGE_MESSAGE_COLUMNS,
      )
      .eq(
        "stage_id",
        stageId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .order(
        "id",
        {
          ascending:
            false,
        },
      )
      .limit(100);

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  if (error) {
    throw stageError(
      "load Stage chat",
      error.message,
    );
  }

  const messages = normalizeLiveStageMessageRows(
    (
      (data ??
        []) as unknown as
        LiveStageMessageRow[]
    ).reverse(),
    currentUserId,
  );
  if (messages.length === 0) return messages;
  const { data: reactionRows, error: reactionError } = await supabase
    .from("live_stage_message_reactions")
    .select("message_id, user_id, reaction")
    .in("message_id", messages.map((message) => message.id));
  await assertCurrentLiveStageUser(currentUserId);
  if (reactionError) throw stageError("load Stage chat reactions", reactionError.message);
  const byId = new Map(messages.map((message) => [message.id, message]));
  const normalizedReactionRows = (reactionRows ?? []).flatMap((row) => {
    const candidate = row as { message_id: string; user_id: string; reaction: string };
    const reaction = normalizeLiveStageMessageReaction(candidate.reaction);
    return reaction ? [{ ...candidate, reaction }] : [];
  });
  const reactionUserIds = Array.from(new Set(normalizedReactionRows.map((row) => row.user_id)));
  const reactionDisplayNames = new Map<string, string>();
  if (reactionUserIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, handle")
      .in("id", reactionUserIds);
    await assertCurrentLiveStageUser(currentUserId);
    if (profileError) throw stageError("load Stage reaction members", profileError.message);
    for (const profile of (profileRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]) {
      reactionDisplayNames.set(profile.id, profile.display_name?.trim() || profile.handle?.trim() || "Canal listener");
    }
  }
  for (const row of normalizedReactionRows) {
    const message = byId.get(row.message_id);
    if (!message) continue;
    message.reactions[row.reaction] = (message.reactions[row.reaction] ?? 0) + 1;
    message.reactionUsers[row.reaction] = [
      ...(message.reactionUsers[row.reaction] ?? []),
      { userId: row.user_id, displayName: reactionDisplayNames.get(row.user_id) ?? "Canal listener" },
    ];
    if (row.user_id === currentUserId) message.myReactions.push(row.reaction);
  }
  return messages;
}

export async function editLiveStageMessage(messageId: string, body: string): Promise<void> {
  const userId = await getCurrentUserId();
  const normalized = body.trim().slice(0, 500);
  if (!normalized) throw new Error("A Stage message cannot be empty.");
  const { error } = await supabase.from("live_stage_messages").update({ body: normalized }).eq("id", messageId).eq("user_id", userId);
  await assertCurrentLiveStageUser(userId);
  if (error) throw stageError("edit this Stage message", error.message);
}

export async function deleteLiveStageMessage(messageId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("live_stage_messages").delete().eq("id", messageId).eq("user_id", userId);
  await assertCurrentLiveStageUser(userId);
  if (error) throw stageError("delete this Stage message", error.message);
}

export async function toggleLiveStageMessageReaction(
  messageId: string,
  reaction: LiveStageMessageReaction,
  active: boolean,
): Promise<void> {
  const normalizedReaction = normalizeLiveStageMessageReaction(reaction);
  if (!normalizedReaction) throw new Error("Choose one emoji for this reaction.");
  const userId = await getCurrentUserId();
  const query = supabase.from("live_stage_message_reactions");
  const result = active
    ? await query.delete().eq("message_id", messageId).eq("user_id", userId).eq("reaction", normalizedReaction)
    : await query.insert({ message_id: messageId, user_id: userId, reaction: normalizedReaction });
  await assertCurrentLiveStageUser(userId);
  if (result.error) throw stageError("update this Stage reaction", result.error.message);
}

export async function readLiveStageRoom(
  stageId: string,
): Promise<LiveStageRoom> {
  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    const stages =
      await readLocalLiveStagesForIdentity(
        identity,
      );

    const stage =
      findLocalLiveStage(
        stages,
        stageId,
      );

    if (!stage) {
      return {
        stage: null,
        messages: [],
      };
    }

    const messages =
      await readAllLocalMessagesForIdentity(
        identity,
      );

    return {
      stage,
      messages:
        messages
          .filter(
            (message) =>
              message.stageId ===
              stage.id,
          )
          .sort(
            (
              first,
              second,
            ) =>
              timestamp(
                first.createdAt,
              ) -
              timestamp(
                second.createdAt,
              ),
          ),
    };
  }

  const currentUserId =
    await getCurrentUserId();

  const stage =
    await readLiveStage(
      stageId,
    );

  if (!stage) {
    return {
      stage: null,
      messages: [],
    };
  }

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  const messages =
    await readLiveStageMessages(
      stage.id,
    );

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  return {
    stage,
    messages,
  };
}

export async function writeLiveStages(
  stages: LiveStage[],
): Promise<void> {
  const identity =
    await resolveLocalIdentity();

  await withLocalMutation(
    async () => {
      await writeLocalLiveStages(
        identity,
        stages,
      );
    },
  );
}

export async function upsertLiveStage(
  stage: LiveStage,
): Promise<LiveStage> {
  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return withLocalMutation(
      async () => {
        const stages =
          await readLocalLiveStagesForIdentity(
            identity,
          );

        const normalized =
          normalizeLocalStage(
            stage,
          );

        const next =
          stages.some(
            (item) =>
              item.id ===
              normalized.id,
          )
            ? stages.map(
                (item) =>
                  item.id ===
                  normalized.id
                    ? normalized
                    : item,
              )
            : [
                normalized,
                ...stages,
              ];

        await writeLocalLiveStages(
          identity,
          next,
        );
        emitLocalChange(
          identity,
          normalized.id,
        );

        return normalized;
      },
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "live_stages",
      )
      .update({
        name:
          stage.name
            .trim()
            .slice(0, 80),
        activity:
          stage.activity
            .trim()
            .slice(0, 120),
        visibility:
          stage.visibility,
        status:
          stage.status,
        tracks:
          serializeTracks(
            stage.tracks,
          ),
        current_track_index:
          stage.currentTrackIndex,
      })
      .eq(
        "id",
        stage.id,
      )
      .select(
        LIVE_STAGE_COLUMNS,
      )
      .single();

  if (error) {
    throw stageError(
      "save this Stage",
      error.message,
    );
  }

  return (
    await readLiveStage(
      (
        data as unknown as
          LiveStageRow
      ).id,
    )
  )!;
}

export async function saveLiveStage(
  stage: LiveStage,
): Promise<LiveStage> {
  return upsertLiveStage(
    stage,
  );
}

export async function createLiveStage(
  input:
    | CreateLiveStageInput
    | string = {},
  ...extraArguments: unknown[]
): Promise<LiveStage> {
  const options =
    normalizeCreateInput(
      input,
      extraArguments,
    );

  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return singleFlightMutation(
      `create:${identity.ownerId}:${createInputFingerprint(
        options,
      )}`,
      () =>
        createLocalLiveStage(
          options,
          identity,
        ),
    );
  }

  const userId =
    await getCurrentUserId();

  return singleFlightMutation(
    `create:${userId}:${createInputFingerprint(
      options,
    )}`,
    async () => {
      const name =
        cleanText(
          options.name,
        ).slice(
          0,
          80,
        ) ||
        "Untitled Stage";

      const activity =
        cleanText(
          options.activity,
        ).slice(
          0,
          120,
        ) ||
        "Listening together";

      let lastMessage =
        "Canal could not create this Stage.";

      for (
        let attempt = 0;
        attempt < 4;
        attempt += 1
      ) {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "live_stages",
            )
            .insert({
              host_id:
                userId,
              scene_id:
                cleanText(
                  options.sceneId,
                ) ||
                null,
              name,
              activity,
              visibility:
                options.visibility ===
                "private"
                  ? "private"
                  : "public",
              tracks:
                serializeTracks(
                  options.tracks ??
                    [],
                ),
            })
            .select(
              LIVE_STAGE_COLUMNS,
            )
            .single();

        if (
          !error &&
          data
        ) {
          const stage =
            await readLiveStage(
              (
                data as unknown as
                  LiveStageRow
              ).id,
            );

          if (stage) {
            return stage;
          }
        }

        lastMessage =
          error?.message ??
          lastMessage;

        if (
          error?.code !==
          "23505"
        ) {
          break;
        }
      }

      throw stageError(
        "create this Stage",
        lastMessage,
      );
    },
  );
}

export async function joinLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  ...participantArguments: unknown[]
): Promise<LiveStage | null> {
  void participantArguments;

  const identifier =
    typeof stageOrCode ===
    "string"
      ? stageOrCode
      : stageOrCode.id;

  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return joinLocalLiveStage(
      stageOrCode,
      identity,
    );
  }

  if (
    /^\d{6}$/.test(
      normalizeStageCode(
        identifier,
      ),
    ) &&
    !isUuid(identifier)
  ) {
    return joinLiveStageByCode(
      identifier,
    );
  }

  const userId =
    await getCurrentUserId();

  const {
    error,
  } =
    await supabase
      .from(
        "live_stage_members",
      )
      .upsert(
        {
          stage_id:
            identifier,
          user_id:
            userId,
          role:
            "listener",
        },
        {
          onConflict:
            "stage_id,user_id",
          ignoreDuplicates:
            true,
        },
      );

  if (error) {
    throw stageError(
      "join this Stage",
      error.message,
    );
  }

  return readLiveStage(
    identifier,
  );
}

export async function joinLiveStageByCode(
  stageCode: string,
  expectedStageId?: string,
): Promise<LiveStage | null> {
  const normalizedExpectedStageId =
    expectedStageId ===
    undefined
      ? null
      : expectedStageId.trim();

  if (
    normalizedExpectedStageId !==
      null &&
    !isUuid(
      normalizedExpectedStageId,
    )
  ) {
    return null;
  }

  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return joinLocalLiveStage(
      normalizeStageCode(
        stageCode,
      ),
      identity,
      normalizedExpectedStageId,
    );
  }

  requireSupabaseConfiguration();

  const normalizedCode =
    normalizeStageCode(
      stageCode,
    );

  if (
    !/^\d{6}$/.test(
      normalizedCode,
    )
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "join_live_stage_by_code",
      {
        stage_code_value:
          normalizedCode,
        expected_stage_id:
          normalizedExpectedStageId,
      },
    );

  if (error) {
    throw stageError(
      "join this Stage",
      error.message,
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : null;

  if (
    !row ||
    typeof row !==
      "object"
  ) {
    return null;
  }

  const returnedId =
    cleanText(
      (
        row as Record<
          string,
          unknown
        >
      ).id,
    );

  if (
    !isUuid(
      returnedId,
    ) ||
    (
      normalizedExpectedStageId !==
        null &&
      returnedId !==
        normalizedExpectedStageId
    )
  ) {
    return null;
  }

  const stage =
    await readLiveStage(
      returnedId,
    );

  if (
    !stage ||
    stage.id !==
      returnedId ||
    stage.stageCode !==
      normalizedCode ||
    stage.status !==
      "live" ||
    !stage.membershipRole
  ) {
    return null;
  }

  return stage;
}

export async function leaveLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  ...participantArguments: unknown[]
): Promise<LiveStage | null> {
  void participantArguments;

  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return leaveLocalLiveStage(
      stageOrCode,
      identity,
    );
  }

  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : stageOrCode;

  if (!stage) {
    return null;
  }

  const userId =
    await getCurrentUserId();

  const {
    error,
  } =
    await supabase
      .from(
        "live_stage_members",
      )
      .delete()
      .eq(
        "stage_id",
        stage.id,
      )
      .eq(
        "user_id",
        userId,
      );

  if (error) {
    throw stageError(
      "leave this Stage",
      error.message,
    );
  }

  return {
    ...stage,
    participants:
      stage.participants.filter(
        (participant) =>
          participant.userId !==
          userId,
      ),
    membershipRole: null,
  };
}

export async function advanceLiveStageTrack(
  stageOrCode:
    | string
    | LiveStage,
): Promise<LiveStage | null> {
  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return updateLocalStagePlayback(
      stageOrCode,
      identity,
      (stage) => ({
        currentTrackIndex:
          stage.tracks.length ===
          0
            ? 0
            : (
                stage.currentTrackIndex +
                1
              ) %
              stage.tracks.length,
      }),
    );
  }

  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : stageOrCode;

  if (!stage) {
    return null;
  }

  const nextTrackIndex =
    stage.tracks.length ===
    0
      ? 0
      : (
          stage.currentTrackIndex +
          1
        ) %
        stage.tracks.length;

  return updateStagePlayback(
    stage,
    {
      currentTrackIndex:
        nextTrackIndex,
    },
  );
}

export async function endLiveStage(
  stageOrCode:
    | string
    | LiveStage,
): Promise<LiveStage | null> {
  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return updateLocalStagePlayback(
      stageOrCode,
      identity,
      () => ({
        status:
          "ended",
      }),
    );
  }

  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : stageOrCode;

  if (!stage) {
    return null;
  }

  return updateStagePlayback(
    stage,
    {
      status: "ended",
    },
  );
}

export async function restartLiveStage(
  stageOrCode: string | LiveStage,
): Promise<LiveStage | null> {
  if (!isSupabaseConfigured) {
    const identity = await resolveLocalIdentity();
    return updateLocalStagePlayback(stageOrCode, identity, () => ({
      currentTrackIndex: 0,
      status: "live",
      startedAt: new Date().toISOString(),
    }));
  }

  const stage =
    typeof stageOrCode === "string"
      ? await readLiveStage(stageOrCode)
      : stageOrCode;

  if (!stage) return null;

  return updateStagePlayback(stage, {
    currentTrackIndex: 0,
    status: "live",
  });
}

export async function deleteLiveStage(
  stageIdOrCode: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    await withLocalMutation(
      async () => {
        const stages =
          await readLocalLiveStagesForIdentity(
            identity,
          );

        const stage =
          findLocalLiveStage(
            stages,
            stageIdOrCode,
          );

        if (!stage) {
          return;
        }

        await writeLocalLiveStages(
          identity,
          stages.filter(
            (item) =>
              item.id !==
              stage.id,
          ),
        );
        emitLocalChange(
          identity,
          stage.id,
        );
      },
    );
    return;
  }

  const stage =
    await readLiveStage(
      stageIdOrCode,
    );

  if (!stage) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "live_stages",
      )
      .delete()
      .eq(
        "id",
        stage.id,
      );

  if (error) {
    throw stageError(
      "delete this Stage",
      error.message,
    );
  }
}

export async function sendLiveStageMessage(
  stageId: string,
  body: string,
): Promise<LiveStageMessage> {
  const messageBody =
    body
      .trim()
      .slice(
        0,
        500,
      );

  if (!messageBody) {
    throw new Error(
      "Write a message before sending it.",
    );
  }

  if (!isSupabaseConfigured) {
    const identity =
      await resolveLocalIdentity();

    return singleFlightMutation(
      `message:${identity.ownerId}:${stageId}:${messageBody}`,
      () =>
        withLocalMutation(
          async () => {
            const messages =
              await readAllLocalMessagesForIdentity(
                identity,
              );

            const message:
              LiveStageMessage = {
                id:
                  createLocalId(
                    "message",
                  ),
                stageId,
                userId:
                  identity.ownerId,
                username:
                  identity.username,
                displayName:
                  identity.displayName,
                initials:
                  identity.initials,
                body:
                  messageBody,
                createdAt:
                  new Date().toISOString(),
                isMine:
                  true,
                reactions: {},
                myReactions: [],
                reactionUsers: {},
              };

            messages.push(
              message,
            );

            await writeLocalMessages(
              identity,
              messages.slice(
                -500,
              ),
            );
            emitLocalChange(
              identity,
              stageId,
            );

            return message;
          },
        ),
    );
  }

  const userId =
    await getCurrentUserId();

  return singleFlightMutation(
    `message:${userId}:${stageId}:${messageBody}`,
    async () => {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "live_stage_messages",
          )
          .insert({
            stage_id:
              stageId,
            user_id:
              userId,
            body:
              messageBody,
          })
          .select(
            LIVE_STAGE_MESSAGE_COLUMNS,
          )
          .single();

      if (error) {
        throw stageError(
          "send this message",
          error.message,
        );
      }

      const message =
        normalizeLiveStageMessageRows(
          [
            data as unknown as
              LiveStageMessageRow,
          ],
          userId,
        )[0];

      if (!message) {
        throw new Error(
          "Canal sent the message but could not read it back.",
        );
      }

      return message;
    },
  );
}

export async function reportLiveStageMessage(
  stageId: string,
  messageId: string,
  reason: LiveStageReportReason,
): Promise<void> {
  const action =
    "report this Stage message";
  const normalizedStageId =
    validateLiveStageModerationUuid(
      stageId,
      "Stage",
      action,
    );
  const normalizedMessageId =
    validateLiveStageModerationUuid(
      messageId,
      "message",
      action,
    );

  if (
    !LIVE_STAGE_REPORT_REASONS.includes(
      reason,
    )
  ) {
    throw stageError(
      action,
      "Choose a valid report reason and try again.",
    );
  }

  await runLiveStageModerationRpc(
    action,
    "report_live_stage_message",
    {
      stage_id_value:
        normalizedStageId,
      message_id_value:
        normalizedMessageId,
      reason_value:
        reason,
    },
  );
}

export async function moderateLiveStageMember(
  stageId: string,
  targetUserId: string,
  action: LiveStageMemberModerationAction,
  reason?: string,
): Promise<void> {
  const stageAction =
    "moderate this Stage member";
  const normalizedStageId =
    validateLiveStageModerationUuid(
      stageId,
      "Stage",
      stageAction,
    );
  const normalizedTargetUserId =
    validateLiveStageModerationUuid(
      targetUserId,
      "member",
      stageAction,
    );

  if (
    !LIVE_STAGE_MEMBER_MODERATION_ACTIONS.includes(
      action,
    )
  ) {
    throw stageError(
      stageAction,
      "Choose a valid moderation action and try again.",
    );
  }

  const normalizedReason =
    normalizeLiveStageModerationReason(
      reason,
      stageAction,
    );

  await runLiveStageModerationRpc(
    stageAction,
    "moderate_live_stage_member",
    {
      stage_id_value:
        normalizedStageId,
      target_user_id_value:
        normalizedTargetUserId,
      action_value:
        action,
      reason_value:
        normalizedReason,
    },
  );
}

export async function moderateLiveStageMessage(
  stageId: string,
  messageId: string,
  reason?: string,
): Promise<void> {
  const action =
    "moderate this Stage message";
  const normalizedStageId =
    validateLiveStageModerationUuid(
      stageId,
      "Stage",
      action,
    );
  const normalizedMessageId =
    validateLiveStageModerationUuid(
      messageId,
      "message",
      action,
    );
  const normalizedReason =
    normalizeLiveStageModerationReason(
      reason,
      action,
    );

  await runLiveStageModerationRpc(
    action,
    "moderate_live_stage_message",
    {
      stage_id_value:
        normalizedStageId,
      message_id_value:
        normalizedMessageId,
      reason_value:
        normalizedReason,
    },
  );
}

export function subscribeToLiveStage(
  stageId: string,
  onChange: () => void,
  onStatus?: (
    status:
      LiveStageSubscriptionStatus,
  ) => void,
): () => void {
  if (!isSupabaseConfigured) {
    let active =
      true;
    let subscriberKey:
      string | null =
        null;

    onStatus?.(
      "connecting",
    );

    void resolveLocalIdentity()
      .then(
        (identity) => {
          if (!active) {
            return;
          }

          const key =
            localSubscriberKey(
              identity,
              stageId,
            );

          subscriberKey =
            key;

          const subscribers =
            localSubscribers.get(
              key,
            ) ??
            new Set<
              () => void
            >();

          subscribers.add(
            onChange,
          );
          localSubscribers.set(
            key,
            subscribers,
          );
          onStatus?.(
            "connected",
          );
        },
      )
      .catch(() => {
        if (active) {
          onStatus?.(
            "error",
          );
        }
      });

    return () => {
      active =
        false;

      if (
        !subscriberKey
      ) {
        return;
      }

      const subscribers =
        localSubscribers.get(
          subscriberKey,
        );

      subscribers?.delete(
        onChange,
      );

      if (
        subscribers?.size ===
        0
      ) {
        localSubscribers.delete(
          subscriberKey,
        );
      }
    };
  }

  onStatus?.(
    "connecting",
  );

  let active =
    true;

  let channel:
    ReturnType<
      typeof supabase.channel
    > | null =
      null;

  void supabase.realtime
    .setAuth()
    .then(() => {
      if (!active) {
        return;
      }

      channel =
        supabase
          .channel(
            `live-stage:${stageId}`,
            {
              config: {
                private:
                  true,
              },
            },
          )
          .on(
            "broadcast",
            {
              event:
                "stage_changed",
            },
            () => {
              onChange();
            },
          )
          .subscribe(
            (status) => {
              if (
                !active
              ) {
                return;
              }

              if (
                status ===
                "SUBSCRIBED"
              ) {
                onStatus?.(
                  "connected",
                );
              } else if (
                status ===
                  "CHANNEL_ERROR" ||
                status ===
                  "TIMED_OUT" ||
                status ===
                  "CLOSED"
              ) {
                onStatus?.(
                  "error",
                );
              }
            },
          );
    })
    .catch(() => {
      if (active) {
        onStatus?.(
          "error",
        );
      }
    });

  return () => {
    active =
      false;

    if (channel) {
      void supabase.removeChannel(
        channel,
      );
    }
  };
}

export function getCurrentLiveStageTrack(
  stage: LiveStage,
): LiveStageTrack | null {
  if (
    stage.tracks.length ===
    0
  ) {
    return null;
  }

  return (
    stage.tracks[
      safeTrackIndex(
        stage.currentTrackIndex,
        stage.tracks.length,
      )
    ] ??
    stage.tracks[0] ??
    null
  );
}

export function getLiveStageTrackSpotifyUrl(
  track:
    | LiveStageTrack
    | null
    | undefined,
): string | null {
  return (
    normalizeSpotifyTrackLinks(
      track?.spotifyUri,
      track?.spotifyUrl,
    )?.spotifyUrl ??
    null
  );
}

export function getLiveStageTrackImageUrl(
  track:
    | LiveStageTrack
    | null
    | undefined,
): string | null {
  return (
    normalizeTrackImageUrl(
      track?.imageUrl,
    ) || null
  );
}

export function createStageId(): string {
  return createLocalId(
    "stage",
  );
}

export function createStageCode(): string {
  return String(
    Math.floor(
      100000 +
      Math.random() *
        900000,
    ),
  );
}

function validateLiveStageModerationUuid(
  value: unknown,
  label: string,
  action: string,
): string {
  const normalized =
    cleanText(
      value,
    );

  if (
    !isUuid(
      normalized,
    )
  ) {
    throw stageError(
      action,
      `Choose a valid ${label} and try again.`,
    );
  }

  return normalized;
}

function normalizeLiveStageModerationReason(
  value: unknown,
  action: string,
): string | null {
  if (
    value ===
    undefined
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    throw stageError(
      action,
      "Use a valid moderation reason and try again.",
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    Array.from(
      normalized,
    ).length >
      MAX_LIVE_STAGE_MODERATION_REASON_CHARACTERS ||
    utf8ByteLength(
      normalized,
    ) >
      MAX_LIVE_STAGE_MODERATION_REASON_BYTES ||
    /[\u0000-\u001f\u007f]/.test(
      normalized,
    )
  ) {
    throw stageError(
      action,
      "Keep the moderation reason to 240 characters without control characters.",
    );
  }

  return normalized;
}

async function runLiveStageModerationRpc(
  action: string,
  rpcName:
    | "report_live_stage_message"
    | "moderate_live_stage_member"
    | "moderate_live_stage_message",
  values: Record<
    string,
    string | null
  >,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw stageError(
      action,
      "Live Stage moderation requires Canal cloud services. Configure Supabase and try again.",
    );
  }

  requireSupabaseConfiguration();

  const currentUserId =
    await getCurrentUserId();

  const {
    error,
  } =
    await supabase.rpc(
      rpcName,
      {
        ...values,
        expected_actor_id_value:
          currentUserId,
      },
    );

  await assertCurrentLiveStageUser(
    currentUserId,
  );

  if (error) {
    throw stageError(
      action,
      error.message,
    );
  }
}

async function readCloudMembers(
  stageIds: string[],
): Promise<LiveStageMemberRow[]> {
  if (
    stageIds.length ===
    0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "live_stage_members",
      )
      .select(
        LIVE_STAGE_MEMBER_COLUMNS,
      )
      .in(
        "stage_id",
        stageIds,
      )
      .order(
        "joined_at",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw stageError(
      "load Stage members",
      error.message,
    );
  }

  return (
    data ?? []
  ) as unknown as
    LiveStageMemberRow[];
}

async function getCurrentUserId(): Promise<string> {
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
      "You must be signed into Canal to use live Stages.",
    );
  }

  return user.id;
}

async function assertCurrentLiveStageUser(
  expectedUserId: string,
): Promise<void> {
  const actualUserId =
    await getCurrentUserId();

  if (
    actualUserId !==
    expectedUserId
  ) {
    throw new Error(
      "The signed-in Canal account changed while this Stage was loading. Please try again.",
    );
  }
}

async function updateLocalStagePlayback(
  stageOrCode:
    | string
    | LiveStage,
  identity: LocalLiveStageIdentity,
  createUpdate: (
    stage: LiveStage,
  ) => {
    currentTrackIndex?: number;
    status?: LiveStageStatus;
    startedAt?: string;
  },
): Promise<LiveStage | null> {
  return withLocalMutation(
    async () => {
      const stages =
        await readLocalLiveStagesForIdentity(
          identity,
        );

      const identifier =
        typeof stageOrCode ===
        "string"
          ? stageOrCode
          : stageOrCode.id;

      const currentStage =
        findLocalLiveStage(
          stages,
          identifier,
        );

      if (!currentStage) {
        return null;
      }

      const update =
        createUpdate(
          currentStage,
        );

      const updatedStage:
        LiveStage = {
          ...currentStage,
          currentTrackIndex:
            update.currentTrackIndex ??
            currentStage.currentTrackIndex,
          status:
            update.status ??
            currentStage.status,
          startedAt:
            update.startedAt ??
            currentStage.startedAt,
          endedAt:
            update.status === "ended"
              ? new Date().toISOString()
              : update.status === "live"
                ? undefined
                : currentStage.endedAt,
          updatedAt:
            new Date().toISOString(),
        };

      await writeLocalLiveStages(
        identity,
        stages.map(
          (item) =>
            item.id ===
            updatedStage.id
              ? updatedStage
              : item,
        ),
      );
      emitLocalChange(
        identity,
        updatedStage.id,
      );

      return updatedStage;
    },
  );
}

async function updateStagePlayback(
  stage: LiveStage,
  update: {
    currentTrackIndex?: number;
    status?: LiveStageStatus;
  },
): Promise<LiveStage> {
  const values: {
    current_track_index?: number;
    status?: LiveStageStatus;
  } = {};

  if (
    update.currentTrackIndex !==
    undefined
  ) {
    values.current_track_index =
      update.currentTrackIndex;
  }

  if (update.status) {
    values.status =
      update.status;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "live_stages",
      )
      .update(
        values,
      )
      .eq(
        "id",
        stage.id,
      )
      .select(
        LIVE_STAGE_COLUMNS,
      )
      .single();

  if (error) {
    throw stageError(
      "update this Stage",
      error.message,
    );
  }

  return (
    await readLiveStage(
      (
        data as unknown as
          LiveStageRow
      ).id,
    )
  )!;
}

async function resolveLocalIdentity(): Promise<
  LocalLiveStageIdentity
> {
  const profile =
    await readLocalProfile();

  const username =
    normalizeUsername(
      profile.handle,
    ) ||
    DEFAULT_LOCAL_IDENTITY
      .username;

  const displayName =
    cleanText(
      profile.displayName,
    ) ||
    DEFAULT_LOCAL_IDENTITY
      .displayName;

  const identity:
    LocalLiveStageIdentity = {
      ownerId:
        `local-profile:${username}`,
      username,
      displayName,
      initials:
        getInitials(
          displayName,
        ),
    };

  return identity;
}

function localLiveStageStorageKey(
  identity: LocalLiveStageIdentity,
): string {
  return `${LIVE_STAGE_STORAGE_KEY}:owner:${encodeURIComponent(
    identity.ownerId,
  )}`;
}

function localLiveStageMessageStorageKey(
  identity: LocalLiveStageIdentity,
): string {
  return `${LIVE_STAGE_MESSAGE_STORAGE_KEY}:owner:${encodeURIComponent(
    identity.ownerId,
  )}`;
}

function localSubscriberKey(
  identity: LocalLiveStageIdentity,
  stageId: string,
): string {
  return `${identity.ownerId}:${stageId}`;
}

function findLocalLiveStage(
  stages: LiveStage[],
  stageIdOrCode: string,
): LiveStage | null {
  const identifier =
    stageIdOrCode.trim();
  const code =
    normalizeStageCode(
      identifier,
    );

  return (
    stages.find(
      (stage) =>
        stage.id ===
          identifier ||
        (
          code.length ===
            6 &&
          stage.code ===
            code
        ),
    ) ?? null
  );
}

function withLocalMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const result =
    localMutationQueue.then(
      mutation,
      mutation,
    );

  localMutationQueue =
    result.then(
      () => undefined,
      () => undefined,
    );

  return result;
}

function singleFlightMutation<T>(
  key: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const existing =
    pendingMutations.get(
      key,
    ) as
      | Promise<T>
      | undefined;

  if (existing) {
    return existing;
  }

  const result =
    Promise.resolve().then(
      mutation,
    );

  pendingMutations.set(
    key,
    result,
  );

  void result.then(
    () => {
      if (
        pendingMutations.get(
          key,
        ) === result
      ) {
        pendingMutations.delete(
          key,
        );
      }
    },
    () => {
      if (
        pendingMutations.get(
          key,
        ) === result
      ) {
        pendingMutations.delete(
          key,
        );
      }
    },
  );

  return result;
}

function createInputFingerprint(
  options: CreateLiveStageInput,
): string {
  return JSON.stringify({
    name:
      cleanText(
        options.name,
      ).slice(
        0,
        80,
      ),
    activity:
      cleanText(
        options.activity,
      ).slice(
        0,
        120,
      ),
    visibility:
      options.visibility ===
      "private"
        ? "private"
        : "public",
    sceneId:
      cleanText(
        options.sceneId,
      ),
    tracks:
      serializeTracks(
        options.tracks ??
          [],
      ),
  });
}

async function readLocalLiveStages(): Promise<
  LiveStage[]
> {
  const identity =
    await resolveLocalIdentity();

  return readLocalLiveStagesForIdentity(
    identity,
  );
}

async function readLocalLiveStagesForIdentity(
  identity: LocalLiveStageIdentity,
): Promise<LiveStage[]> {
  const serialized =
    await AsyncStorage.getItem(
      localLiveStageStorageKey(
        identity,
      ),
    );

  if (!serialized) {
    return DEFAULT_LIVE_STAGES.map(
      cloneLiveStage,
    );
  }

  try {
    const parsed: unknown =
      JSON.parse(
        serialized,
      );

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null
    ) {
      return [];
    }

    const store =
      parsed as
        Partial<LocalLiveStageStore>;

    if (
      store.version !==
        LOCAL_LIVE_STAGE_STORE_VERSION ||
      store.ownerId !==
        identity.ownerId ||
      !Array.isArray(
        store.stages,
      )
    ) {
      return [];
    }

    return store.stages
      .map(
        normalizeLocalStage,
      )
      .sort(
        (
          first,
          second,
        ) =>
          timestamp(
            second.updatedAt,
          ) -
          timestamp(
            first.updatedAt,
          ),
      );
  } catch {
    return [];
  }
}

async function writeLocalLiveStages(
  identity: LocalLiveStageIdentity,
  stages: LiveStage[],
): Promise<void> {
  const store:
    LocalLiveStageStore = {
      version:
        LOCAL_LIVE_STAGE_STORE_VERSION,
      ownerId:
        identity.ownerId,
      stages:
        stages.map(
          normalizeLocalStage,
        ),
    };

  await AsyncStorage.setItem(
    localLiveStageStorageKey(
      identity,
    ),
    JSON.stringify(
      store,
    ),
  );
}

async function createLocalLiveStage(
  options: CreateLiveStageInput,
  identity: LocalLiveStageIdentity,
): Promise<LiveStage> {
  return withLocalMutation(
    async () => {
      const stages =
        await readLocalLiveStagesForIdentity(
          identity,
        );

      const now =
        new Date().toISOString();

      const host:
        LiveStageParticipant = {
          userId:
            identity.ownerId,
          username:
            identity.username,
          displayName:
            identity.displayName,
          initials:
            identity.initials,
          role:
            "host",
          joinedAt:
            now,
        };

      const participants =
        mergeParticipants([
          ...(
            options.participants ??
            []
          ),
          host,
        ]);

      let code =
        createStageCode();

      while (
        stages.some(
          (stage) =>
            stage.code ===
            code,
        )
      ) {
        code =
          createStageCode();
      }

      const stage:
        LiveStage = {
          id:
            createStageId(),
          code,
          stageCode:
            code,
          name:
            cleanText(
              options.name,
            ) ||
            "Untitled Stage",
          hostId:
            identity.ownerId,
          hostUsername:
            identity.username,
          hostName:
            identity.displayName,
          stageKind:
            "community",
          hostIsVerified:
            false,
          hostIsCanal:
            false,
          sceneId:
            cleanText(
              options.sceneId,
            ) ||
            undefined,
          activity:
            cleanText(
              options.activity,
            ) ||
            "Listening together",
          visibility:
            options.visibility ===
            "private"
              ? "private"
              : "public",
          status:
            "live",
          participants,
          participantCount:
            participants.length,
          listenerCount:
            participants.filter(
              (participant) =>
                participant.role ===
                "listener",
            ).length,
          tracks:
            normalizeTracks(
              options.tracks ??
              [],
            ),
          currentTrackIndex:
            0,
          membershipRole:
            "host",
          startedAt:
            now,
          createdAt:
            now,
          updatedAt:
            now,
        };

      await writeLocalLiveStages(
        identity,
        [
          stage,
          ...stages,
        ],
      );
      emitLocalChange(
        identity,
        stage.id,
      );

      return stage;
    },
  );
}

async function joinLocalLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  identity: LocalLiveStageIdentity,
  expectedStageId:
    string | null =
      null,
): Promise<LiveStage | null> {
  return withLocalMutation(
    async () => {
      const stages =
        await readLocalLiveStagesForIdentity(
          identity,
        );

      const identifier =
        typeof stageOrCode ===
        "string"
          ? stageOrCode
          : stageOrCode.id;

      const stage =
        findLocalLiveStage(
          stages,
          identifier,
        );

      if (
        !stage ||
        stage.status !==
          "live" ||
        (
          expectedStageId !==
            null &&
          stage.id !==
            expectedStageId
        )
      ) {
        return null;
      }

      const participant:
        LiveStageParticipant = {
          userId:
            identity.ownerId,
          username:
            identity.username,
          displayName:
            identity.displayName,
          initials:
            identity.initials,
          role:
            "listener",
          joinedAt:
            new Date().toISOString(),
        };

      const participants =
        mergeParticipants([
          ...stage.participants.filter(
            (item) =>
              item.userId !==
              identity.ownerId,
          ),
          participant,
        ]);

      const updatedStage:
        LiveStage = {
          ...stage,
          participants,
          participantCount:
            participants.length,
          listenerCount:
            participants.filter(
              (item) =>
                item.role ===
                "listener",
            ).length,
          membershipRole:
            participant.role,
          updatedAt:
            new Date().toISOString(),
        };

      await writeLocalLiveStages(
        identity,
        stages.map(
          (item) =>
            item.id ===
            updatedStage.id
              ? updatedStage
              : item,
        ),
      );
      emitLocalChange(
        identity,
        updatedStage.id,
      );

      return updatedStage;
    },
  );
}

async function leaveLocalLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  identity: LocalLiveStageIdentity,
): Promise<LiveStage | null> {
  return withLocalMutation(
    async () => {
      const stages =
        await readLocalLiveStagesForIdentity(
          identity,
        );

      const identifier =
        typeof stageOrCode ===
        "string"
          ? stageOrCode
          : stageOrCode.id;

      const currentStage =
        findLocalLiveStage(
          stages,
          identifier,
        );

      if (!currentStage) {
        return null;
      }

      const participants =
        currentStage.participants.filter(
          (item) =>
            item.userId !==
              identity.ownerId &&
            item.username !==
              identity.username,
        );

      const updatedStage:
        LiveStage = {
          ...currentStage,
          participants,
          participantCount:
            participants.length,
          listenerCount:
            participants.filter(
              (item) =>
                item.role ===
                "listener",
            ).length,
          membershipRole:
            null,
          updatedAt:
            new Date().toISOString(),
        };

      await writeLocalLiveStages(
        identity,
        stages.map(
          (item) =>
            item.id ===
            updatedStage.id
              ? updatedStage
              : item,
        ),
      );
      emitLocalChange(
        identity,
        updatedStage.id,
      );

      return updatedStage;
    },
  );
}

async function readAllLocalMessagesForIdentity(
  identity: LocalLiveStageIdentity,
): Promise<LiveStageMessage[]> {
  const serialized =
    await AsyncStorage.getItem(
      localLiveStageMessageStorageKey(
        identity,
      ),
    );

  if (!serialized) {
    return [];
  }

  try {
    const parsed: unknown =
      JSON.parse(
        serialized,
      );

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null
    ) {
      return [];
    }

    const store =
      parsed as
        Partial<LocalLiveStageMessageStore>;

    if (
      store.version !==
        LOCAL_LIVE_STAGE_STORE_VERSION ||
      store.ownerId !==
        identity.ownerId ||
      !Array.isArray(
        store.messages,
      )
    ) {
      return [];
    }

    return store.messages
      .filter(
        (
          message,
        ): message is
          LiveStageMessage =>
          typeof message ===
            "object" &&
          message !==
            null &&
          Boolean(
            cleanText(
              message.id,
            ) &&
            cleanText(
              message.stageId,
            ) &&
            cleanText(
              message.body,
            ),
          ),
      )
      .map(
        (message) => ({
          ...message,
          isMine:
            message.userId ===
            identity.ownerId,
        }),
      );
  } catch {
    return [];
  }
}

async function writeLocalMessages(
  identity: LocalLiveStageIdentity,
  messages: LiveStageMessage[],
): Promise<void> {
  const store:
    LocalLiveStageMessageStore = {
      version:
        LOCAL_LIVE_STAGE_STORE_VERSION,
      ownerId:
        identity.ownerId,
      messages,
    };

  await AsyncStorage.setItem(
    localLiveStageMessageStorageKey(
      identity,
    ),
    JSON.stringify(
      store,
    ),
  );
}

async function readLocalMessages(
  stageId: string,
): Promise<LiveStageMessage[]> {
  const identity =
    await resolveLocalIdentity();

  const messages =
    await readAllLocalMessagesForIdentity(
      identity,
    );

  return messages
    .filter(
      (message) =>
        message.stageId ===
        stageId,
    )
    .sort(
      (first, second) =>
        timestamp(
          first.createdAt,
        ) -
        timestamp(
          second.createdAt,
        ),
    );
}

function emitLocalChange(
  identity: LocalLiveStageIdentity,
  stageId: string,
): void {
  const subscribers =
    localSubscribers.get(
      localSubscriberKey(
        identity,
        stageId,
      ),
    );

  subscribers?.forEach(
    (listener) => {
      listener();
    },
  );
}

function normalizeCreateInput(
  input:
    | CreateLiveStageInput
    | string,
  extraArguments: unknown[],
): CreateLiveStageInput {
  if (
    typeof input ===
      "object" &&
    input !== null
  ) {
    return input;
  }

  return {
    name:
      typeof input ===
      "string"
        ? input
        : undefined,
    activity:
      typeof extraArguments[0] ===
      "string"
        ? extraArguments[0]
        : undefined,
    visibility:
      extraArguments[1] ===
      "private"
        ? "private"
        : "public",
  };
}

function normalizeLocalStage(
  value: unknown,
): LiveStage {
  const record =
    (
      typeof value ===
        "object" &&
      value !== null
        ? value
        : {}
    ) as Record<
      string,
      unknown
    >;

  const now =
    new Date().toISOString();

  const participants =
    Array.isArray(
      record.participants,
    )
      ? record.participants
          .map(
            normalizeParticipant,
          )
          .filter(
            (
              participant,
            ): participant is
              LiveStageParticipant =>
              Boolean(
                participant,
              ),
          )
      : [];

  const tracks =
    normalizeTracks(
      record.tracks,
    );

  const code =
    normalizeStageCode(
      cleanText(
        record.code,
      ) ||
      cleanText(
        record.stageCode,
      ) ||
      createStageCode(),
    );

  return {
    id:
      cleanText(
        record.id,
      ) ||
      createStageId(),
    code,
    stageCode:
      code,
    name:
      cleanText(
        record.name,
      ) ||
      "Untitled Stage",
    hostId:
      cleanText(
        record.hostId,
      ) ||
      undefined,
    hostUsername:
      normalizeUsername(
        cleanText(
          record.hostUsername,
        ),
      ),
    hostName:
      cleanText(
        record.hostName,
      ) ||
      "Canal Host",
    stageKind:
      normalizeStageKind(
        record.stageKind,
      ),
    hostIsVerified:
      record.hostIsVerified ===
      true,
    hostIsCanal:
      record.hostIsCanal ===
      true,
    sceneId:
      cleanText(
        record.sceneId,
      ) ||
      undefined,
    activity:
      cleanText(
        record.activity,
      ) ||
      "Listening together",
    visibility:
      record.visibility ===
      "private"
        ? "private"
        : "public",
    status:
      record.status ===
      "ended"
        ? "ended"
        : "live",
    participants,
    participantCount:
      participants.length,
    listenerCount:
      participants.filter(
        (participant) =>
          participant.role ===
          "listener",
      ).length,
    tracks,
    currentTrackIndex:
      safeTrackIndex(
        Number(
          record.currentTrackIndex ??
          0,
        ),
        tracks.length,
      ),
    membershipRole:
      normalizeRole(
        record.membershipRole,
      ) ?? null,
    startedAt:
      validDate(
        record.startedAt,
        validDate(
          record.createdAt,
          now,
        ),
      ),
    createdAt:
      validDate(
        record.createdAt,
        now,
      ),
    updatedAt:
      validDate(
        record.updatedAt,
        now,
      ),
    endedAt:
      cleanText(
        record.endedAt,
      ) ||
      undefined,
  };
}

function memberRowToParticipant(
  row: LiveStageMemberRow,
): LiveStageParticipant {
  const displayName =
    cleanText(
      row.display_name,
    ) ||
    "Canal Listener";

  return {
    userId:
      row.user_id,
    username:
      normalizeUsername(
        row.handle,
      ) ||
      "canal_listener",
    displayName,
    initials:
      getInitials(
        displayName,
      ),
    role:
      normalizeRole(
        row.role,
      ) ??
      "listener",
    joinedAt:
      validDate(
        row.joined_at,
      ),
  };
}

function normalizeParticipant(
  value: unknown,
): LiveStageParticipant | null {
  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return null;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const username =
    normalizeUsername(
      cleanText(
        record.username,
      ),
    );

  if (!username) {
    return null;
  }

  const displayName =
    cleanText(
      record.displayName,
    ) ||
    username;

  return {
    userId:
      cleanText(
        record.userId,
      ) ||
      undefined,
    username,
    displayName,
    initials:
      cleanText(
        record.initials,
      ) ||
      getInitials(
        displayName,
      ),
    role:
      normalizeRole(
        record.role,
      ) ??
      "listener",
    joinedAt:
      cleanText(
        record.joinedAt,
      ) ||
      undefined,
  };
}

function normalizeTracks(
  value: unknown,
): LiveStageTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(
      0,
      MAX_LIVE_STAGE_TRACKS,
    )
    .map(
      (
        item,
        index,
      ):
        | LiveStageTrack
        | null => {
      if (
        typeof item !==
          "object" ||
        item === null
      ) {
        return null;
      }

      const record =
        item as Record<
          string,
          unknown
        >;

      const title =
        boundedText(
          record.title,
          MAX_TRACK_TITLE_CHARACTERS,
          MAX_TRACK_TITLE_BYTES,
        );
      const artist =
        boundedText(
          record.artist,
          MAX_TRACK_ARTIST_CHARACTERS,
          MAX_TRACK_ARTIST_BYTES,
        );

      if (
        !title ||
        !artist
      ) {
        return null;
      }

      const track:
        LiveStageTrack = {
        id:
          boundedText(
            record.id,
            MAX_TRACK_ID_CHARACTERS,
            MAX_TRACK_ID_BYTES,
          ) ||
          `stage-track-${index}`,
        title,
        artist,
        source:
          boundedText(
            record.source,
            MAX_TRACK_SOURCE_CHARACTERS,
            MAX_TRACK_SOURCE_BYTES,
          ) ||
          "Canal",
      };

      const spotifyLinks =
        normalizeSpotifyTrackLinks(
          record.spotifyUri ??
            record.spotify_uri,
          record.spotifyUrl ??
            record.spotify_url,
        );
      const durationMs =
        normalizeTrackDuration(
          record.durationMs ??
          record.duration_ms,
        );
      const imageUrl =
        normalizeTrackImageUrl(
          record.imageUrl ??
          record.image_url,
        );

      if (spotifyLinks) {
        track.spotifyUri =
          spotifyLinks.spotifyUri;
        track.spotifyUrl =
          spotifyLinks.spotifyUrl;
      }

      if (durationMs) {
        track.durationMs =
          durationMs;
      }

      if (imageUrl) {
        track.imageUrl =
          imageUrl;
      }

      return track;
    },
    )
    .filter(
      (
        track,
      ): track is
        LiveStageTrack =>
        track !== null,
    );
}

function serializeTrack(
  track: LiveStageTrack,
): Record<
  string,
  unknown
> {
  const serialized:
    Record<
      string,
      unknown
    > = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    source:
      track.source ||
      "Canal",
  };

  if (track.spotifyUri) {
    serialized.spotifyUri =
      track.spotifyUri;
  }

  if (track.spotifyUrl) {
    serialized.spotifyUrl =
      track.spotifyUrl;
  }

  if (track.durationMs) {
    serialized.durationMs =
      track.durationMs;
  }

  if (track.imageUrl) {
    serialized.imageUrl =
      track.imageUrl;
  }

  return serialized;
}

function serializeTracks(
  value: unknown,
): Record<
  string,
  unknown
>[] {
  return normalizeTracks(
    value,
  ).map(
    serializeTrack,
  );
}

function mergeParticipants(
  participants:
    LiveStageParticipant[],
): LiveStageParticipant[] {
  const byUsername =
    new Map<
      string,
      LiveStageParticipant
    >();

  participants.forEach(
    (participant) => {
      byUsername.set(
        participant.username,
        participant,
      );
    },
  );

  return [
    ...byUsername.values(),
  ];
}

function cloneLiveStage(
  stage: LiveStage,
): LiveStage {
  return {
    ...stage,
    participants:
      stage.participants.map(
        (participant) => ({
          ...participant,
        }),
      ),
    tracks:
      stage.tracks.map(
        (track) => ({
          ...track,
        }),
      ),
  };
}

function cleanText(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function normalizeAtmosphereSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 24);
}

function boundedText(
  value: unknown,
  maxCharacters: number,
  maxBytes: number,
): string {
  const text =
    cleanText(
      value,
    );

  if (
    !text ||
    text.length >
      maxCharacters ||
    utf8ByteLength(
      text,
    ) > maxBytes ||
    /[\u0000-\u001f\u007f]/.test(
      text,
    )
  ) {
    return "";
  }

  return text;
}

function utf8ByteLength(
  value: string,
): number {
  let bytes = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const codeUnit =
      value.charCodeAt(
        index,
      );

    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (
      codeUnit <= 0x7ff
    ) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 <
        value.length
    ) {
      const nextCodeUnit =
        value.charCodeAt(
          index + 1,
        );

      if (
        nextCodeUnit >=
          0xdc00 &&
        nextCodeUnit <=
          0xdfff
      ) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function normalizeSpotifyTrackLinks(
  spotifyUriValue: unknown,
  spotifyUrlValue: unknown,
):
  | {
      spotifyUri: string;
      spotifyUrl: string;
    }
  | undefined {
  const spotifyUri =
    boundedText(
      spotifyUriValue,
      MAX_SPOTIFY_URI_CHARACTERS,
      MAX_SPOTIFY_URI_BYTES,
    );
  const spotifyUrl =
    boundedText(
      spotifyUrlValue,
      MAX_SPOTIFY_URL_CHARACTERS,
      MAX_SPOTIFY_URL_BYTES,
    );

  const uriMatch =
    spotifyUri.match(
      SPOTIFY_TRACK_URI_PATTERN,
    );
  const uriTrackId =
    uriMatch?.[1];
  const urlTrackId =
    spotifyTrackIdFromUrl(
      spotifyUrl,
    );

  if (
    uriTrackId &&
    urlTrackId &&
    uriTrackId !== urlTrackId
  ) {
    return undefined;
  }

  const trackId =
    uriTrackId ??
    urlTrackId;

  if (
    !trackId ||
    !SPOTIFY_TRACK_ID_PATTERN.test(
      trackId,
    )
  ) {
    return undefined;
  }

  return {
    spotifyUri:
      `spotify:track:${trackId}`,
    spotifyUrl:
      `https://open.spotify.com/track/${trackId}`,
  };
}

function spotifyTrackIdFromUrl(
  value: string,
): string | undefined {
  if (
    !value ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return undefined;
  }

  try {
    const urlMatch =
      value.match(
        SPOTIFY_TRACK_URL_PATTERN,
      );
    const parsed =
      new URL(value);

    if (
      !urlMatch ||
      !urlMatch[1]?.startsWith(
        "/track/",
      ) ||
      parsed.protocol.toLowerCase() !==
        "https:" ||
      parsed.hostname.toLowerCase() !==
        "open.spotify.com" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }

    return urlMatch[2];
  } catch {
    return undefined;
  }
}

function normalizeTrackImageUrl(
  value: unknown,
): string {
  const imageUrl =
    boundedText(
      value,
      MAX_TRACK_IMAGE_URL_CHARACTERS,
      MAX_TRACK_IMAGE_URL_BYTES,
    );

  if (!imageUrl) {
    return "";
  }

  if (
    imageUrl.includes("?") ||
    imageUrl.includes("#")
  ) {
    return "";
  }

  try {
    const urlMatch =
      imageUrl.match(
        SPOTIFY_IMAGE_URL_PATTERN,
      );
    const parsed =
      new URL(imageUrl);

    if (
      !urlMatch ||
      !urlMatch[1]?.startsWith(
        "/image/",
      ) ||
      parsed.protocol.toLowerCase() !==
        "https:" ||
      parsed.hostname.toLowerCase() !==
        "i.scdn.co" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return "";
    }

    const canonical =
      `https://i.scdn.co${urlMatch[1]}`;

    return boundedText(
      canonical,
      MAX_TRACK_IMAGE_URL_CHARACTERS,
      MAX_TRACK_IMAGE_URL_BYTES,
    );
  } catch {
    return "";
  }
}

function normalizeTrackDuration(
  value: unknown,
): number | undefined {
  return typeof value ===
    "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <=
      MAX_TRACK_DURATION_MS
    ? value
    : undefined;
}

function normalizeStageCode(
  value: string,
): string {
  return value
    .replace(
      /\D/g,
      "",
    )
    .slice(
      0,
      6,
    );
}

function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /^@+/,
      "",
    );
}

function normalizeStageKind(
  value: unknown,
): LiveStageKind {
  if (
    value ===
      "verified" ||
    value ===
      "canal"
  ) {
    return value;
  }

  return "community";
}

function normalizeRole(
  value: unknown,
): LiveStageRole | null {
  if (
    value ===
      "host" ||
    value ===
      "collaborator" ||
    value ===
      "listener"
  ) {
    return value;
  }

  return null;
}

function rolePriority(
  role: LiveStageRole,
): number {
  if (role === "host") {
    return 0;
  }

  if (
    role ===
    "collaborator"
  ) {
    return 1;
  }

  return 2;
}

function safeTrackIndex(
  value: number,
  trackCount: number,
): number {
  if (
    !Number.isFinite(value) ||
    trackCount === 0
  ) {
    return 0;
  }

  return Math.min(
    Math.max(
      Math.floor(value),
      0,
    ),
    trackCount - 1,
  );
}

function validDate(
  value: unknown,
  fallback =
    new Date().toISOString(),
): string {
  const text =
    cleanText(
      value,
    );

  return Number.isFinite(
    new Date(
      text,
    ).getTime(),
  )
    ? text
    : fallback;
}

function timestamp(
  value: unknown,
): number {
  const result =
    new Date(
      cleanText(
        value,
      ),
    ).getTime();

  return Number.isFinite(
    result,
  )
    ? result
    : 0;
}

function getInitials(
  value: string,
): string {
  return (
    value
      .trim()
      .split(
        /\s+/,
      )
      .filter(Boolean)
      .slice(
        0,
        2,
      )
      .map(
        (word) =>
          word
            .charAt(0)
            .toUpperCase(),
      )
      .join("") ||
    "CA"
  );
}

function createLocalId(
  prefix: string,
): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function stageError(
  action: string,
  detail: string,
): Error {
  return new Error(
    `Canal could not ${action}: ${detail}`,
  );
}
