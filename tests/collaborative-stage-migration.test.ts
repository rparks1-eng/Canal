import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260808181734_collaborative_stage_contributions.sql",
  ),
  "utf8",
);

const contributorIndexMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260808182346_collaborative_stage_contributor_index.sql",
  ),
  "utf8",
);

const automaticMixMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260809050307_automatically_refresh_live_stage_mix.sql",
  ),
  "utf8",
);

describe("collaborative Stage migration", () => {
  it("stores bounded, consented, member-owned contributions", () => {
    expect(migration).toContain("create table if not exists public.live_stage_contributions");
    expect(migration).toContain("primary key (stage_id, user_id)");
    expect(migration).toContain("private.live_stage_tracks_are_safe(tracks)");
    expect(migration).toContain("consent_version = 'stage-contribution-v1'");
    expect(migration).toContain("alter table public.live_stage_contributions enable row level security");
    expect(migration).toMatch(/user_id = \(select auth[.]uid\(\)\)[\s\S]*stage[.]host_id = \(select auth[.]uid\(\)\)/u);
  });

  it("accepts only canonical Spotify artwork hosts used by current library responses", () => {
    const artworkMigration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260809001548_expand_live_stage_artwork_hosts.sql",
      ),
      "utf8",
    );

    expect(artworkMigration).toContain(
      "image-cdn-(ak|fa)[.]spotifycdn[.]com",
    );
    expect(artworkMigration).toContain(
      "i[.]scdn[.]co",
    );
    expect(artworkMigration).not.toContain(
      "spotifycdn[.]com.*",
    );
    expect(artworkMigration).toContain(
      "grant execute\non function private.live_stage_tracks_are_safe(jsonb)\nto authenticated, service_role",
    );
  });

  it("accepts contributions only from the authenticated Stage member", () => {
    expect(migration).toContain("create or replace function public.submit_live_stage_contribution");
    expect(migration).toContain("current_user_id is distinct from expected_user_id_value");
    expect(migration).toMatch(/join public[.]live_stage_members[\s\S]*member[.]user_id = current_user_id[\s\S]*stage[.]status = 'live'/u);
    expect(migration).toContain("private.live_stage_preferences_are_safe");
    expect(migration).toContain("private.live_stage_tracks_are_safe(tracks_value)");
  });

  it("reveals only contribution status to members and reserves mixing for the host", () => {
    expect(migration).toContain("create or replace function public.list_live_stage_contribution_statuses");
    const statusSignature = migration.match(
      /create or replace function public[.]list_live_stage_contribution_statuses[\s\S]*?language plpgsql/u,
    )?.[0] ?? "";
    expect(statusSignature).not.toContain("tracks jsonb");
    expect(migration).toContain("create or replace function public.build_collaborative_stage_mix");
    expect(migration).toContain("stage.host_id = current_user_id");
    expect(migration).toContain("count(distinct user_id)");
    expect(migration).toContain("partition by owned.user_id");
    expect(migration).toContain("limit 100");
  });

  it("broadcasts contribution changes through the existing private Stage channel", () => {
    expect(migration).toContain("'live_stage_contributions'");
    expect(migration).toContain("create trigger live_stage_contributions_broadcast_change");
    expect(migration).toContain("'live-stage:' || target_stage_id::text");
  });

  it("rebuilds the live mix atomically whenever a ready contribution changes", () => {
    expect(automaticMixMigration).toContain(
      "create or replace function private.refresh_live_stage_mix(stage_id_value uuid)",
    );
    expect(automaticMixMigration).toContain(
      "after insert or update of tracks, ready",
    );
    expect(automaticMixMigration).toContain(
      "perform private.refresh_live_stage_mix(new.stage_id)",
    );
    expect(automaticMixMigration).toContain(
      "current_track_id := stage_row.tracks -> stage_row.current_track_index ->> 'id'",
    );
    expect(automaticMixMigration).toContain(
      "current_track_index = next_track_index",
    );
    expect(automaticMixMigration).toContain(
      "return private.refresh_live_stage_mix(stage_id_value)",
    );
  });

  it("does not grant clients direct contribution writes", () => {
    expect(migration).toContain("revoke all on public.live_stage_contributions");
    expect(migration).toContain("grant select on public.live_stage_contributions");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on public[.]live_stage_contributions\s+to authenticated/iu);
  });

  it("indexes both Stage and contributor ownership lookups", () => {
    expect(migration).toContain("live_stage_contributions_stage_ready_index");
    expect(contributorIndexMigration).toContain("live_stage_contributions_user_updated_index");
    expect(contributorIndexMigration).toContain("(user_id, updated_at desc)");
  });
});
