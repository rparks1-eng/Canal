import fs from "node:fs";
import path from "node:path";

import {
  buildSceneReasonBias,
  MAX_SCENE_FEEDBACK_REASONS,
  normalizeSceneFeedbackReasons,
  normalizeSceneFeedbackReasonsForAction,
  normalizeSceneRecommendationReason,
  SCENE_FEEDBACK_REASONS,
} from "../lib/scene-recommendation-reasons";

const MIGRATION = fs.readFileSync(
  path.resolve(
    __dirname,
    "../supabase/migrations/20260810132417_scene_recommendation_feedback_reasons.sql",
  ),
  "utf8",
);

describe("Scene recommendation reasons", () => {
  it("keeps the TypeScript and SQL enums in exact parity", () => {
    const enumBlock = MIGRATION.match(
      /reasons <@ array\[(?<values>[\s\S]*?)\]::text\[\]/u,
    )?.groups?.values ?? "";
    const sqlReasons = Array.from(
      enumBlock.matchAll(/'([^']+)'/gu),
      (match) => match[1],
    );

    expect(sqlReasons).toEqual(
      SCENE_FEEDBACK_REASONS,
    );
    expect(MAX_SCENE_FEEDBACK_REASONS).toBe(4);
    expect(MIGRATION).toContain(
      "cardinality(reasons) <= 4",
    );
    expect(MIGRATION).toContain(
      "coalesce(array_ndims(reasons), 1) = 1",
    );
  });

  it("normalizes a single reason without coercing unknown values", () => {
    expect(
      normalizeSceneRecommendationReason("wrong_genre"),
    ).toBe("wrong_genre");
    expect(
      normalizeSceneRecommendationReason({
        toString: () => "wrong_genre",
      }),
    ).toBeUndefined();
  });

  it("deduplicates, bounds, and orders valid reasons", () => {
    expect(
      normalizeSceneFeedbackReasons([
        "wrong_mood",
        "wrong_artist",
        "wrong_mood",
        "too_explicit",
        "wrong_genre",
        "too_fast",
      ]),
    ).toEqual([
      "too_explicit",
      "wrong_artist",
      "wrong_genre",
      "wrong_mood",
    ]);
  });

  it("allows reasons only for rejection actions", () => {
    for (const action of [
      "swap",
      "remove",
      "doesnt_match",
    ]) {
      expect(
        normalizeSceneFeedbackReasonsForAction(
          action,
          ["wrong_mood"],
        ),
      ).toEqual(["wrong_mood"]);
    }

    for (const action of [
      "favorite",
      "unfavorite",
      "skip",
      "replay",
      undefined,
    ]) {
      expect(
        normalizeSceneFeedbackReasonsForAction(
          action,
          ["wrong_mood"],
        ),
      ).toEqual([]);
    }

    expect(MIGRATION).toMatch(
      /cardinality\(reasons\) = 0[\s\S]*or action in \([\s\S]*'swap'[\s\S]*'remove'[\s\S]*'doesnt_match'/u,
    );
  });

  it("cancels contradictory dimensions within and across events", () => {
    expect(
      normalizeSceneFeedbackReasons([
        "too_slow",
        "too_fast",
        "heard_too_much",
        "too_unfamiliar",
      ]),
    ).toEqual([]);

    expect(
      buildSceneReasonBias([
        {
          action: "remove",
          reasons: ["too_slow", "heard_too_much"],
        },
        {
          action: "swap",
          reasons: ["too_fast", "too_unfamiliar"],
        },
      ]),
    ).toMatchObject({
      energyBias: 0,
      familiarityBias: 0,
    });

    expect(MIGRATION).toContain(
      "reasons @> array['too_slow', 'too_fast']::text[]",
    );
  });

  it("counts explicit rejection only for an explicit track", () => {
    expect(
      buildSceneReasonBias([
        {
          action: "remove",
          reasons: ["too_explicit"],
          trackExplicit: true,
        },
        {
          action: "swap",
          reasons: ["too_explicit"],
          trackExplicit: undefined,
        },
      ]).suppressExplicit,
    ).toBe(false);

    expect(
      buildSceneReasonBias([
        {
          action: "remove",
          reasons: ["too_explicit"],
          trackExplicit: true,
        },
        {
          action: "swap",
          reasons: ["too_explicit"],
          trackExplicit: true,
        },
      ]).suppressExplicit,
    ).toBe(true);
  });

  it("builds deterministic normalized artist and genre sets", () => {
    const bias = buildSceneReasonBias([
      {
        action: "remove",
        reasons: ["wrong_artist", "wrong_genre"],
        trackArtistIds: [" artist-b ", "artist-a", "artist-a"],
        trackGenres: [" Rock ", "R&B", "rock"],
      },
      {
        action: "swap",
        reasons: ["wrong_artist", "wrong_genre"],
        trackArtistIds: ["artist-a", "artist-b"],
        trackGenres: ["r&b", "ROCK"],
      },
    ]);

    expect(bias.avoidArtistIds).toEqual([
      "artist-a",
      "artist-b",
    ]);
    expect(bias.avoidGenres).toEqual([
      "r&b",
      "rock",
    ]);
  });

  it("persists bounded one-dimensional rejection context only", () => {
    expect(MIGRATION).toContain(
      "add column if not exists track_artist_ids text[] not null default '{}'",
    );
    expect(MIGRATION).toContain(
      "add column if not exists track_genres text[] not null default '{}'",
    );
    expect(MIGRATION).toContain(
      "add column if not exists track_explicit boolean",
    );
    expect(MIGRATION).toMatch(
      /scene_feedback_context_is_bounded\([\s\S]*array_ndims\(values_to_check\)[\s\S]*cardinality\(values_to_check\) <= maximum_items[\s\S]*value_to_check is not null[\s\S]*length\(btrim\(value_to_check\)\) between 1 and maximum_length/u,
    );
    expect(MIGRATION).toContain(
      "public.scene_feedback_context_is_bounded(\n    track_artist_ids,\n    20,\n    128\n  )",
    );
    expect(MIGRATION).toContain(
      "public.scene_feedback_context_is_bounded(\n    track_genres,\n    12,\n    80\n  )",
    );
    expect(MIGRATION).toMatch(
      /cardinality\(track_artist_ids\) = 0[\s\S]*cardinality\(track_genres\) = 0[\s\S]*track_explicit is null[\s\S]*or action in/u,
    );
    expect(MIGRATION).toContain(
      "Exact explicit-content provenance captured only for rejection feedback. NULL means unknown; only TRUE contributes to explicit suppression.",
    );
    expect(MIGRATION).toMatch(
      /revoke all on function public[.]scene_feedback_context_is_bounded\(text\[\], integer, integer\)\s+from public, anon, authenticated;[\s\S]*grant execute on function public[.]scene_feedback_context_is_bounded\(text\[\], integer, integer\)\s+to authenticated, service_role;/u,
    );
  });

  it("hardens table privileges to authenticated CRUD only", () => {
    expect(MIGRATION).toContain(
      "revoke all on public.scene_recommendation_feedback from anon;",
    );
    expect(MIGRATION).toContain(
      "revoke all on public.scene_recommendation_feedback from authenticated;",
    );
    expect(MIGRATION).toMatch(
      /grant select, insert, update, delete\s+on public[.]scene_recommendation_feedback\s+to authenticated;/u,
    );
    expect(MIGRATION).not.toMatch(
      /grant all|grant truncate|grant trigger|grant references/iu,
    );
  });

  it("keeps provider-derived artist and genre consumption policy-gated", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../lib/scene-recommendation-reasons.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /wrong_artist[\s\S]*wrong_genre[\s\S]*provider policy[\s\S]*reviewed and approved/iu,
    );
    expect(MIGRATION).toContain(
      "wrong_artist and wrong_genre ranking consumption remains provider-policy-gated",
    );
  });
});
