import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage-keys";

export type LiveStageStatus =
  | "live"
  | "ended";

export type LiveStageVisibility =
  | "public"
  | "private";

export type LiveStageTrack = {
  id: string;
  title: string;
  artist: string;
  source: string;
  spotifyUrl?: string;
};

export type LiveStageParticipant = {
  username: string;
  displayName: string;
  initials: string;
  role:
    | "host"
    | "collaborator"
    | "listener";
};

export type LiveStage = {
  id: string;

  /*
   * Both names are kept because older screens use `code`
   * and newer screens use `stageCode`.
   */
  code: string;
  stageCode: string;

  name: string;
  hostUsername: string;
  hostName: string;
  activity: string;

  visibility:
    LiveStageVisibility;

  status:
    LiveStageStatus;

  participants:
    LiveStageParticipant[];

  participantCount: number;
  listenerCount: number;

  tracks:
    LiveStageTrack[];

  currentTrackIndex: number;

  createdAt: string;
  updatedAt: string;
};

export type CreateLiveStageInput = {
  name?: string;
  activity?: string;

  visibility?:
    LiveStageVisibility;

  hostUsername?: string;
  hostName?: string;

  participants?:
    LiveStageParticipant[];

  tracks?:
    LiveStageTrack[];
};

export const LIVE_STAGE_STORAGE_KEY =
  STORAGE_KEYS.liveStages;

const DEFAULT_LIVE_STAGES:
  LiveStage[] = [
    {
      id: "live-stage-1",

      code: "482913",
      stageCode: "482913",

      name:
        "Friday Night Drive",

      hostUsername:
        "maya.wav",

      hostName:
        "Maya Thompson",

      activity:
        "Driving through the city",

      visibility:
        "public",

      status: "live",

      participants: [
        {
          username:
            "maya.wav",

          displayName:
            "Maya Thompson",

          initials: "MT",

          role: "host",
        },
        {
          username:
            "nico.fm",

          displayName:
            "Nico Alvarez",

          initials: "NA",

          role:
            "collaborator",
        },
      ],

      participantCount: 2,
      listenerCount: 14,

      tracks: [
        {
          id:
            "live-1-track-1",

          title: "Snooze",
          artist: "SZA",
          source: "Spotify",
        },
        {
          id:
            "live-1-track-2",

          title: "Hush",

          artist:
            "The Marías",

          source: "Spotify",
        },
        {
          id:
            "live-1-track-3",

          title:
            "Pink + White",

          artist:
            "Frank Ocean",

          source: "Spotify",
        },
      ],

      currentTrackIndex: 0,

      createdAt:
        "2026-07-22T20:00:00.000Z",

      updatedAt:
        "2026-07-22T20:00:00.000Z",
    },
    {
      id: "live-stage-2",

      code: "715204",
      stageCode: "715204",

      name:
        "Deep Work Together",

      hostUsername:
        "elliotlistens",

      hostName:
        "Elliot Chen",

      activity:
        "Studying and focused work",

      visibility:
        "public",

      status: "live",

      participants: [
        {
          username:
            "elliotlistens",

          displayName:
            "Elliot Chen",

          initials: "EC",

          role: "host",
        },
        {
          username:
            "samira.mp3",

          displayName:
            "Samira Brooks",

          initials: "SB",

          role:
            "collaborator",
        },
      ],

      participantCount: 2,
      listenerCount: 8,

      tracks: [
        {
          id:
            "live-2-track-1",

          title:
            "Aruarian Dance",

          artist: "Nujabes",
          source: "Spotify",
        },
        {
          id:
            "live-2-track-2",

          title:
            "Friday Morning",

          artist:
            "Khruangbin",

          source: "Spotify",
        },
        {
          id:
            "live-2-track-3",

          title:
            "Time Moves Slow",

          artist:
            "BADBADNOTGOOD",

          source: "Spotify",
        },
      ],

      currentTrackIndex: 1,

      createdAt:
        "2026-07-22T18:00:00.000Z",

      updatedAt:
        "2026-07-22T18:00:00.000Z",
    },
  ];

export async function readLiveStages(): Promise<
  LiveStage[]
