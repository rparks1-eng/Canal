import { filterExploreStages } from "../lib/explore-search";
import type { LiveStage } from "../lib/live-stages";

function stage(overrides: Partial<LiveStage> = {}): LiveStage {
  return {
    id: "stage-1",
    code: "CANAL1",
    stageCode: "CANAL1",
    name: "After Dark Radio",
    hostUsername: "canal",
    hostName: "Canal",
    stageKind: "canal",
    hostIsVerified: true,
    hostIsCanal: true,
    activity: "Night drive",
    visibility: "public",
    status: "live",
    participants: [],
    participantCount: 42,
    listenerCount: 40,
    tracks: [{ id: "track-1", title: "Silver Hours", artist: "Ari Lane", source: "spotify" }],
    currentTrackIndex: 0,
    membershipRole: null,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("Explore public Stage discovery", () => {
  it("searches Stage, host, activity, song, and artist text", () => {
    const stages = [stage()];
    for (const query of ["after dark", "canal", "night drive", "silver", "ari lane"]) {
      expect(filterExploreStages(stages, query, "all")).toHaveLength(1);
    }
    expect(filterExploreStages(stages, "morning jazz", "all")).toHaveLength(0);
  });

  it("filters provenance and never exposes private or ended Stages", () => {
    const stages = [
      stage(),
      stage({ id: "verified", stageKind: "verified" }),
      stage({ id: "private", visibility: "private" }),
      stage({ id: "ended", status: "ended" }),
    ];
    expect(filterExploreStages(stages, "", "all").map((item) => item.id)).toEqual([
      "stage-1",
      "verified",
    ]);
    expect(filterExploreStages(stages, "", "verified").map((item) => item.id)).toEqual([
      "verified",
    ]);
  });
});
