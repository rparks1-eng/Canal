import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Create atmosphere and navigation contract", () => {
  it("cycles every Canal palette in Studio and cleans up on exit", () => {
    const studio = read("app/scene-studio.tsx");
    expect(studio).toContain("LIVING_COVER_RECIPES");
    expect(studio).toContain("setOverride(sceneAtmosphere({");
    expect(studio).toContain("paletteIndex = (paletteIndex + 1) % LIVING_COVER_RECIPES.length");
    expect(studio).toContain("}, CANAL_ATMOSPHERE_TRANSITION_MS)");
    expect(studio).toContain("if (interval) clearInterval(interval)");
    expect(studio).toContain("setOverride(null)");
  });

  it("locks Preview to the generated Scene palette", () => {
    const preview = read("app/scene-preview.tsx");
    expect(preview).toContain("setOverride(sceneAtmosphere(visiblePreview.scene))");
  });

  it("crossfades palette changes and shares them with bottom navigation", () => {
    const ambient = read("components/canal-ui/canal-ambient-background.tsx");
    const navigation = read("components/CanalBottomNav.tsx");
    expect(ambient).toContain("CANAL_ATMOSPHERE_TRANSITION_MS");
    expect(ambient).toContain("baseColor.value = withTiming");
    expect(ambient).not.toContain("key={`${pathname}");
    expect(ambient).toContain("ambientPhase.value = withRepeat");
    expect(ambient).toContain("duration: 12_000");
    expect(ambient).toContain("Math.cos(ambientPhase.value * Math.PI * 2)");
    expect(ambient).toContain("Math.sin(ambientPhase.value * Math.PI * 2)");
    expect(ambient).toContain("atmosphere.base");
    expect(navigation).toContain("override.navigation");
    expect(navigation).toContain("override.accent");
    expect(navigation).toContain("glassColor.value = withTiming");
  });

  it("keeps Home notification-only and centers the Stage back control", () => {
    const home = read("app/(tabs)/index.tsx");
    const stage = read("app/live-stage/[stageId].tsx");
    expect(home).toContain("<CanalHeaderActions showSettings={false} />");
    expect(home).toContain("styles.headerCopy");
    expect(stage).toMatch(/headerBack:\s*\{[\s\S]*alignItems:\s*"center"[\s\S]*justifyContent:\s*"center"[\s\S]*marginLeft:\s*0/);
  });
});
