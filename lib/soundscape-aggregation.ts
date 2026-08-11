import {
  SOUNDSCAPE_SCHEMA_VERSION,
} from "./soundscape-types";

import type {
  SoundscapeAggregationInput,
  SoundscapeArchive,
  SoundscapeCount,
  SoundscapePeriod,
  SoundscapePeriodKind,
  SoundscapeShareProjection,
} from "./soundscape-types";

const MAX_COUNTS = 12;
const MAX_SCENES = 40;
const MAX_STAGES = 40;
const MAX_DISCOVERIES = 50;
const MAX_SONG_DNA = 50;
const MAX_PLAYBACK = 100;
const MAX_FEEDBACK = 100;
const MAX_SNAPSHOTS = 50;
const MINIMUM_HISTORY_EVENTS = 3;

function isoDate(date: Date): string {
  return date.toISOString();
}

export function soundscapePeriodForDate(
  kind: SoundscapePeriodKind,
  value: Date,
): SoundscapePeriod {
  const date =
    new Date(value.getTime());

  if (!Number.isFinite(date.getTime())) {
    throw new Error("A valid date is required to build a Soundscape period.");
  }

  const year = date.getUTCFullYear();

  if (kind === "year") {
    return {
      kind,
      key: String(year),
      startsAt: isoDate(new Date(Date.UTC(year, 0, 1))),
      endsAt: isoDate(new Date(Date.UTC(year + 1, 0, 1))),
    };
  }

  const seasonIndex = Math.floor(date.getUTCMonth() / 3);
  const seasonNames = ["winter", "spring", "summer", "fall"] as const;
  return {
    kind,
    key: `${year}-${seasonNames[seasonIndex]}`,
    startsAt: isoDate(new Date(Date.UTC(year, seasonIndex * 3, 1))),
    endsAt: isoDate(new Date(Date.UTC(year, (seasonIndex + 1) * 3, 1))),
  };
}

function inPeriod(
  value: string,
  period: SoundscapePeriod,
): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    timestamp >= Date.parse(period.startsAt) &&
    timestamp < Date.parse(period.endsAt);
}

function boundedText(value: string, maximum = 120): string {
  return value.trim().slice(0, maximum);
}

function boundedUnique(values: string[], maximum = 12): string[] {
  return Array.from(
    new Set(values.map((value) => boundedText(value, 80)).filter(Boolean)),
  ).slice(0, maximum);
}

