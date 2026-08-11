import { classifyCanalSongDna, SONG_DNA_TAXONOMY_VERSION } from "../lib/song-dna";

describe("Canal Song DNA", () => {
  it("projects bounded multi-label genre and mood signals", () => {
    const dna = classifyCanalSongDna({
      title: "Memory Rush",
      artist: "Canal Test",
      genreHints: ["alternative hip hop", "neo soul", "dance pop"],
      story: "A nostalgic story about love, heartbreak, memory, and finding confidence together.",
    });
    expect(dna.genres).toEqual(expect.arrayContaining(["Hip-hop", "R&B", "Pop"]));
    expect(dna.moods).toEqual(expect.arrayContaining(["Romantic", "Melancholic", "Confident"]));
    expect(dna.genres.length).toBeLessThanOrEqual(4);
    expect(dna.moods.length).toBeLessThanOrEqual(4);
    expect(dna.sources).toEqual(["spotify", "genius", "canal"]);
    expect(dna.taxonomyVersion).toBe(SONG_DNA_TAXONOMY_VERSION);
  });

  it("returns truthful empty labels when no supported signal exists", () => {
    const dna = classifyCanalSongDna({ title: "Untitled", artist: "Unknown" });
    expect(dna.genres).toEqual([]);
    expect(dna.moods).toEqual([]);
    expect(dna.confidence).toBe("low");
    expect(JSON.stringify(dna)).not.toContain("lyrics");
  });

  it("ranks consensus Scene moods instead of displaying every association", () => {
    const dna = classifyCanalSongDna({
      story: "A reflective story about identity.",
      sceneMoodEvidence: [
        { label: "Calm", personalCount: 2, communityCount: 8 },
        { label: "Energized", personalCount: 0, communityCount: 12 },
        { label: "Romantic", personalCount: 0, communityCount: 2 },
        { label: "Nostalgic", personalCount: 1, communityCount: 5 },
        { label: "Social", personalCount: 0, communityCount: 1 },
      ],
    });
    expect(dna.moods).toHaveLength(4);
    expect(dna.moods[0]).toBe("Calm");
    expect(dna.moods).toContain("Reflective");
    expect(dna.moods).not.toContain("Social");
  });
});
