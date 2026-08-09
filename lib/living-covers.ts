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
  genres?: string | null;
  name?: string | null;
  energy?: number | null;
  capturedAt?: string;
}>): Readonly<{ templateId: LivingCoverTemplateId }> {
  const signals = [input.name, input.activity, input.mood, input.genres]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  const scores: Record<LivingCoverKey, number> = {
    solar: 0, ember: 0, verdant: 0, tide: 0, cobalt: 0,
    violet: 0, rose: 0, copper: 0, silver: 0, midnight: 0,
  };
  const score = (key: LivingCoverKey, pattern: RegExp, weight: number): void => {
    scores[key] += signals.filter((value) => pattern.test(value)).length * weight;
  };

  score("solar", /morning|start the day|daylight|sunrise|happy|hopeful|euphoric|playful|celebratory|disco|funk|dance pop/u, 6);
  score("ember", /workout|training|party|celebrat|energ|restless|fierce|rock|metal|punk|edm|house/u, 6);
  score("verdant", /focus|focused|study|\bwork\b|grounded|steady|productive|outdoors|get outside|hiking|instrumental|lo-fi|lofi/u, 6);
  score("tide", /unwind|relax|recovery|recover|sleep|calm|clear|serene|chill|downtempo|ambient/u, 6);
  score("cobalt", /drive|driving|commute|transit|gaming|game|confident|hip.?hop|rap|electronic|synthwave/u, 6);
  score("violet", /create|creative|curious|dream|adventur|explore|\bart\b|alternative|indie|psychedelic/u, 6);
  score("rose", /social|romantic|intimate|sensual|\bdate\b|tender|r&b|rnb|neo.?soul|slow jam/u, 7);
  score("copper", /cook|kitchen|cozy|warm|nostalg|folk|country|americana|blues/u, 7);
  score("silver", /\bread(?:ing)?\b|reflect|bittersweet|quiet|clear mind|acoustic|classical|jazz|piano|rain/u, 7);
  score("midnight", /midnight|after dark|late night|moody|rebellious|intense|noir|goth|darkwave|trap/u, 7);

  if (typeof input.energy === "number" && Number.isFinite(input.energy)) {
    if (input.energy >= 75) scores.ember += 3;
    else if (input.energy <= 25) {
      scores.tide += 2;
      scores.silver += 1;
    } else scores.verdant += 1;
  }

  const hourMatch = input.capturedAt?.match(/T(\d{2}):/u);
  const hour = hourMatch ? Number(hourMatch[1]) : null;
  if (hour !== null && Number.isInteger(hour)) {
    if (hour >= 5 && hour < 11) scores.solar += 4;
    else if (hour >= 17 && hour < 21) scores.copper += 2;
    else if (hour >= 21 || hour < 5) scores.midnight += 4;
  }

  const orderedKeys = LIVING_COVER_RECIPES.map((recipe) => recipe.key);
  const key = orderedKeys.reduce<LivingCoverKey>(
    (best, candidate) => scores[candidate] > scores[best] ? candidate : best,
    "midnight",
  );
  return { templateId: `living-${key}` };
}

export function getLivingCoverRecipe(templateId: LivingCoverTemplateId): LivingCoverRecipe {
  const key = templateId.replace("living-", "") as LivingCoverKey;
  return RECIPES[key] ?? RECIPES.midnight;
}
