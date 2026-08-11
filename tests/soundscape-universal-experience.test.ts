import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app/soundscape.tsx"), "utf8");
const experience = fs.readFileSync(path.join(root, "components/soundscape/SoundscapeExperience.tsx"), "utf8");
const rootLayout = fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
const bottomNavigation = fs.readFileSync(
  path.join(root, "components/CanalBottomNav.tsx"),
  "utf8",
);

describe("universal Soundscape experience", () => {
  it("keeps one native and web route with the ten refined chapters", () => {
    for (const chapter of ["Opening", "Daily rhythm", "Your seasons", "Discovery", "Signatures", "History", "Stages", "Common ground", "Scenes", "Share"]) {
      expect(experience).toContain(`"${chapter}"`);
    }
    expect(experience).toContain("useWindowDimensions");
    expect(experience).not.toContain("Platform.OS === \"web\"");
    expect(rootLayout).toContain('rootSegment !== "soundscape"');
    expect(rootLayout).toContain('rootSegment !== "public-soundscape"');
    expect(bottomNavigation).toContain('pathname.startsWith("/soundscape")');
    expect(bottomNavigation).toContain(
      'pathname.startsWith("/public-soundscape")',
    );
    expect(route).toContain("useHideCanalNavigation();");
  });

  it("uses the reference quiet header, segmented progress, and labeled chapter pager", () => {
    expect(experience).toContain("Soundscape · {props.archive.period.key}");
    expect(experience).toContain('accessibilityRole="tablist"');
    expect(experience).toContain("styles.progressSegmentActive");
    expect(experience).toContain("styles.progressSegmentComplete");
    expect(experience).toContain("styles.pagerTitle");
    expect(experience).toContain("{chapter + 1} of {CHAPTERS.length}");
    expect(experience).toContain("minHeight: Math.max(620, height - 128)");
    expect(experience).not.toContain("styles.dots");
    expect(experience).not.toContain("styles.railItem");
  });

  it("builds only from bounded account-owned inputs and reports insufficient history", () => {
    expect(route).toContain("buildSoundscapeArchive");
    expect(route).toContain("accountId");
    expect(experience).toContain('historyState === "insufficient_history"');
    expect(experience).toContain("fictional discovery history");
    expect(experience).toContain("discoveryRiver");
    expect(experience).toContain("SELECTED SOUND SIGNATURE");
    expect(experience).toContain("CONTRIBUTOR BLEND");
    expect(experience).toContain("TRUSTED BRIDGE SONGS");
    expect(experience).toContain("Scene atlas from intimate to social and still to kinetic");
    expect(experience).toContain("ENERGY RIDGE");
  });

  it("backs available actions with real routes and preserves legacy Snapshot membership", () => {
    expect(route).toContain('pathname: "/scenes/[sceneId]"');
    expect(route).toContain('pathname: "/live-stage/[stageId]"');
    expect(route).toContain('pathname: "/snapshots/[snapshotId]"');
    expect(route).toContain('router.push("/scene-studio")');
    expect(route).toContain("removeSnapshotFromSoundscape");
    expect(experience).toContain("Legacy Soundscape membership preserved");
  });

  it("labels share cards with the cloud archive visibility, never stale legacy visibility", () => {
    expect(experience).toContain("{shareCard.detail} · {archive.visibility}");
    expect(experience).not.toContain("legacyVisibility");
    expect(route).not.toContain("legacyVisibility");
  });

  it("fails closed for song context, history comparison, and Common Ground", () => {
    expect(experience).toContain("Full provider song context is not available here");
    expect(experience).toContain("Comparison needs recorded sessions");
    expect(experience).toContain("requires mutual connection and two explicit approvals");
  });

  it("keeps primary interactive targets at least 48 points", () => {
    expect(experience).toContain("minHeight: 50");
    expect(experience).toMatch(/width:\s*48,[\s\S]{0,30}height:\s*48/u);
    expect(experience).toContain('accessibilityRole="tab"');
    expect(experience).toContain('accessibilityLiveRegion="polite"');
  });
});
