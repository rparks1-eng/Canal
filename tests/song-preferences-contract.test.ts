import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260810214828_user_song_preferences.sql"), "utf8");
const dislikeMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260810215607_temporary_song_dislikes.sql"), "utf8");
const dnaMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260810220817_persist_user_song_dna.sql"), "utf8");
const evidenceMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260810221149_aggregate_song_scene_mood_evidence.sql"), "utf8");
const context = fs.readFileSync(path.join(root, "app/song-context.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "app/(tabs)/index.tsx"), "utf8");
const preview = fs.readFileSync(path.join(root, "app/scene-preview.tsx"), "utf8");
const learning = fs.readFileSync(path.join(root, "lib/scene-recommendation-feedback.ts"), "utf8");

describe("account-scoped Song DNA preferences", () => {
  it("uses owner-only RLS and bounded metadata without raw provider payloads", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("cardinality(genre_labels) <= 4");
    expect(migration).toContain("cardinality(mood_labels) <= 4");
    expect(migration).toContain("revoke all on table public.user_song_preferences from public, anon");
    expect(migration).not.toMatch(/lyrics|provider_response|raw_payload/u);
  });

  it("renders Song DNA and persists a scoped explicit Like", () => {
    expect(context).toContain("CANAL SONG DNA");
    expect(context).toContain("Canal Song DNA beta");
    expect(context).toContain('name="flask-outline"');
    expect(context).not.toContain("Context matched by Genius");
    expect(context).toContain("classifyCanalSongDna");
    expect(context).toContain("setSongLiked(songAction, songDna");
    expect(context).toContain('accessibilityState={{ busy: likeBusy, selected: liked }}');
  });

  it("merges only relevant liked tracks into recommendation learning", () => {
    expect(learning).toContain("readRelevantLikedTrackIds(scope, currentScope, draft)");
    expect(learning).toContain("for (const trackId of likedTrackIds) preferred.add(trackId)");
  });

  it("keeps dislikes temporary and uses them as deprioritization rather than permanent rejection", () => {
    expect(dislikeMigration).toContain("disliked_until timestamptz");
    expect(dislikeMigration).toContain("user_song_preferences_active_dislike_index");
    expect(learning).toContain("readTemporarilyDislikedTrackIds");
    expect(learning).toContain("deprioritized.add(trackId)");
    expect(learning).not.toContain("rejected.add(trackId);\n  for (const trackId of temporarilyDislikedTrackIds");
  });

  it("offers Like, Dislike, refresh, immediate replacement, and intent-specific generated-Scene feedback", () => {
    expect(context).toContain("toggleDislike");
    expect(context).not.toContain("thumbs-down");
    expect(context).toContain("remove-circle-outline");
    expect(context).toContain('accessibilityLabel={disliked ? "Remove song dislike" : "Dislike song"}');
    expect(home).toContain('accessibilityLabel={`Like ${track.name}`}');
    expect(home).toContain('accessibilityLabel={`Dislike ${track.name}`}');
    expect(home).toContain('accessibilityLabel="Refresh New to your orbit"');
    expect(home).toContain("setTemporarilyDisliked((current)");
    expect(preview).toContain('accessibilityLabel={`Dislike ${signal.track.name}`}');
    expect(preview).toContain('action: mismatch ? "doesnt_match" : "remove"');
  });

  it("persists versioned Song DNA independently of preference state", () => {
    expect(dnaMigration).toContain("create table if not exists public.user_song_dna");
    expect(dnaMigration).toContain("primary key (user_id, track_id)");
    expect(dnaMigration).toContain("enable row level security");
    expect(dnaMigration).toContain("(select auth.uid()) = user_id");
    expect(dnaMigration).toContain("cardinality(genre_labels) <= 4");
    expect(dnaMigration).toContain("cardinality(mood_labels) <= 4");
    expect(context).toContain("persistSongDna(songAction, songDna, scope");
    expect(context).toContain("persistedDnaKeyRef");
  });

  it("aggregates bounded Scene mood consensus without exposing contributor identities", () => {
    expect(evidenceMigration).toContain("create table if not exists private.song_scene_mood_evidence");
    expect(evidenceMigration).toContain("community_users >= 3");
    expect(evidenceMigration).toContain("least(owner_evidence.uses, 3)");
    expect(evidenceMigration).toContain("grant execute on function public.get_song_scene_mood_evidence(text) to authenticated");
    const publicReturnShape = evidenceMigration.slice(
      evidenceMigration.indexOf("returns table (", evidenceMigration.indexOf("public.get_song_scene_mood_evidence")),
      evidenceMigration.indexOf(")\nlanguage plpgsql", evidenceMigration.indexOf("public.get_song_scene_mood_evidence")),
    );
    expect(publicReturnShape).not.toContain("user_id");
    expect(context).toContain("readSongSceneMoodEvidence");
    expect(context).toContain("sceneMoodEvidence");
  });
});
