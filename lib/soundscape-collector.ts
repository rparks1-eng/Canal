import {
  readLiveStages,
} from "./live-stages";

import {
  readScenes,
} from "./scenes";

import type {
  StoredScene,
} from "./scenes";

import {
  readSnapshots,
} from "./snapshots";

import {
  readSpotifyLibrarySnapshot,
} from "./spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

import {
  supabase,
} from "./supabase";

import type {
  SoundscapeAggregationInput,
  SoundscapePeriod,
} from "./soundscape-types";

function splitValues(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;/|]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

async function assertCurrentAccount(expectedUserId: string): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user || user.id !== expectedUserId) {
    throw Object.assign(
      new Error("The Canal account changed while Soundscape history was being collected."),
      { code: "CANAL_SOUNDSCAPE_ACCOUNT_CHANGED" },
    );
  }
}

export function deriveSoundscapeSongDna(
  scenes: StoredScene[],
  spotify: SpotifyLibrarySnapshot | null,
  observedAt: string,
): SoundscapeAggregationInput["songDna"] {
  if (!spotify) return [];
  const spotifyTracks = [
    ...spotify.discoveryTracks,
    ...spotify.recentTracks,
    ...spotify.savedTracks,
    ...spotify.playlistTracks,
  ];
  const uniqueTracks = Array.from(
    new Map(spotifyTracks.filter((track) => track.id).map((track) => [track.id, track])).values(),
  ).slice(0, 1000);

  return uniqueTracks.map((track) => {
    const matchingScenes = scenes.filter((scene) => scene.tracks.some((item) => item.id === track.id));
    const sceneMoods = matchingScenes.flatMap((scene) => splitValues(scene.emotions));
    const sceneGenres = matchingScenes.flatMap((scene) => splitValues(scene.genres));
    return {
      trackId: track.id,
      title: track.name,
      artist: track.artists.map((artist) => artist.name).filter(Boolean).join(", "),
      genres: Array.from(new Set([...(spotify.trackGenres[track.id] ?? []), ...sceneGenres])).slice(0, 12),
      moods: Array.from(new Set(sceneMoods)).slice(0, 12),
      decade: track.album?.release_date?.slice(0, 4).match(/^\d{4}$/u)
        ? `${track.album.release_date.slice(0, 3)}0s`
        : null,
      playCount: matchingScenes.reduce((count, scene) => count + Math.max(1, scene.playCount ?? 0), 0),
      observedAt,
    };
  });
}

export async function collectSoundscapeAggregationInput(
  expectedUserId: string,
  period: SoundscapePeriod,
  generatedAt = new Date().toISOString(),
): Promise<SoundscapeAggregationInput> {
  const accountId = expectedUserId.trim();
  if (!accountId) throw new Error("A signed-in Canal account is required.");
  await assertCurrentAccount(accountId);

  const [scenes, stages, snapshots, spotify, sessionHistory] = await Promise.all([
    readScenes(),
    readLiveStages(),
    readSnapshots(),
    readSpotifyLibrarySnapshot(),
    readAccountOwnedSoundscapeHistory(accountId),
  ]);
  await assertCurrentAccount(accountId);

  const input: SoundscapeAggregationInput = {
    accountId,
    period,
    generatedAt,
    scenes: scenes.slice(0, 500).map((scene) => ({
      id: scene.id,
      name: scene.name,
      activity: scene.activity,
      moods: splitValues(scene.emotions),
      genres: splitValues(scene.genres),
      trackIds: scene.tracks.map((track) => track.id).filter(Boolean).slice(0, 100),
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      playCount: scene.playCount ?? 0,
      favorite: scene.favorite === true,
    })),
    stages: stages
      .filter((stage) => stage.membershipRole !== null)
      .slice(0, 200)
      .map((stage) => ({
        id: stage.id,
        name: stage.name,
        activity: stage.activity,
        participantCount: stage.participantCount,
        trackIds: stage.tracks.map((track) => track.id).filter(Boolean).slice(0, 100),
        createdAt: stage.createdAt,
        endedAt: stage.endedAt ?? null,
        role: stage.membershipRole ?? "listener",
      })),
    /* Candidate-pool membership is not evidence that the user discovered a track. */
    discoveries: [],
    songDna: deriveSoundscapeSongDna(scenes, spotify, spotify?.syncedAt ?? generatedAt),
    listening: sessionHistory.listening.slice(0, 500).map((entry) => ({
      id: entry.id,
      sceneId: entry.sceneId,
      sceneName: entry.sceneName,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt ?? null,
      tracksPlayed: entry.tracksPlayed,
      durationSeconds: entry.durationSeconds,
    })),
    feedback: sessionHistory.feedback.slice(0, 500).map((entry) => ({
      id: entry.id,
      sceneId: entry.sceneId,
      rating: entry.rating,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    snapshots: snapshots.slice(0, 250).map((snapshot) => ({
      snapshotId: snapshot.id,
      sourceId: snapshot.sceneId,
      createdAt: snapshot.createdAt,
      mediaType: "none",
      compositionState: "none",
      shareable: snapshot.visibility === "public",
    })),
  };

  await assertCurrentAccount(accountId);
  return input;
}
import { readAccountOwnedSoundscapeHistory } from "./canal-session";
