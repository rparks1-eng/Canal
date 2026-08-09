import {
  generateCreativeSceneName,
  generateCreativeStageName,
} from "../lib/creative-names";

describe("creative Scene and Stage names", () => {
  const input = {
    activity: "workout",
    moods: ["calm", "euphoric"],
    energy: "high",
    arc: "build",
    genres: ["rock", "r&b"],
  } as const;

  it("creates evocative names instead of concatenating mood and activity labels", () => {
    const name = generateCreativeSceneName(input, { seed: "scene-one" });

    expect(name).not.toMatch(/calm workout/iu);
    expect(name).not.toMatch(/workout scene/iu);
    expect(name.split(/\s+/u).length).toBeGreaterThanOrEqual(2);
  });

  it("is stable for one generation but rotates around existing library names", () => {
    const first = generateCreativeSceneName(input, { seed: "stable" });
    const repeated = generateCreativeSceneName(input, { seed: "stable" });
    const next = generateCreativeSceneName(input, {
      seed: "stable",
      existingNames: [first.toUpperCase()],
    });

    expect(repeated).toBe(first);
    expect(next.toLocaleLowerCase()).not.toBe(first.toLocaleLowerCase());
  });

  it("gives collaborative Stages social names rather than adding Live", () => {
    const name = generateCreativeStageName(
      { ...input, sceneName: "Velvet Voltage" },
      { seed: "stage-one" },
    );

    expect(name).not.toBe("Velvet Voltage Live");
    expect(name).toMatch(/Frequency|Circuit|Weather|Assembly|Union|Room|Hearts|Orbit|Club|Exchange|Tonight/u);
  });

  it("falls back to a numbered edition only after every creative candidate is used", () => {
    const first = generateCreativeSceneName(input, { seed: "crowded" });
    const candidates = [
      first,
      generateCreativeSceneName(input, { seed: "crowded", existingNames: [first] }),
    ];
    const third = generateCreativeSceneName(input, { seed: "crowded", existingNames: candidates });

    expect(new Set([...candidates, third].map((name) => name.toLocaleLowerCase())).size).toBe(3);
  });

  it("can use the current day, time, and phrase-shaped titles", () => {
    const now = new Date("2026-08-09T07:30:00-04:00");
    const names = Array.from({ length: 80 }, (_, index) =>
      generateCreativeSceneName(input, {
        seed: `wide-variety-${index}`,
        now,
      }),
    );

    expect(names.some((name) => /Sunday/u.test(name))).toBe(true);
    expect(names.some((name) => /Morning|City Wakes|First Light/u.test(name))).toBe(true);
    expect(names.some((name) => name.split(/\s+/u).length >= 4)).toBe(true);
  });

  it("learns only the current library's naming form while remaining unique", () => {
    const phraseLibrary = [
      "When the Streetlights Fade",
      "A Long Way Back Home",
      "Sunday, Before Everyone Wakes",
      "The Part of Night We Keep",
    ];
    const name = generateCreativeSceneName(input, {
      seed: "personal-phrase-style",
      existingNames: phraseLibrary,
      now: new Date("2026-08-09T22:00:00-04:00"),
    });

    expect(name.split(/\s+/u).length).toBeGreaterThanOrEqual(3);
    expect(phraseLibrary.map((value) => value.toLocaleLowerCase())).not.toContain(name.toLocaleLowerCase());
  });
});
