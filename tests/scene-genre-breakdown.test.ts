import { sceneGenreSignals } from "../components/canal-ui/scene-genre-breakdown";

describe("Scene genre breakdown", () => {
  it("normalizes, deduplicates, and bounds the visible genre DNA", () => {
    expect(sceneGenreSignals("R&B, Soul | r&b / Jazz • Pop, Rock")).toEqual([
      "R&B",
      "Soul",
      "Jazz",
      "Pop",
    ]);
  });

  it("returns no invented genre when a Scene has none", () => {
    expect(sceneGenreSignals("  ")).toEqual([]);
  });
});
