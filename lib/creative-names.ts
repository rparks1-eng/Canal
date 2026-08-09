type CreativeNameInput = {
  activity?: string;
  moods?: readonly string[];
  energy?: string;
  arc?: string;
  genres?: readonly string[];
};

type CreativeNameOptions = {
  seed?: string;
  existingNames?: readonly string[];
  now?: Date;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function choose(values: readonly string[], seed: string): string {
  return values[hash(seed) % values.length];
}

const ATMOSPHERES = [
  "Velvet", "Neon", "Golden", "Electric", "Quiet", "Wild", "Silver",
  "Soft", "Midnight", "Open", "Lucid", "Slow", "Bright", "Blue",
] as const;

const TEXTURES = [
  "Static", "Bloom", "Weather", "Current", "Voltage", "Horizon", "Signal",
  "Glow", "Motion", "Echo", "Fever", "Drift", "Gravity", "Afterlight",
] as const;

const PHRASE_ENDINGS = [
  "Before the City Wakes",
  "Where the Light Lands",
  "For the Long Way Home",
  "While the Room Is Quiet",
  "Until the Streetlights Fade",
  "Between Here and Morning",
  "For Windows Left Open",
  "When the Air Changes",
  "A Little Further Out",
  "The Part We Keep",
] as const;

const DAY_FORMS: Record<number, readonly string[]> = {
  0: ["Sunday Soft Focus", "The Long Sunday", "Sunday, Unhurried"],
  1: ["Monday Without the Rush", "A Better Monday", "Monday in Motion"],
  2: ["Tuesday Afterglow", "The Shape of Tuesday", "Tuesday, Wide Open"],
  3: ["Midweek in Stereo", "Wednesday Weather", "Halfway to Somewhere"],
  4: ["Thursday Night Theory", "Almost Friday", "Thursday, After Dark"],
  5: ["Friday Finds Its Pulse", "After Five on Friday", "Friday in Full Color"],
  6: ["Saturday Has No Clock", "The Saturday Current", "Saturday, Slowly"],
};

function timeForms(hour: number): readonly string[] {
  if (hour < 5) return ["After Midnight", "The Quietest Hour", "Still Awake Somewhere"];
  if (hour < 9) return ["Before the City Wakes", "First Light, No Rush", "Morning Finds a Frequency"];
  if (hour < 12) return ["Late Morning, Wide Open", "Sun Through the Windows", "The Day Begins Here"];
  if (hour < 17) return ["In the Middle of the Day", "Afternoon in Motion", "Light on Everything"];
  if (hour < 21) return ["Blue Hour Arrives", "When the Day Lets Go", "Evening Finds Its Shape"];
  return ["After the Streetlights", "Tonight, a Little Slower", "The Room After Dark"];
}

function personalFormPreference(existingNames: readonly string[]): "compact" | "phrase" | "mixed" {
  const names = existingNames.map((name) => name.trim()).filter(Boolean).slice(0, 30);
  if (names.length < 3) return "mixed";
  const phraseCount = names.filter((name) => name.split(/\s+/u).length >= 4 || /[,/:—]/u.test(name)).length;
  if (phraseCount / names.length >= 0.6) return "phrase";
  if (phraseCount / names.length <= 0.25) return "compact";
  return "mixed";
}

function seededOrder(values: readonly string[], seed: string): string[] {
  return [...values].sort((left, right) => hash(`${seed}:${left}`) - hash(`${seed}:${right}`));
}

const STAGE_FORMS = [
  "Common Frequency", "Open Circuit", "Shared Weather", "Afterhours Assembly",
  "Signal Union", "The Listening Room", "Parallel Hearts", "Mutual Orbit",
] as const;

function contextualAtmospheres(input: CreativeNameInput): readonly string[] {
  const context = normalize([
    input.activity,
    ...(input.moods ?? []),
    input.energy,
    input.arc,
    ...(input.genres ?? []),
  ].filter(Boolean).join(" "));

  if (/sleep|calm|reflect|ambient|low|intimate|dream/u.test(context)) {
    return ["Velvet", "Quiet", "Soft", "Midnight", "Lucid", "Blue"];
  }
  if (/workout|party|dance|high|euphor|energetic|playful/u.test(context)) {
    return ["Electric", "Neon", "Wild", "Bright", "Golden", "Open"];
  }
  if (/focus|study|work|grounded|steady/u.test(context)) {
    return ["Quiet", "Silver", "Lucid", "Open", "Slow", "Velvet"];
  }
  return ATMOSPHERES;
}

function contextualTextures(input: CreativeNameInput): readonly string[] {
  const context = normalize(`${input.activity ?? ""} ${input.arc ?? ""} ${input.energy ?? ""}`);
  if (/build|high|workout|party/u.test(context)) {
    return ["Voltage", "Motion", "Current", "Fever", "Gravity", "Horizon"];
  }
  if (/waves|medium/u.test(context)) {
    return ["Weather", "Current", "Echo", "Signal", "Drift", "Glow"];
  }
  if (/sleep|low|steady/u.test(context)) {
    return ["Afterlight", "Drift", "Bloom", "Echo", "Horizon", "Static"];
  }
  return TEXTURES;
}

function uniqueName(
  candidates: readonly string[],
  existingNames: readonly string[],
): string {
  const used = new Set(existingNames.map(normalize));
  const available = candidates.find((candidate) => !used.has(normalize(candidate)));
  if (available) return available;

  const base = candidates[0];
  let edition = 2;
  while (used.has(normalize(`${base} No. ${edition}`))) edition += 1;
  return `${base} No. ${edition}`;
}

export function generateCreativeSceneName(
  input: CreativeNameInput,
  options: CreativeNameOptions = {},
): string {
  const seed = options.seed ?? `${Date.now()}`;
  const now = options.now ?? new Date();
  const existingNames = options.existingNames ?? [];
  const atmospheres = contextualAtmospheres(input);
  const textures = contextualTextures(input);
  const first = choose(atmospheres, `${seed}:atmosphere`);
  const second = choose(textures, `${seed}:texture`);
  const alternateFirst = choose(atmospheres, `${seed}:alternate-atmosphere`);
  const alternateSecond = choose(textures, `${seed}:alternate-texture`);
  const compactCandidates = [
    `${first} ${second}`,
    `${alternateFirst} ${second}`,
    `${first} ${alternateSecond}`,
    `The ${second} Between`,
    `${alternateFirst} Hours`,
    `${second} in Stereo`,
  ];

  const phraseCandidates = [
    choose(timeForms(now.getHours()), `${seed}:time`),
    choose(DAY_FORMS[now.getDay()], `${seed}:day`),
    `${first} ${choose(PHRASE_ENDINGS, `${seed}:phrase`)}`,
    `${choose(PHRASE_ENDINGS, `${seed}:phrase-two`)}`,
    `${second}, Then Everything Else`,
    `This Is Where ${alternateFirst} Begins`,
  ];

  const preference = personalFormPreference(existingNames);
  const candidates = preference === "phrase"
    ? [...seededOrder(phraseCandidates, seed), ...seededOrder(compactCandidates, seed)]
    : preference === "compact"
      ? [...seededOrder(compactCandidates, seed), ...seededOrder(phraseCandidates, seed)]
      : seededOrder([...compactCandidates, ...phraseCandidates], seed);

  return uniqueName(candidates, existingNames);
}

export function generateCreativeStageName(
  input: CreativeNameInput & { sceneName?: string },
  options: { seed?: string; existingNames?: readonly string[] } = {},
): string {
  const seed = options.seed ?? `${Date.now()}`;
  const sceneName = input.sceneName?.trim();
  const creativeScene = generateCreativeSceneName(input, { seed });
  const candidates = [
    choose(STAGE_FORMS, `${seed}:stage-form`),
    `${creativeScene} Social Club`,
    `${choose(contextualTextures(input), `${seed}:stage-texture`)} Exchange`,
    sceneName ? `${sceneName} / Open Room` : "The Open Room",
    `Tonight at ${creativeScene}`,
  ];

  return uniqueName(candidates, options.existingNames ?? []);
}
