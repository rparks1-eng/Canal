import {
  DynamicColorIOS,
  Platform,
} from "react-native";

function dynamicColor(light: string, dark: string): string {
  if (Platform.OS === "ios" && typeof DynamicColorIOS === "function") {
    return DynamicColorIOS({ light, dark }) as unknown as string;
  }

  return dark;
}

export const canalDynamicColors = {
  baseCanvas: dynamicColor("#DDF4F2", "#102E43"),
  canvas: dynamicColor("rgba(221,244,242,0.72)", "rgba(8,38,57,0.56)"),
  surface: dynamicColor("rgba(248,255,254,0.78)", "rgba(5,36,55,0.72)"),
  elevated: dynamicColor("rgba(255,255,255,0.90)", "rgba(18,57,82,0.80)"),
  text: dynamicColor("#102C3A", "#F6FEFF"),
  muted: dynamicColor("#496875", "#B5CCD4"),
  line: dynamicColor("rgba(16,58,76,0.16)", "rgba(220,255,249,0.20)"),
  mint: dynamicColor("#167866", "#8DE5D2"),
  lavender: dynamicColor("#4A64C5", "#9B9FEF"),
  gold: dynamicColor("#8A5B12", "#F0D17E"),
  danger: dynamicColor("#B94139", "#FF9289"),
  successSurface: dynamicColor("#EAF9EF", "#10241E"),
  warningSurface: dynamicColor("#FFF4E9", "#2A2015"),
  dangerSurface: dynamicColor("#FFF0EF", "#261716"),
  ambientWash: dynamicColor("rgba(255,255,255,0.22)", "rgba(4,23,39,0.08)"),
  onAccent: dynamicColor("#FFFFFF", "#0D3D4D"),
} as const;
