import fs from "node:fs";
import path from "node:path";

describe("Create Scene Living Glass experience", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/scene-studio.tsx"), "utf8");

  it("keeps one clear Continue action above the persistent navigation", () => {
    expect(source).not.toContain("Preview another Scene atmosphere");
    expect(source).not.toContain("styles.atmosphereButton");
    expect(source).toContain('<View style={styles.actionDock}>');
    expect(source).not.toContain('tint="dark" style={styles.actionDock}');
    expect(source).toContain('backgroundColor:"transparent",bottom:112');
    expect(source).toContain('paddingHorizontal:42');
    expect(source).toContain('minHeight:48');
    expect(source).toContain("paddingBottom:250");
  });

  it("keeps the cycling atmosphere active until the route leaves after Generate", () => {
    expect(source).toContain("LIVING_COVER_RECIPES");
    expect(source).toContain("CANAL_STUDIO_ATMOSPHERE_TRANSITION_MS");
    expect(source).toMatch(/setInterval\([\s\S]*applyStudioPalette\(palettePreviewIndexRef\.current\)/u);
    expect(source).toMatch(/return \(\) => \{[\s\S]*setOverride\(null\)/u);
    expect(source).toMatch(/router\.push\([\s\S]{0,160}["']\/scene-preview["']/u);
  });

  it("renders an accessible autocomplete and account-scoped unique-name suggestion", () => {
    expect(source).toContain('accessibilityLabel="Search genres"');
    expect(source).toContain("suggestSceneGenres(");
    expect(source).toContain("setGenreQuery");
    expect(source).toContain('accessibilityLiveRegion="polite"');
    expect(source).toContain('accessibilityLabel="Suggest a unique Scene name"');
    expect(source).toContain("existingScenes.map((scene) => scene.name)");
    expect(source).toContain("sameSceneStudioScope(operationScope, currentScope())");
    expect(source.indexOf('studioStep === "review"')).toBeLessThan(
      source.indexOf('accessibilityLabel="Scene name"'),
    );
    expect(source).toContain("A name is generated automatically if you leave this blank.");
    expect(source).toMatch(/const activationDraft = draft\.name\.trim\(\)[\s\S]*generateCreativeSceneName\([\s\S]*existingNames: existingSceneNames/u);
    expect(source).toContain("generateSceneWithSpotifyGenreFallback(activationDraft");
  });

  it("keeps every primary interactive surface at least 48 points tall", () => {
    expect(source).toMatch(/suggestNameButton:\s*\{[\s\S]*?minHeight:\s*48/u);
    expect(source).toMatch(/textInput:\s*\{[\s\S]*?minHeight:\s*48/u);
    expect(source).toMatch(/moodOrb:\s*\{[\s\S]*?minHeight:\s*48/u);
  });

  it("starts Moment unselected, requires a mood, permits five, and explains Direct Canal", () => {
    const model = fs.readFileSync(path.join(process.cwd(), "lib/scene-studio.ts"), "utf8");
    expect(model).toMatch(/DEFAULT_SCENE_STUDIO_DRAFT[\s\S]*?moods:\s*\[\]/u);
    expect(source).toContain("activityChosen && visibleDraft.activity === option.value");
    expect(source).toContain('Choose at least one mood before continuing.');
    expect(source).toContain("draft.moods.length >= 5");
    expect(source).toContain("Remove one before adding another");
    expect(source).toContain("{visibleDraft.moods.length}/5 selected");
    expect(source).toContain("Choose one to five moods");
    expect(source).toContain("Refines ranking");
    expect(model).toContain("scoreSceneDirectionText(");
  });
});
