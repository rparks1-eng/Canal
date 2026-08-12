import {
  createMusicProviderRegistry,
} from "./music-provider";

import {
  spotifyMusicProvider,
} from "./music-providers/spotify";

import {
  appleMusicProvider,
} from "./music-providers/apple-music";

export const musicProviders =
  createMusicProviderRegistry([
    spotifyMusicProvider,
    appleMusicProvider,
  ]);
