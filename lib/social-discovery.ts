import type {
  BlockedUserReference,
} from "./relationships";

import type {
  PublicCanalProfile,
  PublicCanalScene,
} from "./social";

export type DiscoverableProfile =
  PublicCanalProfile & {
    artists: string[];
    genres: string[];
    sceneCount: number;
  };

function splitTerms(
  value: string,
): string[] {
  return value
    .split(",")
    .map(
      (term) =>
        term.trim(),
    )
    .filter(Boolean);
}

function normalizedHandle(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/u, "");
}

export function discoverableProfilesFromScenes(
  scenes: PublicCanalScene[],
): DiscoverableProfile[] {
  const profiles =
    new Map<
      string,
      DiscoverableProfile
    >();

  for (const item of scenes) {
    if (item.isMine) {
      continue;
    }

    const existing =
      profiles.get(
        item.ownerId,
      );

    const artists =
      Array.from(
        new Set([
          ...(existing?.artists ?? []),
          ...splitTerms(
            item.scene.artists,
          ),
          ...item.scene.tracks
            .map(
              (track) =>
                track.artist.trim(),
            )
            .filter(Boolean),
        ]),
      );

    const genres =
      Array.from(
        new Set([
          ...(existing?.genres ?? []),
          ...splitTerms(
            item.scene.genres,
          ),
        ]),
      );

    profiles.set(
      item.ownerId,
      {
        ...item.creator,
        id:
          item.ownerId,
        artists,
        genres,
        sceneCount:
          (existing?.sceneCount ?? 0) +
          1,
      },
    );
  }

  return [...profiles.values()].sort(
    (first, second) =>
      first.displayName.localeCompare(
        second.displayName,
      ),
  );
}

export function profileIsBlocked(
  profile: DiscoverableProfile,
  blockedUsernames: string[],
  blockedTargets: BlockedUserReference[],
): boolean {
  const handle =
    normalizedHandle(
      profile.handle,
    );

  return (
    blockedUsernames.includes(
      handle,
    ) ||
    blockedTargets.some(
      (target) =>
        target.targetUserId ===
          profile.id ||
        normalizedHandle(
          target.username,
        ) === handle,
    )
  );
}
