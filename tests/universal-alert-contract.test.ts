import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

const ROOT = resolve(__dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function sourceFiles(path: string): string[] {
  return readdirSync(resolve(ROOT, path)).flatMap((name) => {
    const relative = `${path}/${name}`;
    const absolute = resolve(ROOT, relative);
    if (statSync(absolute).isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx)$/u.test(name) ? [relative] : [];
  });
}

describe("universal Canal alerts", () => {
  it("keeps native system alerts and queues accessible web dialogs", () => {
    const alertSource = source("lib/canal-alert.ts");
    const hostSource = source("components/canal-alert-host.tsx");

    expect(alertSource).toContain('Platform.OS !== "web"');
    expect(alertSource).toContain("NativeAlert.alert(");
    expect(alertSource).toContain("subscribeToCanalAlerts");
    expect(hostSource).toContain("request.buttons.map");
    expect(hostSource).toContain("accessibilityViewIsModal");
    expect(hostSource).toContain("minHeight: 48");
    expect(source("app/_layout.tsx")).toContain("<CanalAlertHost />");
  });

  it("routes every application Alert call through the universal adapter", () => {
    const files = [
      ...sourceFiles("app"),
      ...sourceFiles("components"),
      ...sourceFiles("hooks"),
    ];
    const alertCallers = files.filter((path) =>
      source(path).includes("CanalAlert.alert("),
    );

    expect(alertCallers.length).toBeGreaterThan(20);
    alertCallers.forEach((path) => {
      const value = source(path);
      expect(value).toContain("lib/canal-alert");
      expect(value).not.toMatch(/(^|[^A-Za-z])Alert[.]alert[(]/u);
      expect(value).not.toMatch(/import[\s\S]{0,80}\bAlert\b[\s\S]{0,80}from ["']react-native["']/u);
    });
  });
});
