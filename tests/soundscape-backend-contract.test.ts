import { readFileSync } from "node:fs";
import { join } from "node:path";

const cloud = readFileSync(join(process.cwd(), "lib/soundscape-cloud.ts"), "utf8");
const collector = readFileSync(join(process.cwd(), "lib/soundscape-collector.ts"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811152630_soundscape_archives_and_common_ground.sql"),
  "utf8",
);
const aclMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811162538_soundscape_table_acl_hardening.sql"),
  "utf8",
);
const rpcFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811162717_soundscape_rpc_parameter_disambiguation.sql"),
  "utf8",
);

describe("Soundscape backend contract", () => {
  it("uses one atomic database version allocator instead of a client max-version race", () => {
    expect(cloud).toContain('rpc("soundscape_insert_archive"');
    expect(cloud).not.toMatch(/select\("version"\)[\s\S]*max/u);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(/coalesce\(max\(archive[.]version\), 0\) \+ 1/u);
  });

  it("keeps full archives owner-only and exports only explicit projections", () => {
    expect(migration).toMatch(/Owners read Soundscape archives[\s\S]*auth[.]uid\(\)\) = user_id/u);
    expect(migration).not.toMatch(/soundscape_archives[\s\S]{0,200}for select to anon/u);
    expect(migration).toContain("soundscape_share_projection");
    expect(cloud).toContain("loadSoundscapeShareProjection");
    expect(migration).toMatch(/archive[.]visibility = 'public'/u);
    expect(migration).toMatch(/archive[.]visibility = 'connections'[\s\S]*soundscape_users_are_mutual_connections/u);
    expect(migration).toMatch(/enforce_soundscape_archive_immutability[\s\S]*new[.]content is distinct from old[.]content/u);
    expect(aclMigration).toContain(
      "revoke all on table public.soundscape_archives from public, anon",
    );
    expect(aclMigration).toContain(
      "revoke all on table public.soundscape_refresh_state from public, anon",
    );
    expect(aclMigration).toContain(
      "revoke all on table public.soundscape_common_ground_consents from public, anon",
    );
    expect(aclMigration).toMatch(
      /grant select, insert, update, delete[\s\S]*soundscape_archives[\s\S]*to authenticated/u,
    );
    expect(aclMigration).toMatch(
      /grant select[\s\S]*soundscape_common_ground_consents[\s\S]*to authenticated/u,
    );
  });

  it("requires mutual connection and two independent Common Ground approvals", () => {
    expect(migration).toMatch(/soundscape_users_are_mutual_connections[\s\S]*first_follow[\s\S]*second_follow/u);
    expect(migration).toMatch(/soundscape_common_ground_projection[\s\S]*not exists[\s\S]*not exists/u);
    expect(migration).toMatch(/viewer_projection is null or peer_projection is null[\s\S]*'insufficient_history'/u);
    expect(cloud).toContain('status: "ineligible"');
    expect(cloud).toContain('rpc("soundscape_set_common_ground_approval"');
    expect(migration).not.toMatch(/grant execute on function private[.]soundscape_users_are_mutual_connections/u);
    expect(rpcFixMigration).toContain(
      "soundscape_set_common_ground_approval.peer_user_id",
    );
    expect(rpcFixMigration).toContain(
      "on conflict on constraint soundscape_common_ground_consents_pkey",
    );
    expect(rpcFixMigration).toContain(
      "soundscape_common_ground_projection.peer_user_id",
    );
    expect(rpcFixMigration).toMatch(
      /revoke all on function public[.]soundscape_common_ground_projection[\s\S]*from public, anon, authenticated, service_role/u,
    );
  });

  it("fences cache and cloud work to the expected account", () => {
    expect(cloud.match(/assertCurrentAccount\(/gu)?.length).toBeGreaterThanOrEqual(12);
    expect(cloud).toMatch(/catch \(error\) \{[\s\S]*AsyncStorage[.]removeItem\(key\)/u);
    expect(cloud).toMatch(/if \(!data\) throw new Error\("The owned Soundscape archive no longer exists[.]"\)/u);
    expect(cloud).toMatch(/row[.]schema_version !== 1[\s\S]*!isRecord\(row[.]content\)[\s\S]*!isRecord\(row[.]share_projection\)/u);
  });

  it("collects from existing caches without a Spotify provider refresh", () => {
    expect(collector).toContain("readSpotifyLibrarySnapshot");
    expect(collector).not.toContain("syncSpotifyLibrary");
    expect(collector).not.toContain("getLatestSpotifyLibrarySnapshot");
    expect(collector).toMatch(/await assertCurrentAccount\(accountId\)[\s\S]*Promise[.]all[\s\S]*await assertCurrentAccount\(accountId\)/u);
    expect(collector).toContain('compositionState: "none"');
    expect(collector).toContain("discoveries: []");
    expect(collector).toContain("readAccountOwnedSoundscapeHistory");
    expect(collector).toContain("sessionHistory.listening");
    expect(collector).toContain("sessionHistory.feedback");
    expect(collector).not.toContain("readListeningHistory");
    expect(collector).not.toContain("readFeedbackEntries");
    expect(collector).not.toMatch(/discoveryTracks[\s\S]*discoveredAt/u);
    expect(collector).toMatch(/matchingScenes[\s\S]*sceneMoods[\s\S]*sceneGenres/u);
  });
});
