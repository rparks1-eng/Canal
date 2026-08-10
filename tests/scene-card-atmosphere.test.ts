import { sceneCardAtmosphere } from "../components/canal-ui/scene-card-visual";

const base = {
  id: "scene-atmosphere",
  name: "Night Drive",
  activity: "Driving",
  genres: "Electronic, R&B",
};

describe("Scene card atmosphere", () => {
  it("is deterministic and derives multiple genre accents", () => {
    const first = sceneCardAtmosphere({ ...base, energy: "high" });
    const second = sceneCardAtmosphere({ ...base, energy: "high" });
    expect(first).toEqual(second);
    expect(first.genreColors).toHaveLength(2);
    expect(new Set(first.genreColors).size).toBeGreaterThan(1);
  });

  it("makes high-energy Scenes more visually active than low-energy Scenes", () => {
    const high = sceneCardAtmosphere({ ...base, energy: "high" });
    const low = sceneCardAtmosphere({ ...base, energy: "soft" });
    expect(high.haloOpacity).toBeGreaterThan(low.haloOpacity);
    expect(high.haloScale).toBeGreaterThan(low.haloScale);
  });
});
