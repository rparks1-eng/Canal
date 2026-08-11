import type { SceneStudioScope } from "./scene-studio-scope";
import type { SceneTrack, StoredScene } from "./scenes";
import { upsertSceneForScope } from "./scenes";

const TRACK_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/u;
const HTTPS_URL_PATTERN = /^https:\/\//u;

export type SongSceneActionInput = Readonly<{
  trackId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  spotifyUrl?: string;
}>;

export function normalizeSongSceneActionInput(
  input: Partial<SongSceneActionInput>,
): SongSceneActionInput | null {
  const trackId = typeof input.trackId === "string" ? input.trackId.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 300) : "";
  const artist = typeof input.artist === "string" ? input.artist.trim().slice(0, 300) : "";
  if (!TRACK_ID_PATTERN.test(trackId) || !title || !artist) return null;

  const artworkUrl = typeof input.artworkUrl === "string" && HTTPS_URL_PATTERN.test(input.artworkUrl)
    ? input.artworkUrl.slice(0, 2048)
    : undefined;
  const spotifyUrl = typeof input.spotifyUrl === "string" && HTTPS_URL_PATTERN.test(input.spotifyUrl)
    ? input.spotifyUrl.slice(0, 2048)
    : undefined;

  return Object.freeze({ trackId, title, artist, artworkUrl, spotifyUrl });
}

export function songSceneActionParams(input: SongSceneActionInput): Record<string, string> {
  return {
    trackId: input.trackId,
    trackTitle: input.title,
    artistName: input.artist,
    ...(input.artworkUrl ? { artworkUrl: input.artworkUrl } : {}),
    ...(input.spotifyUrl ? { spotifyUrl: input.spotifyUrl } : {}),
  };
}

export function sceneCanAcceptSong(scene: StoredScene, trackId: string): "ready" | "duplicate" | "full" | "read-only" {
  if (scene.libraryType === "saved") return "read-only";
  if (scene.tracks.some((track) => track.id === trackId)) return "duplicate";
  if (scene.tracks.length >= 100) return "full";
  return "ready";
}

export async function addSongToScene(
  scene: StoredScene,
  song: SongSceneActionInput,
  scope: SceneStudioScope,
  currentScope: () => SceneStudioScope | null,
): Promise<StoredScene> {
  const availability = sceneCanAcceptSong(scene, song.trackId);
  if (availability !== "ready") {
    throw new Error(
      availability === "duplicate"
        ? "This song is already in the Scene."
        : availability === "full"
          ? "This Scene already has the maximum 100 tracks."
          : "Saved public Scenes are read-only. Duplicate one before adding songs.",
    );
  }

  const track: SceneTrack = {
    id: song.trackId,
    title: song.title,
    artist: song.artist,
    source: song.spotifyUrl ? "Spotify" : "Canal",
    spotifyUrl: song.spotifyUrl,
    spotifyUri: song.spotifyUrl ? `spotify:track:${song.trackId}` : undefined,
    imageUrl: song.artworkUrl,
  };

  return upsertSceneForScope(
    { ...scene, tracks: [...scene.tracks, track] },
    scope,
    currentScope,
  );
}
