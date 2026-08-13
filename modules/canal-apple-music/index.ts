import { requireOptionalNativeModule } from "expo";

export type CanalAppleMusicAuthorizationStatus =
  | "authorized"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unavailable";

export type CanalAppleMusicStatus = {
  authorizationStatus: CanalAppleMusicAuthorizationStatus;
  canPlayCatalogContent: boolean;
  hasCloudLibraryEnabled: boolean;
};

export type CanalAppleMusicTrack = {
  id: string;
  name: string;
  artistName: string;
  albumName: string | null;
  artworkUrl: string | null;
  durationMs: number;
  explicit: boolean;
  genres: string[];
  url: string | null;
  isrc?: string | null;
  libraryAddedAt?: string | null;
  lastPlayedAt?: string | null;
  playCount?: number | null;
  isFavorite?: boolean;
};

export type CanalAppleMusicAlbum = {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string | null;
  genres: string[];
  trackCount: number;
  releaseDate: string | null;
  url: string | null;
  isFavorite?: boolean;
};

export type CanalAppleMusicArtist = {
  id: string;
  name: string;
  artworkUrl: string | null;
  genres: string[];
  url: string | null;
  isFavorite?: boolean;
};

export type CanalAppleMusicPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  artworkUrl: string | null;
  url: string | null;
};

export type CanalAppleMusicLibrary = {
  songs: CanalAppleMusicTrack[];
  playlists: CanalAppleMusicPlaylist[];
  playlistTracks?: CanalAppleMusicTrack[];
  albums?: CanalAppleMusicAlbum[];
  artists?: CanalAppleMusicArtist[];
  recentSongs?: CanalAppleMusicTrack[];
  songsTruncated?: boolean;
  playlistsTruncated?: boolean;
  playlistTracksTruncated?: boolean;
  albumsTruncated?: boolean;
  artistsTruncated?: boolean;
};

export type CanalAppleMusicPlaylistReceipt = {
  id: string;
  name: string;
  url: string | null;
  trackCount: number;
};

type CanalAppleMusicNativeModule = {
  getStatus(): Promise<CanalAppleMusicStatus>;
  requestAuthorization(): Promise<CanalAppleMusicStatus>;
  searchCatalog(query: string, limit: number): Promise<CanalAppleMusicTrack[]>;
  readLibrary(songLimit: number, playlistLimit: number): Promise<CanalAppleMusicLibrary>;
  createPlaylist(name: string, description: string, songIds: string[]): Promise<CanalAppleMusicPlaylistReceipt>;
};

const nativeModule =
  requireOptionalNativeModule<CanalAppleMusicNativeModule>(
    "CanalAppleMusic",
  );

export function isCanalAppleMusicAvailable(): boolean {
  return Boolean(nativeModule);
}

function requireNativeModule(): CanalAppleMusicNativeModule {
  if (!nativeModule) {
    throw new Error(
      "Apple Music is available in Canal's iPhone and iPad app after installing the current native build.",
    );
  }

  return nativeModule;
}

export const CanalAppleMusic = {
  getStatus: () => requireNativeModule().getStatus(),
  requestAuthorization: () => requireNativeModule().requestAuthorization(),
  searchCatalog: (query: string, limit: number) =>
    requireNativeModule().searchCatalog(query, limit),
  readLibrary: (songLimit: number, playlistLimit: number) =>
    requireNativeModule().readLibrary(songLimit, playlistLimit),
  createPlaylist: (name: string, description: string, songIds: string[]) =>
    requireNativeModule().createPlaylist(name, description, songIds),
};
