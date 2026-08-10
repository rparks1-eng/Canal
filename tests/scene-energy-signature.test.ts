import { sceneEnergyBars } from "../components/canal-ui/scene-energy-signature";

const scene = (id: string, energy: string) => ({ id, name: "Signal", activity: "Focus", energy });

describe("Scene energy signatures", () => {
  it("is deterministic but visually unique by Scene identity", () => {
    expect(sceneEnergyBars(scene("one", "medium"))).toEqual(sceneEnergyBars(scene("one", "medium")));
    expect(sceneEnergyBars(scene("one", "medium"))).not.toEqual(sceneEnergyBars(scene("two", "medium")));
  });

  it("makes high energy visibly stronger than low energy", () => {
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(average(sceneEnergyBars(scene("same", "high")))).toBeGreaterThan(average(sceneEnergyBars(scene("same", "low"))));
  });

  it("keeps every visual bar inside safe display bounds", () => {
    for (const value of sceneEnergyBars(scene("bounded", "high"))) {
      expect(value).toBeGreaterThanOrEqual(0.18);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
