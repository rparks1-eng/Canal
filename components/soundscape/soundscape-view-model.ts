import type { SoundscapeArchive, SoundscapeSceneEvolution } from "../../lib/soundscape-types";

export type SoundscapeSeason = {
  key: "winter" | "spring" | "summer" | "fall";
  label: string;
  scenes: SoundscapeSceneEvolution[];
};

export type SoundscapeMonth = {
  index: number;
  label: string;
  scenes: SoundscapeSceneEvolution[];
  playbackCount: number;
};

export function soundscapeSeasons(archive: SoundscapeArchive): SoundscapeSeason[] {
  const values: SoundscapeSeason[] = [
    { key: "winter", label: "Winter", scenes: [] },
    { key: "spring", label: "Spring", scenes: [] },
    { key: "summer", label: "Summer", scenes: [] },
    { key: "fall", label: "Fall", scenes: [] },
  ];
  for (const scene of archive.content.sceneEvolution) {
    const month = new Date(scene.lastChangedAt).getUTCMonth();
    if (Number.isFinite(month)) values[Math.floor(month / 3)]?.scenes.push(scene);
  }
  return values;
}

export function soundscapeMonths(archive: SoundscapeArchive): SoundscapeMonth[] {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels.map((label, index) => ({
    index,
    label,
    scenes: archive.content.sceneEvolution.filter((scene) => new Date(scene.lastChangedAt).getUTCMonth() === index),
    playbackCount: archive.content.playbackTrail.filter((trail) => new Date(trail.startedAt).getUTCMonth() === index).length,
  }));
}

export function soundscapeDailyPhases(archive: SoundscapeArchive) {
  const phases = [
    { key: "morning", label: "Morning", patterns: /morning|wake|breakfast|commute|focus|work/u },
    { key: "day", label: "Day", patterns: /day|work|study|focus|lunch|drive/u },
    { key: "evening", label: "Evening", patterns: /evening|dinner|social|party|workout/u },
    { key: "late", label: "Late night", patterns: /night|sleep|wind|reflect|late/u },
  ];
  return phases.map((phase) => ({
    key: phase.key,
    label: phase.label,
    signals: archive.content.topActivities.filter((item) => phase.patterns.test(item.label.toLocaleLowerCase("en-US"))),
  }));
}

export function availableShareFormats(archive: SoundscapeArchive) {
  const hasFinishedMedia = archive.content.snapshots.some((item) => item.compositionState === "ready" && item.shareable);
  return [
    { key: "link", label: "Link preview", enabled: archive.visibility !== "private" },
    { key: "still", label: "Still", enabled: hasFinishedMedia },
    { key: "motion", label: "Living motion", enabled: archive.content.snapshots.some((item) => item.mediaType === "video" && item.compositionState === "ready" && item.shareable) },
  ];
}

export function soundscapeChapterIndex(current: number, requested: number): number {
  if (!Number.isFinite(requested)) return Math.max(0, Math.min(9, Math.round(current)));
  return Math.max(0, Math.min(9, Math.round(requested)));
}

export function soundscapeSceneSeed(activity: string, mood: string) {
  return {
    activity: activity.trim() || "Listening",
    moods: [mood.trim() || "Open"],
    genres: [] as string[],
    familiarity: "Balanced",
    allowAdjacentGenres: true,
    allowExplicit: false,
    notes: "Created from my Soundscape",
  };
}
