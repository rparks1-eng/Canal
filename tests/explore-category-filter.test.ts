import { filterExploreCategoryScenes } from "../lib/explore-categories";
import type { PublicCanalScene } from "../lib/social";

function publicScene(overrides: {
  id: string;
  activity: string;
  moods: string;
  genres: string;
  verified?: boolean;
}): PublicCanalScene {
  return {
    ownerId: `owner-${overrides.id}`,
    sceneId: overrides.id,
    updatedAt: "2026-08-10T00:00:00.000Z",
    savedByMe: false,
    isMine: false,
    creator: {
      id: `owner-${overrides.id}`,
      displayName: overrides.verified ? "Verified Creator" : "Community Creator",
      handle: overrides.verified ? "@verified" : "@community",
      bio: "",
      favoriteActivities: "",
      avatarUrl: null,
      isPublic: true,
      isVerified: overrides.verified === true,
      isCanal: false,
    },
    scene: {
      id: overrides.id,
      name: `${overrides.activity} Scene`,
      activity: overrides.activity,
      emotions: overrides.moods,
      genres: overrides.genres,
      tracks: [{ id: `track-${overrides.id}`, title: "Signal", artist: "Artist" }],
    } as PublicCanalScene["scene"],
  };
}

describe("Explore category filtering", () => {
  const scenes = [
    publicScene({ id: "one", activity: "Workout", moods: "Confident, Energized", genres: "Rock | Soul", verified: true }),
    publicScene({ id: "two", activity: "Workout", moods: "Calm", genres: "Ambient" }),
    publicScene({ id: "three", activity: "Focus", moods: "Reflective", genres: "R&B" }),
  ];

  it("matches exact normalized activity, mood, and genre categories", () => {
    expect(filterExploreCategoryScenes(scenes, { kind: "activity", value: "workout", scope: "public" })).toHaveLength(2);
    expect(filterExploreCategoryScenes(scenes, { kind: "mood", value: "energized", scope: "public" })).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "genre", value: "R&B", scope: "public" })).toHaveLength(1);
  });

  it("narrows to verified creators and composes category search", () => {
    expect(filterExploreCategoryScenes(scenes, { kind: "activity", value: "Workout", scope: "verified" })).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "activity", value: "Workout", scope: "public", query: "community" })).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "genre", value: "Jazz", scope: "public" })).toEqual([]);
  });
});
