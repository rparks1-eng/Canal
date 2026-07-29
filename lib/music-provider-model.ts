export type MusicProviderId =
  | "spotify"
  | "apple-music";

export type MusicProviderCapability =
  | "catalog-search"
  | "library-sync"
  | "scene-export";

export type MusicProviderDescriptor = {
  id: MusicProviderId;
  displayName: string;
  capabilities:
    readonly MusicProviderCapability[];
};

export type MusicItemReference = {
  providerId: MusicProviderId;
  itemId: string;
  uri?: string;
  webUrl?: string;
};

export type MusicArtistSummary = {
  artistId?: string;
  name: string;
};

export type MusicCatalogTrack = {
  reference:
    MusicItemReference;
  name: string;
  durationMs: number;
  explicit: boolean;
  artists:
    readonly MusicArtistSummary[];
  album?: {
    albumId?: string;
    name?: string;
  };
};

export type MusicLibraryArtist = {
  reference: {
    providerId: MusicProviderId;
    artistId: string;
  };
  name: string;
  genres:
    readonly string[];
  imageUrl?: string;
};

export type MusicLibraryPlaylist = {
  reference: {
    providerId: MusicProviderId;
    playlistId: string;
    uri?: string;
    webUrl?: string;
  };
  name: string;
  trackCount: number;
};

export type MusicLibrarySnapshot = {
  providerId: MusicProviderId;
  syncedAt: string;
  account: {
    accountId: string;
    displayName: string;
    avatarUrl?: string;
  };
  topArtists:
    readonly MusicLibraryArtist[];
  topTracks:
    readonly MusicCatalogTrack[];
  recentTracks:
    readonly MusicCatalogTrack[];
  savedTracks:
    readonly MusicCatalogTrack[];
  playlistTracks:
    readonly MusicCatalogTrack[];
  discoveryTracks:
    readonly MusicCatalogTrack[];
  playlists:
    readonly MusicLibraryPlaylist[];
  topGenres:
    readonly {
      name: string;
      count: number;
    }[];
  trackGenres:
    Readonly<
      Record<
        string,
        readonly string[]
      >
    >;
  warnings:
    readonly string[];
};

export type MusicTasteProfile = {
  topArtists:
    readonly {
      name: string;
    }[];
  topGenres:
    readonly {
      name: string;
      count: number;
    }[];
};

export type MusicCatalogSearchRequest = {
  query: string;
  limit?: number;
};

export type MusicSceneExportRequest = {
  name: string;
  activity?: string;
  description?: string;
  tracks:
    readonly MusicItemReference[];
};

export type MusicSceneExportReceipt = {
  providerId: MusicProviderId;
  collectionId: string;
  collectionUri: string | null;
  collectionUrl: string | null;
  exportedTrackCount: number;
  skippedTrackCount: number;
};
