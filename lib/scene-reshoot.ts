import type { StoredScene } from "./scenes";
import {
  createSceneStudioDraft,
  SCENE_ACTIVITY_OPTIONS,
  SCENE_MOOD_OPTIONS,
  type SceneActivity,
  type SceneEnergy,
  type SceneMood,
  type SceneStudioDraft,
} from "./scene-studio";

function tokens(value: string): string[] {
  return value.split(/[,•|/]+/u).map((item) => item.trim()).filter(Boolean);
}

function activity(value: string): SceneActivity {
  const normalized = value.trim().toLowerCase();
  return SCENE_ACTIVITY_OPTIONS.find((option) => option.value === normalized || option.label.toLowerCase() === normalized)?.value ?? "focus";
}

function moods(scenes: readonly StoredScene[]): SceneMood[] {
  const available = new Map(SCENE_MOOD_OPTIONS.flatMap((option) => [[option.value, option.value], [option.label.toLowerCase(), option.value]]));
  return Array.from(new Set(scenes.flatMap((scene) => tokens(scene.emotions).map((value) => available.get(value.toLowerCase())).filter((value): value is SceneMood => Boolean(value))))).slice(0, 5);
}

function energy(scenes: readonly StoredScene[]): SceneEnergy {
  const values = scenes.map((scene) => scene.energy.toLowerCase());
  if (values.filter((value) => value.includes("high")).length > values.filter((value) => value.includes("low")).length) return "high";
  if (values.filter((value) => value.includes("low")).length > values.filter((value) => value.includes("high")).length) return "low";
  return "medium";
}

export function buildSceneReshootDraft(source: StoredScene, libraryScenes: readonly StoredScene[]): SceneStudioDraft {
  const combined = [source, ...libraryScenes.slice(0, 4)];
  const base = createSceneStudioDraft();
  const combinedMoods = moods(combined);
  return {
    ...base,
    activity: activity(source.activity),
    moods: combinedMoods.length > 0 ? combinedMoods : ["curious"],
    preferredGenres: Array.from(new Set(combined.flatMap((scene) => tokens(scene.genres)))).slice(0, 5),
    durationMinutes: Math.min(180, Math.max(15, Number.parseInt(source.duration, 10) || 35)),
    energy: energy(combined),
    familiarity: "balanced",
    familiarityLevel: 50,
    notes: `Take inspiration from “${source.name}”${libraryScenes.length > 0 ? ` and blend it with ${libraryScenes.slice(0, 4).map((scene) => `“${scene.name}”`).join(", ")}` : " while adapting it to my own music taste"}. Keep the result distinct and personal.`,
  };
}
