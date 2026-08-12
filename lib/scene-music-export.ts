import type {
  MusicItemReference,
  MusicProviderId,
  MusicSceneExportReceipt,
  MusicSceneExportRequest,
} from "./music-provider-model";

import type {
  MusicProviderRegistry,
} from "./music-provider";

import {
  musicProviders,
} from "./music-services";

import type {
  StoredScene,
} from "./scenes";

import {
  normalizeSpotifyTrackLinks,
} from "./spotify-track-links";

export type SceneMusicExportOptions = {
  providerId:
    MusicProviderId;
  description?: string;
};

export function sceneMusicExportRequest(
  scene: StoredScene,
  options:
    SceneMusicExportOptions,
): MusicSceneExportRequest {
  if (
    scene.tracks.length ===
    0
  ) {
    throw new Error(
      "This Scene has no tracks to export.",
    );
  }

  return {
    name:
      scene.name,
    activity:
      scene.activity,
    description:
      options.description,
    tracks:
      scene.tracks.map(
        (track) =>
          musicReferenceFromLegacySceneTrack(
            track,
            options
              .providerId,
          ),
      ),
  };
}

export async function exportSceneToMusicProvider(
  scene: StoredScene,
  options:
    SceneMusicExportOptions,
  registry:
    MusicProviderRegistry =
      musicProviders,
): Promise<
  MusicSceneExportReceipt
> {
  return registry
    .require(
      options.providerId,
      "scene-export",
    )
    .exportScene(
      sceneMusicExportRequest(
        scene,
        options,
      ),
    );
}

function musicReferenceFromLegacySceneTrack(
  track:
    StoredScene["tracks"][number],
  providerId:
    MusicProviderId,
): MusicItemReference {
  if (
    providerId ===
    "spotify"
  ) {
    const links =
      normalizeSpotifyTrackLinks(
        track.spotifyUri,
        track.spotifyUrl,
      );
    const canonicalId =
      links.spotifyUri
        ?.split(
          ":",
        )
        .at(
          -1,
        );

    return {
      providerId,
      itemId:
        canonicalId ??
        track.id,
      ...(links.spotifyUri
        ? {
            uri:
              links.spotifyUri,
          }
        : {}),
      ...(links.spotifyUrl
        ? {
            webUrl:
              links.spotifyUrl,
          }
        : {}),
    };
  }

  return {
    providerId,
    itemId:
      track.id,
    name:
      track.title,
    artistNames: [
      track.artist,
    ],
  };
}