function counts(values: string[]): SoundscapeCount[] {
  const totals = new Map<string, { label: string; count: number }>();
  for (const rawValue of values) {
    const label = boundedText(rawValue, 80);
    if (!label) continue;
    const key = label.toLocaleLowerCase("en-US");
    const current = totals.get(key);
    totals.set(key, {
      label: current?.label ?? label,
      count: (current?.count ?? 0) + 1,
    });
  }
  return Array.from(totals, ([key, value]) => ({ key, ...value }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
    .slice(0, MAX_COUNTS);
}

function newestFirst<T>(
  values: T[],
  date: (value: T) => string,
): T[] {
  return [...values].sort(
    (first, second) => Date.parse(date(second)) - Date.parse(date(first)),
  );
}

export function buildSoundscapeShareProjection(
  archive: Omit<SoundscapeArchive, "shareProjection">,
): SoundscapeShareProjection {
  return {
    schemaVersion: SOUNDSCAPE_SCHEMA_VERSION,
    period: archive.period,
    historyState: archive.historyState,
    insufficientReason: archive.insufficientReason,
    totals: archive.content.totals,
    topActivities: archive.content.topActivities.slice(0, 5),
    topMoods: archive.content.topMoods.slice(0, 5),
    topGenres: archive.content.topGenres.slice(0, 5),
    topArtists: archive.content.topArtists.slice(0, 5),
    decades: archive.content.decades.slice(0, 5),
    highlights: {
      sceneNames: archive.content.sceneEvolution.slice(0, 5).map((scene) => scene.name),
      stageNames: archive.content.stageArchive.slice(0, 5).map((stage) => stage.name),
      discoveries: archive.content.discoveries.slice(0, 5).map(({ title, artist }) => ({ title, artist })),
    },
  };
}

export function buildSoundscapeArchive(
  input: SoundscapeAggregationInput,
  version = 1,
): SoundscapeArchive {
  const accountId = input.accountId.trim();
  if (!accountId) {
    throw new Error("A Soundscape archive requires an account ID.");
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("A Soundscape archive version must be a positive integer.");
  }
  if (
    !input.period.key.trim() ||
    !Number.isFinite(Date.parse(input.period.startsAt)) ||
    !Number.isFinite(Date.parse(input.period.endsAt)) ||
    Date.parse(input.period.startsAt) >= Date.parse(input.period.endsAt)
  ) {
    throw new Error("A Soundscape archive requires a valid bounded period.");
  }

  const scenes = input.scenes.filter((scene) => inPeriod(scene.updatedAt, input.period));
  const stages = input.stages.filter((stage) => inPeriod(stage.endedAt ?? stage.createdAt, input.period));
  const discoveries = input.discoveries.filter((item) => inPeriod(item.discoveredAt, input.period));
  const listening = input.listening.filter((item) => inPeriod(item.completedAt ?? item.startedAt, input.period));
  const feedback = input.feedback.filter((item) => inPeriod(item.createdAt, input.period));
  const snapshots = input.snapshots.filter((item) => inPeriod(item.createdAt, input.period));
  const songDna = input.songDna.filter((item) => inPeriod(item.observedAt, input.period));
  const eventCount = scenes.length + stages.length + discoveries.length + listening.length + feedback.length;
  const historyState = eventCount >= MINIMUM_HISTORY_EVENTS ? "ready" : "insufficient_history";
  const insufficientReason = historyState === "ready"
    ? null
    : "Keep listening, creating Scenes, or joining Stages to build this Soundscape.";

  const content = {
    totals: {
      scenes: scenes.length,
      stages: stages.length,
      discoveries: discoveries.length,
      listeningSessions: listening.length,
      listeningSeconds: listening.reduce((total, item) => total + Math.max(0, item.durationSeconds), 0),
      feedbackEvents: feedback.length,
      finishedSnapshots: snapshots.filter((item) => item.compositionState === "ready").length,
    },
    topActivities: counts([...scenes.map((scene) => scene.activity), ...stages.map((stage) => stage.activity)]),
    topMoods: counts(scenes.flatMap((scene) => scene.moods)),
    topGenres: counts([
      ...scenes.flatMap((scene) => scene.genres),
      ...songDna.flatMap((track) => track.genres),
    ]),
    topArtists: counts(songDna.flatMap((track) => Array(Math.max(1, Math.min(track.playCount, 20))).fill(track.artist) as string[])),
    decades: counts(songDna.map((track) => track.decade ?? "").filter(Boolean)),
    sceneEvolution: newestFirst(scenes, (scene) => scene.updatedAt).slice(0, MAX_SCENES).map((scene) => ({
      sceneId: boundedText(scene.id),
      name: boundedText(scene.name),
      activity: boundedText(scene.activity, 80),
      moods: boundedUnique(scene.moods),
      genres: boundedUnique(scene.genres),
      createdAt: scene.createdAt,
      lastChangedAt: scene.updatedAt,
      playCount: Math.max(0, Math.round(scene.playCount)),
      favorite: scene.favorite,
    })),
    stageArchive: newestFirst(stages, (stage) => stage.endedAt ?? stage.createdAt).slice(0, MAX_STAGES).map((stage) => ({
      stageId: boundedText(stage.id),
      name: boundedText(stage.name),
      activity: boundedText(stage.activity, 80),
      participantCount: Math.max(0, Math.round(stage.participantCount)),
      trackCount: Math.min(100, new Set(stage.trackIds.filter(Boolean)).size),
      createdAt: stage.createdAt,
      endedAt: stage.endedAt,
      role: stage.role,
    })),
    discoveries: newestFirst(discoveries, (item) => item.discoveredAt).slice(0, MAX_DISCOVERIES).map((item) => ({
      ...item,
      trackId: boundedText(item.trackId),
      title: boundedText(item.title),
      artist: boundedText(item.artist),
    })),
    songDna: [...songDna].sort((a, b) => b.playCount - a.playCount).slice(0, MAX_SONG_DNA).map((track) => ({
      ...track,
      trackId: boundedText(track.trackId),
      title: boundedText(track.title),
      artist: boundedText(track.artist),
      genres: boundedUnique(track.genres),
      moods: boundedUnique(track.moods),
      decade: track.decade ? boundedText(track.decade, 16) : null,
      playCount: Math.max(0, Math.round(track.playCount)),
    })),
    playbackTrail: newestFirst(listening, (item) => item.completedAt ?? item.startedAt).slice(0, MAX_PLAYBACK).map((item) => ({
      sessionId: boundedText(item.id),
      sceneId: boundedText(item.sceneId),
      sceneName: boundedText(item.sceneName),
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      tracksPlayed: Math.max(0, Math.round(item.tracksPlayed)),
      durationSeconds: Math.max(0, Math.round(item.durationSeconds)),
    })),
    feedback: newestFirst(feedback, (item) => item.createdAt).slice(0, MAX_FEEDBACK).map((item) => ({
      ...item,
      id: boundedText(item.id),
      sceneId: boundedText(item.sceneId),
      rating: boundedText(item.rating, 48),
      note: boundedText(item.note, 300),
    })),
    snapshots: newestFirst(snapshots, (item) => item.createdAt).slice(0, MAX_SNAPSHOTS).map((item) => ({
      ...item,
      snapshotId: boundedText(item.snapshotId),
      sourceId: boundedText(item.sourceId),
    })),
  };

  const archiveWithoutProjection: Omit<SoundscapeArchive, "shareProjection"> = {
    schemaVersion: SOUNDSCAPE_SCHEMA_VERSION,
    archiveId: null,
    accountId,
    period: input.period,
    version,
    historyState,
    insufficientReason,
    generatedAt: input.generatedAt,
    refreshedAt: input.generatedAt,
    visibility: "private",
    content,
  };

  return {
    ...archiveWithoutProjection,
    shareProjection: buildSoundscapeShareProjection(archiveWithoutProjection),
  };
}
