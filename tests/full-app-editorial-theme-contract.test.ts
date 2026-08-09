import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);

    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.name.endsWith(".tsx") ? [absolute] : [];
  });
}

describe("full-app Living Editorial theme", () => {
  it("removes the retired cream and legacy brand palette from every app surface", () => {
    const retiredRoles = [
      /backgroundcolor:\s*["']#f3efe5["']/u,
      /backgroundcolor:\s*["']#fffdf8["']/u,
      /backgroundcolor:\s*["']#ffffff["']/u,
      /backgroundcolor:\s*["']#fff0e5["']/u,
      /backgroundcolor:\s*["']#fff1e5["']/u,
      /backgroundcolor:\s*["']#f47a24["']/u,
      /backgroundcolor:\s*["']#ff9a50["']/u,
      /color:\s*["']#191a18["']/u,
      /color:\s*["']#6d6b64["']/u,
      /color:\s*["']#4c46c8["']/u,
    ];

    for (const file of sourceFiles(path.join(projectRoot, "app"))) {
      const source = fs.readFileSync(file, "utf8").toLowerCase();

      for (const role of retiredRoles) {
        expect(`${path.relative(projectRoot, file)}:${role}:${role.test(source)}`).toBe(
          `${path.relative(projectRoot, file)}:${role}:false`,
        );
      }
    }
  });

  it("uses one persistent icon-based five-destination navigation bar", () => {
    const navigation = fs.readFileSync(
      path.join(projectRoot, "components", "CanalBottomNav.tsx"),
      "utf8",
    );

    expect(navigation).toContain('label: "Home"');
    expect(navigation).toContain('label: "Explore"');
    expect(navigation).toContain('label: "Create"');
    expect(navigation).toContain('label: "Library"');
    expect(navigation).toContain('label: "Profile"');
    expect(navigation).toContain("Ionicons");
    expect(navigation).toContain('symbol: "albums-outline"');
    expect(navigation).toContain("navAtmosphere");
    expect(navigation).toContain("${navAtmosphere.accent}66");
    expect(navigation).not.toContain("rgba(72, 204, 167, 0.30)");
    expect(navigation).not.toContain('symbol: "⌂"');
    expect(navigation).not.toContain('symbol: "⌕"');
  });

  it("keeps the editorial canvas and ambient motion behind every stack route", () => {
    const layout = fs.readFileSync(path.join(projectRoot, "app", "_layout.tsx"), "utf8");

    expect(layout).toContain("<CanalAmbientBackground />");
    expect(layout).toContain('backgroundColor:\n              "transparent"');
    expect(layout).toContain("canalDynamicColors.baseCanvas");
    expect(layout).toContain("<CanalAmbientBackground />");
    expect(layout).toContain('animation:\n            reducedMotion');
  });

  it("changes the animated atmosphere by route family without hiding content", () => {
    const atmosphere = fs.readFileSync(
      path.join(projectRoot, "components", "canal-ui", "canal-ambient-background.tsx"),
      "utf8",
    );

    expect(atmosphere).toContain("atmosphereForPath");
    expect(atmosphere).toContain('pathname.startsWith("/explore")');
    expect(atmosphere).toContain('pathname.startsWith("/settings")');
    expect(atmosphere).toContain('pathname.startsWith("/profile")');
    expect(atmosphere).toContain('pathname.startsWith("/scenes")');
    expect(atmosphere).toContain('pathname.startsWith("/live-stage")');
    expect(atmosphere).toContain("useReducedMotion");
    expect(atmosphere).toContain('pointerEvents="none"');
  });

  it("does not leave fixed cream surfaces that stay bright in Dark mode", () => {
    const fixedCreams = [
      "#fbf7f0", "#fffdf9", "#fff9f4", "#f4f0ec", "#f0e7df",
      "#eee7df", "#f0eae3", "#fff0ef", "#eaf9ef", "#fff4e9",
    ];

    for (const file of [
      ...sourceFiles(path.join(projectRoot, "app")),
      ...sourceFiles(path.join(projectRoot, "components")),
    ]) {
      const source = fs.readFileSync(file, "utf8").toLowerCase();
      for (const color of fixedCreams) {
        expect(`${path.relative(projectRoot, file)}:${color}:${source.includes(color)}`).toBe(
          `${path.relative(projectRoot, file)}:${color}:false`,
        );
      }
    }
  });

  it("gives every core destination the approved immersive composition", () => {
    const routes = [
      ["app/(tabs)/index.tsx", "What should this moment sound like?"],
      ["app/(tabs)/explore.tsx", "Explore"],
      ["app/(tabs)/library.tsx", "Library"],
      ["app/(tabs)/profile.tsx", "Profile"],
      ["app/settings.tsx", "Settings"],
    ] as const;

    for (const [relativePath, identity] of routes) {
      const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source).toContain(identity);
      expect(source).toMatch(/backgroundColor:\s*"transparent"/u);
      expect(source).toContain("canalDynamicColors.surface");
      expect(source).toContain("canalDynamicColors.line");
    }
  });

  it("does not let a secondary route hide the shared atmosphere", () => {
    for (const file of sourceFiles(path.join(projectRoot, "app"))) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/backgroundColor:\s*canalDynamicColors\.canvas/u);
    }
  });
});
