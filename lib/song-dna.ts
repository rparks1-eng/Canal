const GENRE_RULES: readonly (readonly [string, readonly string[]])[] = [
  ["Hip-hop", ["hip hop", "hip-hop", "rap", "trap"]],
  ["R&B", ["r&b", "rnb", "rhythm and blues", "neo soul", "neo-soul"]],
  ["Pop", ["pop", "dance pop", "synthpop"]],
  ["Electronic", ["electronic", "edm", "house", "techno", "ambient", "dance"]],
  ["Rock", ["rock", "punk", "metal", "grunge"]],
  ["Indie", ["indie", "alternative", "bedroom pop"]],
  ["Jazz", ["jazz", "bebop", "swing"]],
  ["Classical", ["classical", "orchestral", "chamber", "piano"]],
  ["Country/Folk", ["country", "folk", "americana", "bluegrass"]],
  ["Latin", ["latin", "reggaeton", "salsa", "bachata"]],
];

const MOOD_RULES: readonly (readonly [string, readonly string[]])[] = [
  ["Energized", ["energy", "energetic", "dance", "party", "rush", "power", "anthem"]],
  ["Calm", ["calm", "peace", "gentle", "quiet", "soft", "serene", "sleep"]],
  ["Focused", ["focus", "concentration", "work", "study", "instrumental"]],
  ["Romantic", ["love", "romance", "desire", "intimate", "relationship"]],
  ["Melancholic", ["heartbreak", "loss", "grief", "sad", "lonely", "regret"]],
  ["Confident", ["confidence", "triumph", "victory", "bold", "empower"]],
  ["Nostalgic", ["memory", "nostalgia", "childhood", "past", "remember"]],
  ["Dreamy", ["dream", "ethereal", "atmospheric", "floating", "surreal"]],
  ["Social", ["friends", "together", "celebration", "crowd", "community"]],
  ["Reflective", ["reflection", "identity", "meaning", "journey", "story", "self"]],
];

export const SONG_DNA_TAXONOMY_VERSION = 1;

export type CanalSongDna = Readonly<{
  genres: readonly string[];
  moods: readonly string[];
  confidence: "low" | "medium" | "high";
  sources: readonly ("spotify" | "genius" | "canal")[];
  taxonomyVersion: number;
}>;

export type SongSceneMoodEvidence = Readonly<{
  label: string;
  personalCount: number;
  communityCount: number;
}>;

function normalized(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, 24);
}

function labelsFor(text: string, rules: readonly (readonly [string, readonly string[]])[], limit: number): string[] {
  const normalizedText = ` ${text.toLowerCase().replace(/[^a-z0-9&]+/gu, " ")} `;
  return rules
    .filter(([, keywords]) => keywords.some((keyword) => normalizedText.includes(` ${keyword.toLowerCase()} `)))
    .map(([label]) => label)
    .slice(0, limit);
}

function rankedMoodLabels(storyText: string, spotifyText: string, evidence: readonly SongSceneMoodEvidence[]): string[] {
  const scores = new Map<string, number>();
  for (const label of labelsFor(storyText, MOOD_RULES, MOOD_RULES.length)) scores.set(label, (scores.get(label) ?? 0) + 4);
  for (const label of labelsFor(spotifyText, MOOD_RULES, MOOD_RULES.length)) scores.set(label, (scores.get(label) ?? 0) + 1);
  for (const item of evidence) {
    const direct = MOOD_RULES.find(([label]) => label.toLowerCase() === item.label.trim().toLowerCase())?.[0];
    const canonical = direct ?? labelsFor(item.label, MOOD_RULES, 1)[0];
    if (!canonical) continue;
    const personal = Number.isSafeInteger(item.personalCount) ? Math.max(0, Math.min(20, item.personalCount)) : 0;
    const community = Number.isSafeInteger(item.communityCount) ? Math.max(0, Math.min(100, item.communityCount)) : 0;
    scores.set(canonical, (scores.get(canonical) ?? 0) + personal * 3 + community);
  }
  const order = new Map(MOOD_RULES.map(([label], index) => [label, index]));
  return [...scores.entries()]
    .sort(([leftLabel, leftScore], [rightLabel, rightScore]) => rightScore - leftScore || (order.get(leftLabel) ?? 99) - (order.get(rightLabel) ?? 99))
    .map(([label]) => label)
    .slice(0, 4);
}

export function classifyCanalSongDna(input: {
  title?: string;
  artist?: string;
  album?: string;
  genreHints?: readonly string[];
  story?: string;
  sceneMoodEvidence?: readonly SongSceneMoodEvidence[];
}): CanalSongDna {
  const genreHints = normalized(input.genreHints);
  const genreText = genreHints.join(" ");
  const storyText = [input.title, input.artist, input.album, input.story].filter(Boolean).join(" ").slice(0, 8_000);
  const genres = labelsFor(genreText, GENRE_RULES, 4);
  const moods = rankedMoodLabels(storyText, genreText, input.sceneMoodEvidence ?? []);
  const sceneSignalCount = (input.sceneMoodEvidence ?? []).reduce((total, item) => total + item.personalCount + item.communityCount, 0);
  const signalCount = genreHints.length + (input.story?.trim() ? 2 : 0) + (moods.length > 0 ? 1 : 0) + Math.min(3, sceneSignalCount);
  const sources = [
    ...(genreHints.length ? ["spotify" as const] : []),
    ...(input.story?.trim() ? ["genius" as const] : []),
    "canal" as const,
  ];
  return Object.freeze({
    genres,
    moods,
    confidence: signalCount >= 4 ? "high" : signalCount >= 2 ? "medium" : "low",
    sources: Array.from(new Set(sources)),
    taxonomyVersion: SONG_DNA_TAXONOMY_VERSION,
  });
}
