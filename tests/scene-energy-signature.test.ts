import { sceneArcShape, sceneEnergyArcPoints } from "../components/canal-ui/scene-energy-signature";

const scene = (id: string, energy: string) => ({ id, name: "Signal", activity: "Focus", energy });

describe("Scene energy signatures", () => {
  it("renders a deterministic continuous arc", () => {
    expect(sceneEnergyArcPoints(scene("one", "medium"))).toEqual(sceneEnergyArcPoints(scene("one", "medium")));
    expect(sceneEnergyArcPoints(scene("one", "medium"))).toHaveLength(33);
  });

  it("makes high energy visibly stronger than low energy", () => {
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(average(sceneEnergyArcPoints(scene("same", "high")))).toBeGreaterThan(average(sceneEnergyArcPoints(scene("same", "low"))));
  });

  it("keeps the full line inside safe display bounds", () => {
    for (const value of sceneEnergyArcPoints(scene("bounded", "high"))) {
      expect(value).toBeGreaterThanOrEqual(0.06);
      expect(value).toBeLessThanOrEqual(0.94);
    }
  });

  it("maps saved Scene arcs to visibly different line shapes", () => {
    const steady = { ...scene("same", "medium"), sceneArc: "steady" };
    const build = { ...scene("same", "medium"), sceneArc: "build" };
    const waves = { ...scene("same", "medium"), sceneArc: "waves" };
    expect(sceneArcShape(build)).toBe("build");
    expect(sceneEnergyArcPoints(build)[0]).toBeLessThan(sceneEnergyArcPoints(build)[8]);
    expect(sceneEnergyArcPoints(waves)).not.toEqual(sceneEnergyArcPoints(steady));
    const wavePoints = sceneEnergyArcPoints(waves);
    expect(Math.max(...wavePoints) - Math.min(...wavePoints)).toBeGreaterThan(0.5);
    const steadyPoints = sceneEnergyArcPoints(steady);
    expect(Math.max(...steadyPoints) - Math.min(...steadyPoints)).toBeGreaterThan(0.25);
  });
});