> {
  const storedValue =
    await AsyncStorage.getItem(
      LIVE_STAGE_STORAGE_KEY,
    );

  if (!storedValue) {
    return DEFAULT_LIVE_STAGES.map(
      cloneLiveStage,
    );
  }

  try {
    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return DEFAULT_LIVE_STAGES.map(
        cloneLiveStage,
      );
    }

    const stages: LiveStage[] =
      [];

    for (const item of parsedValue) {
      const stage =
        normalizeLiveStage(item);

      if (stage) {
        stages.push(stage);
      }
    }

    return stages.sort(
      (first, second) =>
        getTimestamp(
          second.updatedAt,
        ) -
        getTimestamp(
          first.updatedAt,
        ),
    );
  } catch {
    return DEFAULT_LIVE_STAGES.map(
      cloneLiveStage,
    );
  }
}

export async function readLiveStage(
  stageIdOrCode: string,
): Promise<LiveStage | null> {
  const stages =
    await readLiveStages();

  return (
    stages.find(
      (stage) =>
        stage.id ===
          stageIdOrCode ||
        stage.code ===
          stageIdOrCode ||
        stage.stageCode ===
          stageIdOrCode,
    ) ?? null
  );
}

export async function getLiveStage(
  stageIdOrCode: string,
): Promise<LiveStage | null> {
  return readLiveStage(
    stageIdOrCode,
  );
}

export async function writeLiveStages(
  stages: LiveStage[],
): Promise<void> {
  const normalizedStages:
    LiveStage[] = [];

  for (const stage of stages) {
    const normalizedStage =
      normalizeLiveStage(stage);

    if (normalizedStage) {
      normalizedStages.push(
        normalizedStage,
      );
    }
  }

  await AsyncStorage.setItem(
    LIVE_STAGE_STORAGE_KEY,
    JSON.stringify(
      normalizedStages,
    ),
  );
}

export async function upsertLiveStage(
  stage: LiveStage,
): Promise<LiveStage> {
  const stages =
    await readLiveStages();

  const normalizedStage =
    normalizeLiveStage(stage);

  if (!normalizedStage) {
    throw new Error(
      "The Stage data is invalid.",
    );
  }

  const existingIndex =
    stages.findIndex(
      (item) =>
        item.id ===
        normalizedStage.id,
    );

  const updatedStages =
    existingIndex === -1
      ? [
          normalizedStage,
          ...stages,
        ]
      : stages.map((item) =>
          item.id ===
          normalizedStage.id
            ? normalizedStage
            : item,
        );

  await writeLiveStages(
    updatedStages,
  );

  return normalizedStage;
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

  const now =
    new Date().toISOString();

  const stageCode =
    createStageCode();

  const hostUsername =
    normalizeUsername(
      options.hostUsername ||
        "brandonparks",
    );

  const hostName =
    options.hostName?.trim() ||
    "Brandon Parks";

  const existingParticipants =
    Array.isArray(
      options.participants,
    )
      ? options.participants
      : [];

  const hostParticipant:
    LiveStageParticipant = {
      username:
        hostUsername,

      displayName:
        hostName,

      initials:
        getInitials(
          hostName,
        ),

      role: "host",
    };

  const participants =
    mergeParticipants([
      hostParticipant,
      ...existingParticipants,
    ]);

  const stage: LiveStage = {
    id: createStageId(),

    code: stageCode,
    stageCode,

    name:
      options.name?.trim() ||
      "Untitled Stage",

    hostUsername,
    hostName,

    activity:
      options.activity?.trim() ||
      "Listening together",

    visibility:
      options.visibility ===
      "private"
        ? "private"
        : "public",

    status: "live",

    participants,

    participantCount:
      participants.length,

    listenerCount: 0,

    tracks:
      Array.isArray(
        options.tracks,
      )
        ? options.tracks.map(
            (track) => ({
              ...track,
            }),
          )
        : [],

    currentTrackIndex: 0,

    createdAt: now,
    updatedAt: now,
  };

  await upsertLiveStage(
    stage,
  );

  return stage;
}

export async function joinLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  ...participantArguments: unknown[]
): Promise<LiveStage | null> {
  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : normalizeLiveStage(
          stageOrCode,
        );

  if (
    !stage ||
    stage.status !== "live"
  ) {
    return null;
  }

  const participant =
    readParticipantArguments(
      participantArguments,
    );

  const updatedParticipants =
    participant
      ? mergeParticipants([
          ...stage.participants,
          participant,
        ])
      : stage.participants;

  const updatedStage:
    LiveStage = {
      ...stage,

      participants:
        updatedParticipants,

      participantCount:
        updatedParticipants.length,

      listenerCount:
        participant?.role ===
        "listener"
          ? stage.listenerCount +
            1
          : stage.listenerCount,

      updatedAt:
        new Date().toISOString(),
    };

  await upsertLiveStage(
    updatedStage,
  );

  return updatedStage;
}

