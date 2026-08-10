/**
 * Optional reasons attached to a Scene recommendation rejection.
 *
 * These values describe Canal product feedback. Any future consumption of
 * `wrong_artist` or `wrong_genre` in personalized ranking remains disabled
 * until the relevant catalog/provider policy has been reviewed and approved.
 */
export const SCENE_FEEDBACK_REASONS = [
  "too_slow",
  "too_fast",
  "wrong_genre",
  "wrong_mood",
  "heard_too_much",
  "too_unfamiliar",
  "wrong_artist",
  "too_explicit",
] as const;

export const SCENE_RECOMMENDATION_REASONS =
  SCENE_FEEDBACK_REASONS;

export type SceneFeedbackReason =
  (typeof SCENE_FEEDBACK_REASONS)[number];

export type SceneRecommendationReason =
  SceneFeedbackReason;

export const MAX_SCENE_FEEDBACK_REASONS = 4;
export const MAX_SCENE_FEEDBACK_ARTIST_IDS = 20;
export const MAX_SCENE_FEEDBACK_GENRES = 12;

export const SCENE_FEEDBACK_REASON_LABELS: Readonly<
  Record<SceneFeedbackReason, string>
> = {
  too_slow: "Too slow",
  too_fast: "Too fast",
  wrong_genre: "Wrong genre",
  wrong_mood: "Wrong mood",
  heard_too_much: "Heard it too much",
  too_unfamiliar: "Too unfamiliar",
  wrong_artist: "Not this artist",
  too_explicit: "Too explicit",
};

const REJECTION_ACTIONS = new Set([
  "swap",
  "remove",
  "doesnt_match",
]);

export function normalizeSceneRecommendationReason(
  value: unknown,
): SceneRecommendationReason | undefined {
  return SCENE_FEEDBACK_REASONS.find(
    (reason) => reason === value,
  );
}

export function normalizeSceneFeedbackReasons(
  values: readonly unknown[] | null | undefined,
): SceneFeedbackReason[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const reasons = new Set<SceneFeedbackReason>();

  for (const value of values) {
    const reason =
      normalizeSceneRecommendationReason(value);

    if (reason) {
      reasons.add(reason);
    }

    if (
      reasons.size >=
      MAX_SCENE_FEEDBACK_REASONS
    ) {
      break;
    }
  }

  if (
    reasons.has("too_slow") &&
    reasons.has("too_fast")
  ) {
    reasons.delete("too_slow");
    reasons.delete("too_fast");
  }

  if (
    reasons.has("heard_too_much") &&
    reasons.has("too_unfamiliar")
  ) {
    reasons.delete("heard_too_much");
    reasons.delete("too_unfamiliar");
  }

  return Array.from(reasons).sort();
}

export function normalizeSceneFeedbackReasonsForAction(
  action: unknown,
  values: readonly unknown[] | null | undefined,
): SceneFeedbackReason[] {
  if (!REJECTION_ACTIONS.has(String(action))) {
    return [];
  }

  return normalizeSceneFeedbackReasons(values);
}

export type SceneReasonBias = Readonly<{
  energyBias: number;
  familiarityBias: number;
  avoidArtistIds: readonly string[];
  avoidGenres: readonly string[];
  suppressExplicit: boolean;
}>;

export type SceneReasonBiasEvent = Readonly<{
  action?: unknown;
  reasons?: readonly unknown[];
  trackArtistIds?: readonly string[];
  trackGenres?: readonly string[];
  trackExplicit?: boolean;
}>;

export const EMPTY_SCENE_REASON_BIAS: SceneReasonBias =
  Object.freeze({
    energyBias: 0,
    familiarityBias: 0,
    avoidArtistIds: [],
    avoidGenres: [],
    suppressExplicit: false,
  });

const AVOID_THRESHOLD = 2;
const BIAS_STEP = 9;
const BIAS_LIMIT = 25;

function clampBias(
  value: number,
): number {
  return Math.max(
    -BIAS_LIMIT,
    Math.min(BIAS_LIMIT, value),
  );
}

function normalizedSet(
  values: readonly string[] | undefined,
  lowerCase: boolean,
  maximumItems: number,
  maximumLength: number,
): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(
          (value) =>
            value.length > 0 &&
            value.length <= maximumLength,
        )
        .map((value) =>
          lowerCase
            ? value.toLowerCase()
            : value,
        ),
    ),
  )
    .sort()
    .slice(0, maximumItems);
}

/**
 * Produces bounded signals from feedback within one intent.
 *
 * `avoidArtistIds` and `avoidGenres` are intentionally descriptive output.
 * Applying either to provider-derived ranking is policy-gated and must not be
 * enabled merely because this aggregation exists.
 */
export function buildSceneReasonBias(
  events: readonly SceneReasonBiasEvent[],
): SceneReasonBias {
  let energyBias = 0;
  let familiarityBias = 0;
  let explicitRejections = 0;
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const observedReasons = new Set<SceneFeedbackReason>();

  for (const event of events) {
    const reasons =
      normalizeSceneFeedbackReasonsForAction(
        event.action,
        event.reasons,
      );

    reasons.forEach((reason) => {
      observedReasons.add(reason);
    });

    for (const reason of reasons) {
      switch (reason) {
        case "too_slow":
          energyBias += BIAS_STEP;
          break;
        case "too_fast":
          energyBias -= BIAS_STEP;
          break;
        case "heard_too_much":
          familiarityBias += BIAS_STEP;
          break;
        case "too_unfamiliar":
          familiarityBias -= BIAS_STEP;
          break;
        case "wrong_artist":
          normalizedSet(
            event.trackArtistIds,
            false,
            MAX_SCENE_FEEDBACK_ARTIST_IDS,
            128,
          ).forEach(
            (artistId) => {
              artistCounts.set(
                artistId,
                (artistCounts.get(artistId) ?? 0) + 1,
              );
            },
          );
          break;
        case "wrong_genre":
          normalizedSet(
            event.trackGenres,
            true,
            MAX_SCENE_FEEDBACK_GENRES,
            80,
          ).forEach(
            (genre) => {
              genreCounts.set(
                genre,
                (genreCounts.get(genre) ?? 0) + 1,
              );
            },
          );
          break;
        case "too_explicit":
          if (event.trackExplicit === true) {
            explicitRejections += 1;
          }
          break;
        case "wrong_mood":
          break;
      }
    }
  }

  if (
    observedReasons.has("too_slow") &&
    observedReasons.has("too_fast")
  ) {
    energyBias = 0;
  }

  if (
    observedReasons.has("heard_too_much") &&
    observedReasons.has("too_unfamiliar")
  ) {
    familiarityBias = 0;
  }

  return {
    energyBias: clampBias(energyBias),
    familiarityBias:
      clampBias(familiarityBias),
    avoidArtistIds: Array.from(
      artistCounts.entries(),
    )
      .filter(([, count]) =>
        count >= AVOID_THRESHOLD,
      )
      .map(([artistId]) => artistId)
      .sort(),
    avoidGenres: Array.from(
      genreCounts.entries(),
    )
      .filter(([, count]) =>
        count >= AVOID_THRESHOLD,
      )
      .map(([genre]) => genre)
      .sort(),
    suppressExplicit:
      explicitRejections >= AVOID_THRESHOLD,
  };
}
