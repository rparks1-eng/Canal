import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "components/canal-ui/scene-card-visual.tsx"), "utf8");

describe("Scene card atmosphere", () => {
  it("uses a restrained two-glow atmosphere without decorative ribbons or signatures", () => {
    expect(source).toContain("styles.glowOne");
    expect(source).toContain("styles.glowTwo");
    expect(source).not.toContain("styles.genreRibbon");
    expect(source).not.toContain("styles.energyHalo");
    expect(source).not.toContain("style={styles.signature}");
  });
});