export async function joinLiveStageByCode(
  stageCode: string,
  ...participantArguments: unknown[]
): Promise<LiveStage | null> {
  return joinLiveStage(
    normalizeStageCode(
      stageCode,
    ),
    ...participantArguments,
  );
}

export async function leaveLiveStage(
  stageOrCode:
    | string
    | LiveStage,
  ...participantArguments: unknown[]
): Promise<LiveStage | null> {
  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : normalizeLiveStage(
          stageOrCode,
        );

  if (!stage) {
    return null;
  }

  const username =
    readUsernameArgument(
      participantArguments,
    );

  if (!username) {
    return stage;
  }

  const participant =
    stage.participants.find(
      (item) =>
        item.username ===
        username,
    );

  const updatedParticipants =
    stage.participants.filter(
      (item) =>
        item.username !==
        username,
    );

  const updatedStage:
    LiveStage = {
      ...stage,

      participants:
        updatedParticipants,

      participantCount:
        updatedParticipants.length,

      listenerCount:
        participant?.role ===
        "listener"
          ? Math.max(
              0,
              stage.listenerCount -
                1,
            )
          : stage.listenerCount,

      updatedAt:
        new Date().toISOString(),
    };

  await upsertLiveStage(
    updatedStage,
  );

  return updatedStage;
}

export async function advanceLiveStageTrack(
  stageOrCode:
    | string
    | LiveStage,
): Promise<LiveStage | null> {
  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : normalizeLiveStage(
          stageOrCode,
        );

  if (!stage) {
    return null;
  }

  const nextTrackIndex =
    stage.tracks.length === 0
      ? 0
      : (
          stage.currentTrackIndex +
          1
        ) %
        stage.tracks.length;

  const updatedStage:
    LiveStage = {
      ...stage,

      currentTrackIndex:
        nextTrackIndex,

      updatedAt:
        new Date().toISOString(),
    };

  await upsertLiveStage(
    updatedStage,
  );

  return updatedStage;
}

export async function endLiveStage(
  stageOrCode:
    | string
    | LiveStage,
): Promise<LiveStage | null> {
  const stage =
    typeof stageOrCode ===
    "string"
      ? await readLiveStage(
          stageOrCode,
        )
      : normalizeLiveStage(
          stageOrCode,
        );

  if (!stage) {
    return null;
  }

  const updatedStage:
    LiveStage = {
      ...stage,

      status: "ended",

      updatedAt:
        new Date().toISOString(),
    };

  await upsertLiveStage(
    updatedStage,
  );

  return updatedStage;
}

export async function deleteLiveStage(
  stageIdOrCode: string,
): Promise<void> {
  const stages =
    await readLiveStages();

  await writeLiveStages(
    stages.filter(
      (stage) =>
        stage.id !==
          stageIdOrCode &&
        stage.code !==
          stageIdOrCode &&
        stage.stageCode !==
          stageIdOrCode,
    ),
  );
}

export function getCurrentLiveStageTrack(
  stage: LiveStage,
): LiveStageTrack | null {
  if (
    stage.tracks.length === 0
  ) {
    return null;
  }

  const safeIndex =
    Math.min(
      Math.max(
        stage.currentTrackIndex,
        0,
      ),
      stage.tracks.length - 1,
    );

  return (
    stage.tracks[safeIndex] ??
    stage.tracks[0] ??
    null
  );
}

