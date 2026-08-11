import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cross-device Scene refresh", () => {
  it("renders the account-scoped Library cache first, then refreshes it from cloud without blanking the screen", () => {
    const library = read("app/(tabs)/library.tsx");

    expect(library).toContain('import {\n  syncScenesWithCloud,\n} from "../../lib/scene-sync";');
    expect(library).toMatch(
      /const \[[\s\S]*nextScenes[\s\S]*= await Promise[.]all\([\s\S]*readScenes\(\)[\s\S]*setScenes\(nextScenes\)/,
    );
    expect(library).toMatch(
      /Promise[.]allSettled\([\s\S]*syncScenesWithCloud\(\)[\s\S]*setScenes\(await readScenes\(\)\)/,
    );
    expect(library).toContain("showing the latest local Library instead");
  });

  it("hydrates a phone-created Scene before declaring it missing on another device", () => {
    const detail = read("app/scenes/[sceneId].tsx");

    expect(detail).toContain('import {\n  syncScenesWithCloud,\n} from "../../lib/scene-sync";');
    expect(detail).toMatch(/await syncScenesWithCloud\(\);[\s\S]*storedScene = sceneId[\s\S]*await getSceneById\(sceneId\)/);
    expect(detail).toContain("artworkLoadRef.current !== artworkLoad");
    expect(detail).toContain("showing the latest local copy instead");
  });
});
