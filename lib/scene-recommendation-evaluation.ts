import type { GeneratedSceneResult } from "./scene-studio";

export type SceneRecommendationMetrics = Readonly<{
  genrePrecision: number;
  repetitionRate: number;
  diversityRate: number;
  familiarSourceRate: number;
  discoverySourceRate: number;
  rejectedReturnRate: number;
}>;

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function evaluateSceneRecommendations(
  generations: readonly GeneratedSceneResult[],
  rejectedTrackIds: readonly string[] = [],
): SceneRecommendationMetrics {
  const signals = generations.flatMap((generation) => generation.trackSignals);
  const allIds = signals.map((signal) => signal.track.id);
  const uniqueIds = new Set(allIds);
  const requestedGenreSignals = signals.filter((signal) => signal.genreMatch?.confidence === "high").length;
  const familiarSignals = signals.filter((signal) => signal.sources.includes("top") || signal.sources.includes("recent")).length;
  const discoverySignals = signals.filter((signal) => signal.sources.includes("discovery") || signal.sources.includes("playlist")).length;
  const rejected = new Set(rejectedTrackIds);
  const rejectedReturns = signals.filter((signal) => rejected.has(signal.track.id)).length;
  return {
    genrePrecision: ratio(requestedGenreSignals, signals.length),
    repetitionRate: ratio(allIds.length - uniqueIds.size, allIds.length),
    diversityRate: ratio(uniqueIds.size, allIds.length),
    familiarSourceRate: ratio(familiarSignals, signals.length),
    discoverySourceRate: ratio(discoverySignals, signals.length),
    rejectedReturnRate: ratio(rejectedReturns, signals.length),
  };
}

export function generationDifferenceRate(
  first: GeneratedSceneResult,
  second: GeneratedSceneResult,
): number {
  const firstIds = new Set(first.trackSignals.map((signal) => signal.track.id));
  const secondIds = second.trackSignals.map((signal) => signal.track.id);
  return ratio(secondIds.filter((id) => !firstIds.has(id)).length, secondIds.length);
}
