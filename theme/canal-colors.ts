export type CanalColorScheme = "light" | "dark";

const light = {
  page: "#DDF4F2",
  surface: "rgba(248, 255, 254, 0.78)",
  elevated: "rgba(255, 255, 255, 0.9)",
  ink: "#102C3A",
  muted: "#496875",
  line: "rgba(16, 58, 76, 0.16)",
  glass: "rgba(241, 255, 252, 0.68)",
  accent: "#4A64C5",
  mint: "#167866",
  gold: "#8B6118",
  danger: "#A93640",
  onAccent: "#FFFFFF",
};

const dark = {
  page: "#102E43",
  surface: "rgba(5, 36, 55, 0.72)",
  elevated: "rgba(18, 57, 82, 0.8)",
  ink: "#F6FEFF",
  muted: "#B5CCD4",
  line: "rgba(220, 255, 249, 0.2)",
  glass: "rgba(4, 34, 54, 0.66)",
  accent: "#9B9FEF",
  mint: "#8DE5D2",
  gold: "#F0D17E",
  danger: "#FF9289",
  onAccent: "#0D3D4D",
};

export const canalColors = {
  light,
  dark,
  mood: {
    lavender: "#787DFF",
    mint: "#82D5AA",
    gold: "#E1BD67",
    coral: "#D45D54",
  },
} as const;

export function getCanalColors(
  scheme: CanalColorScheme | null | undefined,
) {
  return scheme === "dark" ? canalColors.dark : canalColors.light;
}
