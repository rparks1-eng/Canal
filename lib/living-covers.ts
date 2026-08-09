export type LivingCoverKey =
  | "solar" | "ember" | "verdant" | "tide" | "cobalt"
  | "violet" | "rose" | "copper" | "silver" | "midnight";

export type LivingCoverTemplateId = `living-${LivingCoverKey}`;

export type LivingCoverRecipe = Readonly<{
  key: LivingCoverKey;
  templateId: LivingCoverTemplateId;
  gradient: readonly [string, string, string];
  name: string;
  activity: string;
  mood: string;
  energy: "Low" | "Medium" | "High";
}>;

const RECIPES: Readonly<Record<LivingCoverKey, LivingCoverRecipe>> = {
  solar: { key: "solar", templateId: "living-solar", gradient: ["#FF8C9E", "#E94D76", "#321B4B"], name: "First Light", activity: "Morning", mood: "Happy", energy: "Medium" },
  ember: { key: "ember", templateId: "living-ember", gradient: ["#FF846E", "#B63755", "#35152D"], name: "Open Voltage", activity: "Workout", mood: "Energized", energy: "High" },
  verdant: { key: "verdant", templateId: "living-verdant", gradient: ["#5AE0B8", "#247C83", "#122D49"], name: "Clear Current", activity: "Focus", mood: "Grounded", energy: "Medium" },
  tide: { key: "tide", templateId: "living-tide", gradient: ["#65E0D2", "#317EB5", "#182A64"], name: "Soft Motion", activity: "Unwind", mood: "Calm", energy: "Low" },
  cobalt: { key: "cobalt", templateId: "living-cobalt", gradient: ["#8396FF", "#4558BD", "#171D4E"], name: "Night Transit", activity: "Drive", mood: "Confident", energy: "High" },
  violet: { key: "violet", templateId: "living-violet", gradient: ["#C778F1", "#7045B5", "#2B174A"], name: "Signal Bloom", activity: "Create", mood: "Dreamy", energy: "Medium" },
  rose: { key: "rose", templateId: "living-rose", gradient: ["#F477A6", "#9B416E", "#351934"], name: "Velvet Afterlight", activity: "Social", mood: "Romantic", energy: "Low" },
  copper: { key: "copper", templateId: "living-copper", gradient: ["#E8A35E", "#8D6245", "#2F2931"], name: "Sunday Kitchen Radio", activity: "Cook", mood: "Warm", energy: "Medium" },
  silver: { key: "silver", templateId: "living-silver", gradient: ["#C3D4D9", "#6E8EA0", "#283848"], name: "Quiet Geometry", activity: "Focus", mood: "Reflective", energy: "Low" },
  midnight: { key: "midnight", templateId: "living-midnight", gradient: ["#4D87A8", "#343B8C", "#11152F"], name: "Midnight Architecture", activity: "Create", mood: "Intense", energy: "Medium" },
};

export const LIVING_COVER_RECIPES: readonly LivingCoverRecipe[] = [
  RECIPES.solar,
  RECIPES.ember,
  RECIPES.verdant,
  RECIPES.tide,
  RECIPES.cobalt,
  RECIPES.violet,
  RECIPES.rose,
  RECIPES.copper,
  RECIPES.silver,
  RECIPES.midnight,
];

export function classifyLivingCover(input: Readonly<{
  activity?: string | null;
  mood?: string | null;
  energy?: number | null;
  capturedAt?: string;
}>): Readonly<{ templateId: LivingCoverTemplateId }> {
  const signal = `${input.activity ?? ""} ${input.mood ?? ""}`.toLowerCase();
  let key: LivingCoverKey = "midnight";
  if (/workout|party|celebrate|energ|intense/u.test(signal)) key = "ember";
  else if (/happy|morning|playful/u.test(signal)) key = "solar";
  else if (/focus|steady|grounded|cook/u.test(signal)) key = "verdant";
  else if (/calm|unwind|clear/u.test(signal)) key = "tide";
  else if (/drive|commute|social/u.test(signal)) key = "cobalt";
  else if (/dream|create|advent/u.test(signal)) key = "violet";
  else if (/romantic|intimate/u.test(signal)) key = "rose";
  else if (/cozy|warm|nostalg/u.test(signal)) key = "copper";
  else if (/reflect/u.test(signal)) key = "silver";
  return { templateId: `living-${key}` };
}

export function getLivingCoverRecipe(templateId: LivingCoverTemplateId): LivingCoverRecipe {
  const key = templateId.replace("living-", "") as LivingCoverKey;
  return RECIPES[key] ?? RECIPES.midnight;
}