export function createStageId(): string {
  return `stage-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

function normalizeCreateInput(
  input:
    | CreateLiveStageInput
    | string,
  extraArguments: unknown[],
): CreateLiveStageInput {
  if (
    typeof input === "object" &&
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

function normalizeLiveStage(
  value: unknown,
): LiveStage | null {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return null;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const id =
    readString(record.id);

  const name =
    readString(record.name);

  if (!id || !name) {
    return null;
  }

  const code =
    normalizeStageCode(
      readString(
        record.code,
      ) ||
        readString(
          record.stageCode,
        ) ||
        createStageCode(),
    );

  const now =
    new Date().toISOString();

  const participants =
    readParticipants(
      record.participants,
    );

  const tracks =
    readTracks(
      record.tracks,
    );

  return {
    id,

    code,
    stageCode: code,

    name,

    hostUsername:
      normalizeUsername(
        readString(
          record.hostUsername,
        ),
      ),

    hostName:
      readString(
        record.hostName,
      ) || "Canal Host",

    activity:
      readString(
        record.activity,
      ),

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
      readNumber(
        record.participantCount,
        participants.length,
      ),

    listenerCount:
      readNumber(
        record.listenerCount,
        0,
      ),

    tracks,

    currentTrackIndex:
      readNumber(
        record.currentTrackIndex,
        0,
      ),

    createdAt:
      readString(
        record.createdAt,
      ) || now,

    updatedAt:
      readString(
        record.updatedAt,
      ) ||
      readString(
        record.createdAt,
      ) ||
      now,
  };
}

function readParticipantArguments(
  argumentsList: unknown[],
): LiveStageParticipant | null {
  const firstArgument =
    argumentsList[0];

  if (
    typeof firstArgument ===
      "object" &&
    firstArgument !== null
  ) {
    const record =
      firstArgument as Record<
        string,
        unknown
      >;

    const username =
      normalizeUsername(
        readString(
          record.username,
        ),
      );

    if (!username) {
      return null;
    }

    const displayName =
      readString(
        record.displayName,
      ) || username;

    return {
      username,
      displayName,

      initials:
        readString(
          record.initials,
        ) ||
        getInitials(
          displayName,
        ),

      role:
        readParticipantRole(
          record.role,
        ),
    };
  }

  const username =
    typeof firstArgument ===
    "string"
      ? normalizeUsername(
          firstArgument,
        )
      : "";

  if (!username) {
    return null;
  }

  const displayName =
    typeof argumentsList[1] ===
    "string"
      ? argumentsList[1].trim()
      : username;

  const role =
    argumentsList[2] ===
      "host" ||
    argumentsList[2] ===
      "collaborator"
      ? argumentsList[2]
      : "listener";

  return {
    username,
    displayName,

    initials:
      getInitials(
        displayName,
      ),

    role,
  };
}

function readUsernameArgument(
  argumentsList: unknown[],
): string {
  const firstArgument =
    argumentsList[0];

  if (
    typeof firstArgument ===
    "string"
  ) {
    return normalizeUsername(
      firstArgument,
    );
  }

  if (
    typeof firstArgument ===
      "object" &&
    firstArgument !== null
  ) {
    const record =
      firstArgument as Record<
        string,
        unknown
      >;

    return normalizeUsername(
      readString(
        record.username,
      ),
    );
  }

  return "";
}

function readParticipants(
  value: unknown,
): LiveStageParticipant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const participants:
    LiveStageParticipant[] = [];

  for (const item of value) {
    const participant =
      readParticipantArguments([
        item,
      ]);

    if (participant) {
      participants.push(
        participant,
      );
    }
  }

  return mergeParticipants(
    participants,
  );
}

function mergeParticipants(
  participants:
    LiveStageParticipant[],
): LiveStageParticipant[] {
  const participantMap =
    new Map<
      string,
      LiveStageParticipant
    >();

  for (const participant of participants) {
    participantMap.set(
      participant.username,
      participant,
    );
  }

  return Array.from(
    participantMap.values(),
  );
}

function readTracks(
  value: unknown,
): LiveStageTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tracks:
    LiveStageTrack[] = [];

  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    const title =
      readString(
        record.title,
      );

    const artist =
      readString(
        record.artist,
      );

    if (!title || !artist) {
      continue;
    }

    const track:
      LiveStageTrack = {
        id:
          readString(
            record.id,
          ) ||
          `stage-track-${Date.now()}-${tracks.length}`,

        title,
        artist,

        source:
          readString(
            record.source,
          ) || "Canal",
      };

    const spotifyUrl =
      readOptionalString(
        record.spotifyUrl,
      );

    if (spotifyUrl) {
      track.spotifyUrl =
        spotifyUrl;
    }

    tracks.push(track);
  }

  return tracks;
}

function readParticipantRole(
  value: unknown,
): LiveStageParticipant["role"] {
  if (
    value === "host" ||
    value === "collaborator"
  ) {
    return value;
  }

  return "listener";
}

function readNumber(
  value: unknown,
  fallback: number,
): number {
  return typeof value ===
      "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function readString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function readOptionalString(
  value: unknown,
): string | undefined {
  const cleanedValue =
    readString(value);

  return cleanedValue ||
    undefined;
}

function normalizeStageCode(
  value: string,
): string {
  const digits =
    value.replace(/\D/g, "");

  if (digits.length >= 6) {
    return digits.slice(0, 6);
  }

  return value.trim();
}

function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
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

function getTimestamp(
  value: string,
): number {
  const timestamp =
    new Date(value).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : 0;
}

function getInitials(
  value: string,
): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) =>
        word
          .charAt(0)
          .toUpperCase(),
      )
      .join("") || "CA"
  );
}