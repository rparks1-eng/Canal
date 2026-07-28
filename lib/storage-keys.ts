export const STORAGE_KEYS = {
  scenes: "@canal/scenes",

  soundscape:
    "@canal/soundscape",

  following:
    "@canal/following",

  blockedUsers:
    "@canal/blocked-users",

  relationshipMutations:
    "@canal/relationship-mutations",

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

  snapshots:
    "@canal/snapshots",

  liveStages:
    "@canal/live-stages",

  spotifyCachePrefix:
    "@canal/spotify-cache:",

  analyticsQueue:
    "@canal/analytics/v1/queue",
} as const;

export const CANAL_STORAGE_PREFIX =
  "@canal/";
