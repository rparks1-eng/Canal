import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "app/scenes/[sceneId].tsx"), "utf8");

describe("Scene detail composition", () => {
  it("reveals the Scene profile only inside the title card", () => {
    expect(source).toContain("profileVisible");
    expect(source).toContain('"Show Scene profile"');
    expect(source).toContain('"Hide Scene profile"');
    expect(source).toContain('accessibilityState={{ expanded: profileVisible }}');
    expect(source).toContain('accessibilityLabel="Scene profile details"');
    expect(source).not.toMatch(/styles\.sectionCard[\s\S]{0,180}>\s*Scene profile/u);
  });

  it("keeps the remaining utility controls visually free-standing", () => {
    const actionStyle = source.match(/actionButton:\s*\{([\s\S]*?)\n\s*\},/u)?.[1] ?? "";
    expect(actionStyle).toContain("width: 48");
    expect(actionStyle).toContain("height: 48");
    expect(actionStyle).not.toContain("backgroundColor");
    expect(actionStyle).not.toContain("borderWidth");
    expect(actionStyle).not.toContain("boxShadow");
  });

  it("consolidates favorite, share, and delete into the title card", () => {
    expect(source).toContain("styles.heroFavorite");
    expect(source).toContain('name="ellipsis-vertical"');
    expect(source).toContain('accessibilityLabel="Scene actions"');
    expect(source).toContain('accessibilityLabel="Share Scene"');
    expect(source).toContain('accessibilityLabel="Delete Scene"');
    expect(source).toContain("styles.heroActionLedge");
    expect(source).toContain("entering={FadeInRight.duration(160)}");
    expect(source).not.toContain("styles.deleteButton");
    expect(source).not.toContain("styles.favoriteButton");
  });

  it("places the Stage action directly to the right of Start Scene", () => {
    const primaryActions = source.match(
      /<View style=\{styles\.primaryActionRow\}>([\s\S]*?)<\/View>/u,
    )?.[1] ?? "";
    expect(primaryActions).toContain('accessibilityLabel="Start Scene"');
    expect(primaryActions).toContain("Start a live Stage with");
    expect(primaryActions.indexOf('accessibilityLabel="Start Scene"')).toBeLessThan(
      primaryActions.indexOf("Start a live Stage with"),
    );
    expect(source).toMatch(/primaryActionRow:\s*\{[\s\S]*?flexDirection:\s*"row"/u);
    expect(source).toMatch(/stageStartButton:\s*\{[\s\S]*?width:\s*54/u);
  });

  it("makes First Up the lead row and routes it to internal song context", () => {
    expect(source).toContain("styles.trackRowFirst");
    expect(source).toContain(">FIRST UP</Text>");
    expect(source).toContain("View song context for");
    expect(source).toContain('pathname: "/song-context"');
    expect(source).toContain('name="information-circle-outline"');
    expect(source).not.toContain('`Open ${track.title} in Spotify`');
    expect(source).not.toContain("styles.firstUpArtwork");
  });

  it("blends Track sequence into the assigned Scene atmosphere", () => {
    expect(source).toContain("styles.trackSequence");
    expect(source).toContain('backgroundColor: `${presentation.colors[2]}38`');
    expect(source).toMatch(/trackSequence:\s*\{[\s\S]*?borderWidth:\s*0,/u);
    expect(source).toContain('backgroundColor: `${presentation.accent}0D`');
  });
});
