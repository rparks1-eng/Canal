import { sceneMoodSignals } from "../components/canal-ui/scene-mood-breakdown";

describe("Scene mood breakdown", () => {
  it("normalizes, de-duplicates, and preserves the lead mood", () => {
    expect(sceneMoodSignals("Calm, Dreamy • calm | Grounded")).toEqual(["Calm", "Dreamy", "Grounded"]);
  });

  it("supports every stored delimiter and remains bounded", () => {
    expect(sceneMoodSignals("Warm/Happy|Social•Playful,Hopeful,Extra")).toEqual([
      "Warm", "Happy", "Social", "Playful", "Hopeful",
    ]);
  });

  it("returns no visual signals for an empty mood set", () => {
    expect(sceneMoodSignals(undefined)).toEqual([]);
  });
});
