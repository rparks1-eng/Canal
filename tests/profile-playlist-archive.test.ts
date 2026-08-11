import fs from "node:fs";
import path from "node:path";

import { playlistMatchesDateFilter } from "../lib/playlist-export-filters";

const profileSource = fs.readFileSync(path.join(process.cwd(), "app/(tabs)/profile.tsx"), "utf8");
const archiveSource = fs.readFileSync(path.join(process.cwd(), "app/exported-playlists.tsx"), "utf8");

describe("Profile network and playlist archive", () => {
  it("merges Network into the identity card and removes Find People", () => {
    const identityStart = profileSource.indexOf("styles.identityCard");
    const identityEnd = profileSource.indexOf("styles.profileActions", identityStart);
    const identity = profileSource.slice(identityStart, identityEnd);

    expect(identity).toContain("styles.profileNetwork");
    expect(identity).toContain("Following");
    expect(identity).toContain("Followers");
    expect(profileSource).not.toContain("Find people");
    expect(profileSource).not.toContain("styles.connectionCard");
    expect(identity.indexOf("styles.profileNetwork")).toBeLessThan(identity.indexOf("styles.stats"));
    expect(identity).not.toContain('accessibilityLabel="Open Activity"');
  });

  it("uses one Profile button to open the categorized archive", () => {
    expect(profileSource).toContain('accessibilityLabel="View exported playlists"');
    expect(profileSource).toContain('router.push("/exported-playlists")');
    expect(profileSource).toContain("styles.profileQuickAction");
    expect(profileSource).toMatch(/profileQuickAction:\s*\{[\s\S]*?minHeight:\s*64[\s\S]*?backgroundColor:\s*"transparent"/);
    expect(archiveSource).toContain('accessibilityLabel="Show all exported playlists"');
    expect(archiveSource).toContain('accessibilityRole="tablist"');
    expect(archiveSource).toContain('"Made today"');
    expect(archiveSource).toContain('"This week"');
    expect(archiveSource).toContain('"Past month"');
  });

  it("filters exports into each requested date window", () => {
    const now = new Date("2026-08-10T15:00:00-04:00");
    const item = (createdAt: string) => ({ createdAt });

    expect(playlistMatchesDateFilter(item("2026-08-10T09:00:00-04:00"), "today", now)).toBe(true);
    expect(playlistMatchesDateFilter(item("2026-08-09T09:00:00-04:00"), "today", now)).toBe(false);
    expect(playlistMatchesDateFilter(item("2026-08-09T09:00:00-04:00"), "week", now)).toBe(true);
    expect(playlistMatchesDateFilter(item("2026-07-20T09:00:00-04:00"), "month", now)).toBe(true);
    expect(playlistMatchesDateFilter(item("2020-01-01T00:00:00Z"), "all", now)).toBe(true);
    expect(playlistMatchesDateFilter(item("invalid"), "month", now)).toBe(false);
  });
});
