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

  it("uses dynamic semantic colors throughout every StyleSheet-backed app surface", () => {
    const visit = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return visit(absolute);
        return entry.name.endsWith(".tsx") ? [absolute] : [];
      });

    const canonicalLiterals = [
      '"#080B0C"', '"#0F1514"', '"#151D1B"', '"#F7F4EC"',
      '"#A5AEA9"', '"#29332F"', '"#72D8C4"', '"#A991E8"',
      '"#FF9289"', '"#10201C"',
    ];

    for (const file of visit(path.join(root, "app"))) {
      if (file.endsWith("appearance.tsx")) continue;
      const source = fs.readFileSync(file, "utf8");
      const styleIndex = source.indexOf("StyleSheet.create");
      if (styleIndex < 0) continue;
      const styles = source.slice(styleIndex);
      for (const literal of canonicalLiterals) {
        expect(`${path.relative(root, file)}:${literal}:${styles.includes(literal)}`).toBe(
          `${path.relative(root, file)}:${literal}:false`,
        );
      }
    }
  });

  it("lets the shared ambient motion remain visible through every route canvas", () => {
    const colors = fs.readFileSync(
      path.join(root, "theme", "canal-dynamic-colors.ts"),
      "utf8",
    );

    expect(colors).toContain('canvas: dynamicColor("rgba(243,239,229,0.94)", "rgba(8,11,12,0.94)")');
    expect(colors).toContain('baseCanvas: dynamicColor("#F3EFE5", "#080B0C")');
  });
});
