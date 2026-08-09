import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("Light, Dark and System appearance", () => {
  it("persists the setting and applies it through React Native Appearance", () => {
    const source = fs.readFileSync(path.join(root, "theme", "canal-appearance.tsx"), "utf8");

    expect(source).toContain('"light" | "dark" | "system"');
    expect(source).toContain("AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)");
    expect(source).toContain("AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, nextMode)");
    expect(source).toContain('Appearance.setColorScheme(mode === "system" ? null : mode)');
    expect(source).toContain("resolvedScheme");
    expect(source).toContain("SystemUI.setBackgroundColorAsync");
    expect(source).toContain('resolvedScheme === "dark" ? "light" : "dark"');
  });

  it("exposes Settings to Appearance navigation and accessible radio choices", () => {
    const settings = fs.readFileSync(path.join(root, "app", "settings.tsx"), "utf8");
    const appearance = fs.readFileSync(path.join(root, "app", "appearance.tsx"), "utf8");
    const layout = fs.readFileSync(path.join(root, "app", "_layout.tsx"), "utf8");

    expect(settings).toContain('router.push("/appearance")');
    expect(layout).toContain('name="appearance"');
    expect(layout).toContain("<CanalAppearanceProvider>");
    expect(appearance).toContain('accessibilityRole="radio"');
    expect(appearance).toContain("accessibilityState={{ checked: selected }}");
  });

  it("does not force route status bars against the selected appearance", () => {
    const visit = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return visit(absolute);
        return entry.name.endsWith(".tsx") ? [absolute] : [];
      });

    for (const file of visit(path.join(root, "app"))) {
      const source = fs.readFileSync(file, "utf8");
      expect(`${path.relative(root, file)}:${/<StatusBar style="(?:light|dark)"/u.test(source)}`).toBe(
        `${path.relative(root, file)}:false`,
      );
    }
  });

  it("lets the shared ambient motion remain visible through every route canvas", () => {
    const colors = fs.readFileSync(
      path.join(root, "theme", "canal-dynamic-colors.ts"),
      "utf8",
    );

    expect(colors).toContain('canvas: dynamicColor("rgba(221,244,242,0.72)", "rgba(8,38,57,0.56)")');
    expect(colors).toContain('baseCanvas: dynamicColor("#DDF4F2", "#102E43")');
    expect(colors).toContain('ambientWash: dynamicColor("rgba(255,255,255,0.22)", "rgba(4,23,39,0.08)")');
  });
});
