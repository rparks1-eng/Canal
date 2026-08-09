import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("immersive core page parity", () => {
  it("keeps the tab canvas transparent so the living atmosphere reaches every page", () => {
    const layout = source("app/(tabs)/_layout.tsx");
    expect(layout).toContain("sceneStyle");
    expect(layout).toContain('backgroundColor: "transparent"');
  });

  it("gives Explore the editorial Live Stage hero and animated discovery hierarchy", () => {
    const explore = source("app/(tabs)/explore.tsx");
    expect(explore).toContain("CANAL DISCOVERY");
    expect(explore).toContain("Step into the room.");
    expect(explore).toContain("Browse Live Stages");
    expect(explore).toContain('label="Stages"');
    expect(explore).toContain("PublicStageCard");
    expect(explore).toContain('pathname: "/live-stage/[stageId]"');
    expect(explore).toContain("filterExploreStages");
    expect(explore).toContain("FadeInUp");
    expect(explore).toContain("editorialFeature");
  });

  it("gives Library one living feature, compact rows, and complete header actions", () => {
    const library = source("app/(tabs)/library.tsx");
    expect(library).toContain("YOUR COLLECTION");
    expect(library).toContain("featuredSceneCard");
    expect(library).toContain("featuredManageButton");
    expect(library).toContain("openSceneActions");
    expect(library).toContain("<CanalHeaderActions />");
  });

  it("gives Settings the centered reference header and visual appearance preview", () => {
    const settings = source("app/settings.tsx");
    expect(settings).toContain("Shape how Canal looks, connects, and remembers.");
    expect(settings).toContain("appearancePreview");
    expect(settings).toContain("previewOrbOne");
    expect(settings).toContain("previewGlass");
  });

  it("changes nav glass and Create hue with Explore, Library, Settings, Scene, and Stage routes", () => {
    const nav = source("components/CanalBottomNav.tsx");
    for (const route of ["/explore", "/library", "/settings", "/scenes", "/live-stage"]) {
      expect(nav).toContain(`pathname.startsWith("${route}")`);
    }
    expect(nav).toContain("backgroundColor: accentColor.value");
    expect(nav).toContain("backgroundColor: glassColor.value");
  });
});
