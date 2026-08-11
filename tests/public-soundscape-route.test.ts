import fs from "node:fs";
import path from "node:path";

import { parsePublicSoundscapePeriod, publicSoundscapeShareUrl } from "../lib/public-soundscape";

describe("public Soundscape route", () => {
  const originalBase = process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL;
  afterEach(() => { process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL = originalBase; });

  it("builds one canonical native/web URL with encoded owner and bounded period", () => {
    process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL = "https://canal.example/";
    const period = parsePublicSoundscapePeriod("year", "2026");
    expect(period).not.toBeNull();
    expect(publicSoundscapeShareUrl("123e4567-e89b-42d3-a456-426614174000", period!)).toBe("https://canal.example/public-soundscape?ownerId=123e4567-e89b-42d3-a456-426614174000&periodKind=year&periodKey=2026");
  });

  it("rejects malformed periods and unsafe owners", () => {
    process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL = "https://canal.example";
    expect(parsePublicSoundscapePeriod("year", "26")).toBeNull();
    expect(parsePublicSoundscapePeriod("season", "2026-monsoon")).toBeNull();
    const period = parsePublicSoundscapePeriod("season", "2026-fall");
    expect(period?.startsAt).toBe("2026-10-01T00:00:00.000Z");
    expect(publicSoundscapeShareUrl("unsafe\nowner", period!)).toBeNull();
  });

  it("renders only the gated share projection and fails closed", () => {
    const source = fs.readFileSync(path.join(__dirname, "../app/public-soundscape.tsx"), "utf8");
    expect(source).toContain("loadSoundscapeShareProjection");
    expect(source).not.toContain("loadSoundscapeArchive");
    expect(source).not.toContain("readScenes");
    expect(source).toContain("private, unavailable, or no longer shared");
    expect(source).toContain('router.push("/scene-studio")');
  });
});
