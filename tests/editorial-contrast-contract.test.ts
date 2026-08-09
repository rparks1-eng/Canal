import fs from "node:fs";
import path from "node:path";

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Living Editorial contrast", () => {
  it.each([
    ["primary text", "#F7F4EC", "#080B0C", 7],
    ["secondary text on page", "#A5AEA9", "#080B0C", 4.5],
    ["secondary text on cards", "#A5AEA9", "#0F1514", 4.5],
    ["dark label on mint", "#10201C", "#72D8C4", 4.5],
    ["dark label on lavender", "#10201C", "#A991E8", 4.5],
    ["danger text on cards", "#FF9289", "#0F1514", 4.5],
  ])("keeps %s above its minimum ratio", (_name, foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum as number);
  });

  it.each([
    ["light primary text", "#191A18", "#F3EFE5", 7],
    ["light secondary text", "#5C5A54", "#F3EFE5", 4.5],
    ["light card secondary text", "#5C5A54", "#FFFDF8", 4.5],
    ["light mint action", "#FFFFFF", "#297B56", 4.5],
    ["light lavender accent", "#FFFFFF", "#5B55CE", 4.5],
    ["light danger text", "#B94139", "#FFFFFF", 4.5],
  ])("keeps %s above its minimum ratio", (_name, foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum as number);
  });

  it("uses readable header actions and Library secondary roles", () => {
    const root = path.resolve(__dirname, "..");
    const actions = fs.readFileSync(
      path.join(root, "components", "canal-ui", "canal-header-actions.tsx"),
      "utf8",
    );
    const library = fs.readFileSync(path.join(root, "app", "(tabs)", "library.tsx"), "utf8");

    expect(actions).toContain('tone = "auto"');
    expect(actions).toContain("canalDynamicColors.text");
    expect(library).not.toContain('color: "#5C5A54"');
    expect(library).not.toContain('color: "#A62E27"');
  });
});
