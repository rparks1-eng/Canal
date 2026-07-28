import {
    getSpotifyCachedJson,
} from "./spotify-cache";
import {
    getValidSpotifyAccessToken,
} from "./spotify-session";

const SPOTIFY_API_BASE =
  "https://api.spotify.com/v1";

export type ExportableTrack = {
  title: string;
  artist: string;
  spotifyUri?: string;
};

export type SpotifyExportResult = {
  playlistId: string;
  playlistUrl: string;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedTracks: ExportableTrack[];
};

type SpotifySearchTrack = {
  uri?: string;
  name?: string;
  artists?: {
    name?: string;
  }[];
};

type SpotifyTrackSearchResponse = {
  tracks?: {
    items?: SpotifySearchTrack[];
  };
};

type SpotifyPlaylistResponse = {
  id: string;
  external_urls?: {
    spotify?: string;
  };
};

export async function exportSceneToSpotify({
  sceneName,
  visibility,
  tracks,
}: {
  sceneName: string;
  visibility:
    | "public"
    | "private";
  tracks: ExportableTrack[];
}): Promise<SpotifyExportResult> {
  if (tracks.length === 0) {
    throw new Error(
      "This Scene does not contain any tracks.",
    );
  }

  const matchedUris: string[] =
    [];

  const unmatchedTracks:
    ExportableTrack[] = [];

  for (const track of tracks) {
    if (track.spotifyUri) {
      matchedUris.push(
        track.spotifyUri,
      );
      continue;
    }

    const spotifyUri =
      await searchSpotifyTrackUri(
        track,
      );

    if (spotifyUri) {
      matchedUris.push(
        spotifyUri,
      );
    } else {
      unmatchedTracks.push(
        track,
      );
    }
  }

  if (matchedUris.length === 0) {
    throw new Error(
      "Canal could not match any Scene tracks on Spotify.",
    );
  }

  const accessToken =
    await getValidSpotifyAccessToken();

  const playlistResponse =
    await fetch(
      `${SPOTIFY_API_BASE}/me/playlists`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          name: sceneName,
          public:
            visibility === "public",
          collaborative: false,
          description:
            "Created from a Canal Scene.",
        }),
      },
    );

  if (!playlistResponse.ok) {
    throw new Error(
      `Spotify could not create the playlist. Status ${playlistResponse.status}.`,
    );
  }

  const playlist =
    (await playlistResponse.json()) as
      SpotifyPlaylistResponse;

  const addItemsResponse =
    await fetch(
      `${SPOTIFY_API_BASE}/playlists/${playlist.id}/items`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          uris: matchedUris.slice(
            0,
            100,
          ),
        }),
      },
    );

  if (!addItemsResponse.ok) {
    throw new Error(
      `Spotify created the playlist but could not add its tracks. Status ${addItemsResponse.status}.`,
    );
  }

  return {
    playlistId: playlist.id,
    playlistUrl:
      playlist.external_urls
        ?.spotify ??
      `https://open.spotify.com/playlist/${playlist.id}`,
    matchedCount:
      matchedUris.length,
    unmatchedCount:
      unmatchedTracks.length,
    unmatchedTracks,
  };
}

async function searchSpotifyTrackUri(
  track: ExportableTrack,
): Promise<string | null> {
  const query = [
    `track:${track.title}`,
    track.artist
      ? `artist:${track.artist}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const path =
    "/search?" +
    new URLSearchParams({
      q: query,
      type: "track",
      limit: "1",
    }).toString();

  const response =
    await getSpotifyCachedJson<
      SpotifyTrackSearchResponse
    >(path, {
      fallbackTtlMs:
        30 * 60 * 1000,
    });

  return (
    response.tracks
      ?.items?.[0]?.uri ??
    null
  );
}