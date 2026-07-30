export const STORAGE_KEYS = {
  scenes: "@canal/scenes",

  soundscape:
    "@canal/soundscape",

  following:
    "@canal/following",

  blockedUsers:
    "@canal/blocked-users",

  blockedUserReferences:
    "@canal/blocked-user-references",

  relationshipMutations:
    "@canal/relationship-mutations",

  relationshipMutationQuarantine:
    "@canal/relationship-mutation-quarantine",

  settings:
    "@canal/settings",

  activity:
    "@canal/activity",

  legacyReadActivity:
    "@canal/read-activity",

  musicServices:
    "@canal/music-services",

  favoriteScenes:
    "@canal/favorite-scenes",

  spotifySession:
    "@canal/spotify-session",

  spotifySecureSession:
    "@canal/spotify-secure-session",

  spotifyPendingAuth:
    "@canal/spotify-pending-auth",

  spotifyReturnRoute:
    "@canal/spotify-return-route",

  spotifyLibrarySnapshot:
    "@canal/spotify-library-snapshot",

  spotifyLibraryImportCheckpoint:
    "@canal/spotify-library-import-checkpoint",

  snapshots:
    "@canal/snapshots",

  liveStages:
    "@canal/live-stages",

  spotifyCachePrefix:
    "@canal/spotify-cache:",

  accountCleanupPrefix:
    "@canal/account-cleanup-incomplete:",

  analyticsQueue:
    "@canal/analytics/v1/queue",
} as const;

export const CANAL_STORAGE_PREFIX =
  "@canal/";

export type SpotifyCacheScopeIdentity = {
  ownerId: string;
  sessionGeneration: string;
  spotifyAccountGeneration: number;
  spotifyProfileId: string;
};

export function getSpotifyCacheAuthorityNamespace(
  identity:
    Omit<
      SpotifyCacheScopeIdentity,
      "spotifyProfileId"
    >,
): string {
  return (
    STORAGE_KEYS
      .spotifyCachePrefix +
    [
      "v3",
      encodeURIComponent(
        identity.ownerId,
      ),
      encodeURIComponent(
        identity.sessionGeneration,
      ),
      identity.spotifyAccountGeneration,
      "",
    ].join(":")
  );
}

export function getSpotifyCacheNamespace(
  identity: SpotifyCacheScopeIdentity,
): string {
  return (
    getSpotifyCacheAuthorityNamespace(
      identity,
    ) +
    encodeURIComponent(
      identity.spotifyProfileId,
    ) +
    ":"
  );
}
