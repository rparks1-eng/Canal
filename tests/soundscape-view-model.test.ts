import { buildSoundscapeArchive, soundscapePeriodForDate } from "../lib/soundscape-aggregation";
import { availableShareFormats, soundscapeChapterIndex, soundscapeDailyPhases, soundscapeMonths, soundscapeSceneSeed, soundscapeSeasons } from "../components/soundscape/soundscape-view-model";

function archive() {
  const period = soundscapePeriodForDate("year", new Date("2026-08-11T12:00:00.000Z"));
  return buildSoundscapeArchive({
    accountId: "account-a",
    period,
    generatedAt: "2026-08-11T12:00:00.000Z",
    scenes: [
      { id: "winter", name: "Quiet start", activity: "Morning focus", moods: ["clear"], genres: ["ambient"], trackIds: ["one"], createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", playCount: 2, favorite: true },
      { id: "summer", name: "Late heat", activity: "Late night", moods: ["warm"], genres: ["soul"], trackIds: ["two"], createdAt: "2026-07-02T00:00:00.000Z", updatedAt: "2026-07-03T00:00:00.000Z", playCount: 1, favorite: false },
    ],
    stages: [], discoveries: [], songDna: [],
    listening: [{ id: "play", sceneId: "summer", sceneName: "Late heat", startedAt: "2026-07-05T00:00:00.000Z", completedAt: "2026-07-05T00:20:00.000Z", tracksPlayed: 5, durationSeconds: 1200 }],
    feedback: [], snapshots: [],
  });
}

describe("Soundscape view model", () => {
  it("groups archive-owned Scenes into four seasons and twelve months", () => {
    expect(soundscapeSeasons(archive()).map((item) => item.scenes.length)).toEqual([1, 0, 1, 0]);
    expect(soundscapeMonths(archive())).toHaveLength(12);
    expect(soundscapeMonths(archive())[6]).toMatchObject({ playbackCount: 1 });
  });

  it("derives daily phases only from recorded activity labels", () => {
    const phases = soundscapeDailyPhases(archive());
    expect(phases.find((item) => item.key === "morning")?.signals[0]?.label).toBe("Morning focus");
    expect(phases.find((item) => item.key === "late")?.signals[0]?.label).toBe("Late night");
  });

  it("keeps link and media share options closed for a private archive without finished media", () => {
    expect(availableShareFormats(archive())).toEqual([
      { key: "link", label: "Link preview", enabled: false },
      { key: "still", label: "Still", enabled: false },
      { key: "motion", label: "Living motion", enabled: false },
    ]);
  });

  it("keeps direct and next/previous chapter selection inside the ten-chapter story", () => {
    expect(soundscapeChapterIndex(0, -1)).toBe(0);
    expect(soundscapeChapterIndex(3, 4)).toBe(4);
    expect(soundscapeChapterIndex(9, 10)).toBe(9);
  });

  it("preserves the chosen Soundscape activity and mood in the one-shot Scene seed", () => {
    expect(soundscapeSceneSeed("Late night", "Reflective")).toMatchObject({
      activity: "Late night",
      moods: ["Reflective"],
      notes: "Created from my Soundscape",
    });
  });
});
