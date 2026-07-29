import {
  createMusicProviderRegistry,
} from "./music-provider";

import {
  spotifyMusicProvider,
} from "./music-providers/spotify";

export const musicProviders =
  createMusicProviderRegistry([
    spotifyMusicProvider,
  ]);
