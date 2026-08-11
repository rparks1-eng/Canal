export const SOUNDSCAPE_SCHEMA_VERSION = 1;

export type SoundscapePeriodKind =
  | "year"
  | "season";

export type SoundscapePeriod = {
  kind: SoundscapePeriodKind;
  key: string;
  startsAt: string;
  endsAt: string;
};

export type SoundscapeHistoryState =
  | "ready"
  | "insufficient_history";

export type SoundscapeShareVisibility =
  | "private"
  | "connections"
  | "public";

export type SoundscapeCount = {
  key: string;
  label: string;
  count: number;
};

export type SoundscapeSceneInput = {
  id: string;
  name: string;
  activity: string;
  moods: string[];
  genres: string[];
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  playCount: number;
  favorite: boolean;
};

export type SoundscapeStageInput = {
  id: string;
  name: string;
  activity: string;
  participantCount: number;
  trackIds: string[];
  createdAt: string;
  endedAt: string | null;
  role: "host" | "collaborator" | "listener";
};

export type SoundscapeDiscoveryInput = {
  trackId: string;
  title: string;
  artist: string;
  discoveredAt: string;
  source: "scene" | "stage" | "search" | "recommendation";
  saved: boolean;
};

export type SoundscapeSongDnaInput = {
  trackId: string;
  title: string;
  artist: string;
  genres: string[];
  moods: string[];
  decade: string | null;
  playCount: number;
  observedAt: string;
};

export type SoundscapeListeningInput = {
  id: string;
  sceneId: string;
  sceneName: string;
  startedAt: string;
  completedAt: string | null;
  tracksPlayed: number;
  durationSeconds: number;
};

export type SoundscapeFeedbackInput = {
  id: string;
  sceneId: string;
  rating: string;
  note: string;
  createdAt: string;
};

export type SoundscapeSnapshotMediaInput = {
  snapshotId: string;
  sourceId: string;
  createdAt: string;
  mediaType: "image" | "video" | "none";
  compositionState: "ready" | "draft" | "failed" | "none";
  shareable: boolean;
};

export type SoundscapeAggregationInput = {
  accountId: string;
  period: SoundscapePeriod;
  generatedAt: string;
  scenes: SoundscapeSceneInput[];
  stages: SoundscapeStageInput[];
  discoveries: SoundscapeDiscoveryInput[];
  songDna: SoundscapeSongDnaInput[];
  listening: SoundscapeListeningInput[];
  feedback: SoundscapeFeedbackInput[];
  snapshots: SoundscapeSnapshotMediaInput[];
};

export type SoundscapeSceneEvolution = {
  sceneId: string;
  name: string;
  activity: string;
  moods: string[];
  genres: string[];
  createdAt: string;
  lastChangedAt: string;
  playCount: number;
  favorite: boolean;
};

export type SoundscapeStageArchive = {
  stageId: string;
  name: string;
  activity: string;
  participantCount: number;
  trackCount: number;
  createdAt: string;
  endedAt: string | null;
  role: "host" | "collaborator" | "listener";
};

export type SoundscapePlaybackTrail = {
  sessionId: string;
  sceneId: string;
  sceneName: string;
  startedAt: string;
  completedAt: string | null;
  tracksPlayed: number;
  durationSeconds: number;
};

export type SoundscapeArchiveContent = {
  totals: {
    scenes: number;
    stages: number;
    discoveries: number;
    listeningSessions: number;
    listeningSeconds: number;
    feedbackEvents: number;
    finishedSnapshots: number;
  };
  topActivities: SoundscapeCount[];
  topMoods: SoundscapeCount[];
  topGenres: SoundscapeCount[];
  topArtists: SoundscapeCount[];
  decades: SoundscapeCount[];
  sceneEvolution: SoundscapeSceneEvolution[];
  stageArchive: SoundscapeStageArchive[];
  discoveries: SoundscapeDiscoveryInput[];
  songDna: SoundscapeSongDnaInput[];
  playbackTrail: SoundscapePlaybackTrail[];
  feedback: SoundscapeFeedbackInput[];
  snapshots: SoundscapeSnapshotMediaInput[];
};

export type SoundscapeShareProjection = {
  schemaVersion: typeof SOUNDSCAPE_SCHEMA_VERSION;
  period: SoundscapePeriod;
  historyState: SoundscapeHistoryState;
  insufficientReason: string | null;
  totals: SoundscapeArchiveContent["totals"];
  topActivities: SoundscapeCount[];
  topMoods: SoundscapeCount[];
  topGenres: SoundscapeCount[];
  topArtists: SoundscapeCount[];
  decades: SoundscapeCount[];
  highlights: {
    sceneNames: string[];
    stageNames: string[];
    discoveries: {
      title: string;
      artist: string;
    }[];
  };
};

export type SoundscapeArchive = {
  schemaVersion: typeof SOUNDSCAPE_SCHEMA_VERSION;
  archiveId: string | null;
  accountId: string;
  period: SoundscapePeriod;
  version: number;
  historyState: SoundscapeHistoryState;
  insufficientReason: string | null;
  generatedAt: string;
  refreshedAt: string;
  visibility: SoundscapeShareVisibility;
  content: SoundscapeArchiveContent;
  shareProjection: SoundscapeShareProjection;
};

export type SoundscapeRefreshStatus =
  | "idle"
  | "refreshing"
  | "ready"
  | "failed";

export type SoundscapeRefreshState = {
  accountId: string;
  period: SoundscapePeriod;
  status: SoundscapeRefreshStatus;
  requestedAt: string | null;
  completedAt: string | null;
  lastArchiveVersion: number | null;
  errorCode: string | null;
};

export type SoundscapeCommonGroundStatus =
  | "ineligible"
  | "awaiting_you"
  | "awaiting_peer"
  | "insufficient_history"
  | "approved";

export type SoundscapeCommonGroundState = {
  accountId: string;
  peerUserId: string;
  mutualConnection: boolean;
  approvedByAccount: boolean;
  approvedByPeer: boolean;
  status: SoundscapeCommonGroundStatus;
};

export type SoundscapeCommonGroundProjection = {
  status: SoundscapeCommonGroundStatus;
  period: SoundscapePeriod;
  members: {
    userId: string;
    soundscape: SoundscapeShareProjection;
  }[];
};
