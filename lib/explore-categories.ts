import type { PublicCanalScene } from "./social";

export type ExploreCategoryKind = "activity" | "mood" | "genre";
export type ExploreCategoryScope = "public" | "verified";

export function exploreCategoryValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,•|/]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isExploreCategoryKind(value: unknown): value is ExploreCategoryKind {
  return value === "activity" || value === "mood" || value === "genre";
}

export function exploreCategoryIcon(kind: ExploreCategoryKind, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (kind === "activity") {
    if (/workout|gym|lifting/u.test(normalized)) return "barbell-outline";
    if (/run|jog/u.test(normalized)) return "fitness-outline";
    if (/walk|hike/u.test(normalized)) return "walk-outline";
    if (/drive|commute|road/u.test(normalized)) return "car-outline";
    if (/work|office/u.test(normalized)) return "laptop-outline";
    if (/study|read/u.test(normalized)) return "book-outline";
    if (/cook|dinner/u.test(normalized)) return "restaurant-outline";
    if (/sleep|unwind|wind.?down/u.test(normalized)) return "moon-outline";
    if (/party|social|date/u.test(normalized)) return "people-outline";
    if (/outdoor|nature/u.test(normalized)) return "leaf-outline";
    return "compass-outline";
  }
  if (kind === "mood") {
    if (/calm|peace|soft/u.test(normalized)) return "water-outline";
    if (/happy|bright|joy/u.test(normalized)) return "sunny-outline";
    if (/focus|reflect/u.test(normalized)) return "eye-outline";
    if (/energy|euphor|charged/u.test(normalized)) return "flash-outline";
    if (/romantic|love|tender/u.test(normalized)) return "heart-outline";
    if (/sad|melanch|blue/u.test(normalized)) return "rainy-outline";
    if (/confident|bold/u.test(normalized)) return "flame-outline";
    if (/nostalg/u.test(normalized)) return "time-outline";
    if (/dream/u.test(normalized)) return "cloud-outline";
    return "sparkles-outline";
  }
  if (/rock/u.test(normalized)) return "flash-outline";
  if (/r&b|soul/u.test(normalized)) return "heart-outline";
  if (/hip.?hop|rap/u.test(normalized)) return "mic-outline";
  if (/electronic|dance|house|techno/u.test(normalized)) return "pulse-outline";
  if (/jazz/u.test(normalized)) return "cafe-outline";
  if (/classical|orchestral/u.test(normalized)) return "musical-notes-outline";
  if (/country|folk/u.test(normalized)) return "leaf-outline";
  if (/pop/u.test(normalized)) return "star-outline";
  if (/ambient/u.test(normalized)) return "cloud-outline";
  return "headset-outline";
}

export function filterExploreCategoryScenes(
  scenes: readonly PublicCanalScene[],
  options: {
    kind: ExploreCategoryKind;
    value: string;
    scope: ExploreCategoryScope;
    query?: string;
  },
): PublicCanalScene[] {
  const category = options.value.trim().toLowerCase();
  const query = options.query?.trim().toLowerCase() ?? "";
  if (!category) return [];

  return scenes.filter((item) => {
    if (options.scope === "verified" && !item.creator.isVerified && !item.creator.isCanal) {
      return false;
    }
    const values = options.kind === "activity"
      ? [item.scene.activity]
      : exploreCategoryValues(options.kind === "mood" ? item.scene.emotions : item.scene.genres);
    if (!values.some((value) => value.trim().toLowerCase() === category)) return false;
    if (!query) return true;
    return [
      item.scene.name,
      item.scene.activity,
      item.scene.emotions,
      item.scene.genres,
      item.creator.displayName,
      item.creator.handle,
      ...item.scene.tracks.map((track) => `${track.title} ${track.artist}`),
    ].join(" ").toLowerCase().includes(query);
  });
}
