import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "app/now-playing.tsx"), "utf8");

describe("Now Playing Scene atmosphere", () => {
  it("uses the same assigned Scene presentation as Scene detail", () => {
    expect(source).toContain("const presentation = scenePresentation(scene)");
    expect(source).toContain("setOverride(sceneAtmosphere(scene))");
    expect(source).not.toContain("<SceneCardBackdrop");
    expect(source).toContain("backgroundColor: presentation.accent");
    expect(source).toContain("color: presentation.accentText");
  });

  it("prefetches artwork and renders no placeholder before it is ready", () => {
    expect(source).toContain("Image.prefetch(url)");
    expect(source).toContain("readyArtworkUrls.has(currentTrack.imageUrl)");
    expect(source).toContain("readyArtworkUrls.has(track.imageUrl)");
    expect(source).toContain('cachePolicy="memory-disk"');
    expect(source).not.toContain("styles.queueImagePlaceholder");
    expect(source).not.toContain("styles.artworkText");
  });

  it("renders the shared Scene DNA profile instead of generic tags", () => {
    expect(source).toContain("<SceneDnaPanel accent={presentation.accent} scene={scene} />");
    expect(source).toContain("styles.profileHeader");
    expect(source).not.toContain("<View style={styles.tags}>");
  });

  it("keeps player surfaces subtle and palette-linked", () => {
    expect(source).toContain('backgroundColor: `${presentation.colors[2]}20`');
    expect(source).toContain('backgroundColor: `${presentation.colors[2]}24`');
    expect(source).toContain('backgroundColor: `${presentation.colors[2]}2E`');
    expect(source).toMatch(/queueCard:\s*\{[\s\S]*?borderWidth:\s*0/u);
    expect(source).toMatch(/playbackAction:\s*\{[\s\S]*?borderWidth:\s*0/u);
    expect(source).toMatch(/safeArea:\s*\{[\s\S]*?backgroundColor:\s*"transparent"/u);
  });
});
