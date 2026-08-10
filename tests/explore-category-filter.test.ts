import {
  filterExploreCategoryScenes,
  highlightedExploreCategoryScenes,
  popularExploreCategoryScenes,
} from "../lib/explore-categories";
import type { PublicCanalScene } from "../lib/social";

function publicScene(overrides: {
  id: string;
  activity: string;
  moods: string;
  genres: string;
  verified?: boolean;
  plays?: number;
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
      playCount: overrides.plays ?? 0,
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
    expect(filterExploreCategoryScenes(scenes, { kind: "activity", value: "workout" })).toHaveLength(2);
    expect(filterExploreCategoryScenes(scenes, { kind: "mood", value: "energized" })).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "genre", value: "R&B" })).toHaveLength(1);
  });

  it("composes category search and derives verified highlights separately", () => {
    const workout = filterExploreCategoryScenes(scenes, { kind: "activity", value: "Workout" });
    expect(highlightedExploreCategoryScenes(workout)).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "activity", value: "Workout", query: "community" })).toHaveLength(1);
    expect(filterExploreCategoryScenes(scenes, { kind: "genre", value: "Jazz" })).toEqual([]);
  });

  it("ranks only genuinely played Scenes by play count", () => {
    const ranked = popularExploreCategoryScenes([
      publicScene({ id: "quiet", activity: "Workout", moods: "Calm", genres: "Ambient", plays: 0 }),
      publicScene({ id: "popular", activity: "Workout", moods: "Calm", genres: "Ambient", plays: 21 }),
      publicScene({ id: "middle", activity: "Workout", moods: "Calm", genres: "Ambient", plays: 8 }),
    ]);
    expect(ranked.map((item) => item.sceneId)).toEqual(["popular", "middle"]);
  });
});
