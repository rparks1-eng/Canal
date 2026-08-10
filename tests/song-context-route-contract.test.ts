import fs from "node:fs";
import path from "node:path";

const sceneSource = fs.readFileSync(path.join(process.cwd(), "app/scenes/[sceneId].tsx"), "utf8");
const contextSource = fs.readFileSync(path.join(process.cwd(), "app/song-context.tsx"), "utf8");

describe("Song context route", () => {
  it("routes every saved Scene track internally instead of opening Spotify", () => {
    expect(sceneSource).toContain('pathname: "/song-context"');
    expect(sceneSource).toContain("params: { sceneId: scene.id, trackId: track.id }");
    expect(sceneSource).toContain("View song context for");
    expect(sceneSource).not.toContain("`Open ${track.title} in Spotify`");
  });

  it("loads Genius context automatically with account and connectivity fencing", () => {
    expect(contextSource).toContain("useLinerNotesContext({");
    expect(contextSource).toContain("visible: Boolean(track)");
    expect(contextSource).toContain("sessionGeneration");
    expect(contextSource).toContain("connectivityStatus");
  });

  it("keeps the full information architecture visible without a Genius match", () => {
    for (const section of ["Story", "Credits", "Release details", "Notes", "Creative links"]) {
      expect(contextSource).toContain(`title=\"${section}\"`);
    }
    expect(contextSource).toContain('"No context found"');
    expect(contextSource).toContain("The complete song page remains visible");
    expect(contextSource).toContain('"No credits found"');
    expect(contextSource).toContain('"No notes found"');
    expect(contextSource).toContain('"No creative links found"');
  });

  it("compresses credits and presents community notes as a horizontal rail", () => {
    expect(contextSource).toContain("styles.creditsGrid");
    expect(contextSource).toContain("styles.creditTile");
    expect(contextSource).toContain('accessibilityLabel="Community notes"');
    expect(contextSource).toContain("horizontal");
    expect(contextSource).toContain("snapToInterval={276}");
    expect(contextSource).toContain("numberOfLines={9}");
    expect(contextSource).toContain("Read full note");
  });

  it("uses subtle dividers instead of pronounced section containers", () => {
    expect(contextSource).toMatch(/section:\s*\{[\s\S]*?borderTopWidth:\s*StyleSheet\.hairlineWidth/u);
    expect(contextSource).not.toMatch(/section:\s*\{[\s\S]*?backgroundColor:\s*canalDynamicColors\.surface/u);
    expect(contextSource).toMatch(/hero:\s*\{[\s\S]*?paddingHorizontal:\s*4/u);
  });

  it("preserves an exact return path to the Scene", () => {
    expect(contextSource).toContain("if (router.canGoBack()) router.back()");
    expect(contextSource).toContain('pathname: "/scenes/[sceneId]"');
  });
});
