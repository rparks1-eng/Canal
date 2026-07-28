import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

const migration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260728211454_complete_profile_social_and_stage_provenance.sql",
    ),
    "utf8",
  );

const profileClient =
  readFileSync(
    join(
      process.cwd(),
      "lib",
      "canal-profile.ts",
    ),
    "utf8",
  );

function grantedColumns(
  operation:
    | "select"
    | "insert"
    | "update",
): string[] {
  const columns =
    migration.match(
      new RegExp(
        `grant ${operation} \\(([\\s\\S]*?)\\)\\s+on public[.]profiles\\s+to authenticated;`,
        "i",
      ),
    )?.[1] ??
    "";

  return columns
    .split(
      ",",
    )
    .map(
      (column) =>
        column
          .trim()
          .toLowerCase(),
    )
    .filter(
      Boolean,
    );
}

describe(
  "complete profile infrastructure migration",
  () => {
    it(
      "keeps trusted profile and Stage provenance out of client grants",
      () => {
        const trustedColumns = [
          "is_verified",
          "is_canal",
          "verified_at",
          "verification_source",
        ];

        expect(
          grantedColumns(
            "insert",
          ),
        ).not.toEqual(
          expect.arrayContaining(
            trustedColumns,
          ),
        );

        expect(
          grantedColumns(
            "update",
          ),
        ).not.toEqual(
          expect.arrayContaining(
            trustedColumns,
          ),
        );

        expect(
          migration,
        ).toMatch(
          /revoke insert, update, delete\s+on public[.]profiles\s+from authenticated/i,
        );

        expect(
          migration,
        ).toMatch(
          /is_canal_generated boolean not null default false/i,
        );
      },
    );

    it(
      "exposes only the safe public profile projection",
      () => {
        expect(
          migration,
        ).toMatch(
          /revoke select\s+on public[.]profiles\s+from authenticated/i,
        );

        expect(
          grantedColumns(
            "select",
          ),
        ).toEqual([
          "id",
          "display_name",
          "handle",
          "avatar_url",
          "bio",
          "favorite_activities",
          "is_public",
          "is_verified",
          "is_canal",
          "created_at",
          "updated_at",
        ]);

        expect(
          grantedColumns(
            "select",
          ),
        ).not.toEqual(
          expect.arrayContaining([
            "verified_at",
            "verification_source",
          ]),
        );
      },
    );

    it(
      "normalizes legacy and signup display names before enforcing the bound",
      () => {
        const cleanupIndex =
          migration.indexOf(
            "update public.profiles\nset display_name = left(",
          );

        const constraintIndex =
          migration.indexOf(
            "add constraint profiles_display_name_length",
          );

        expect(
          cleanupIndex,
        ).toBeGreaterThan(
          -1,
        );
        expect(
          constraintIndex,
        ).toBeGreaterThan(
          cleanupIndex,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]handle_new_canal_user[(][)][\s\S]*safe_display_name := left[(][\s\S]*raw_user_meta_data ->> 'display_name'[\s\S]*raw_user_meta_data ->> 'full_name'[\s\S]*split_part[\s\S]*'Canal Listener'[\s\S]*60[\s\S]*insert into public[.]profiles[\s\S]*safe_display_name/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all\s+on function public[.]handle_new_canal_user[(][)]\s+from public, anon, authenticated, service_role;/i,
        );

        expect(
          profileClient,
        ).toMatch(
          /function normalizeDisplayName[\s\S]*Array[.]from[\s\S]*[.]slice[(]\s*0,\s*60,\s*[)][\s\S]*function insertProfile[\s\S]*normalizeDisplayName/i,
        );
      },
    );

    it(
      "uses stable follow IDs and transactional saved Scene RPCs",
      () => {
        expect(
          migration,
        ).toMatch(
          /user_relationships_follow_target_required[\s\S]*relationship_type <> 'following'[\s\S]*target_user_id is not null/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]save_public_scene_to_library[\s\S]*insert into public[.]saved_scenes[\s\S]*insert into public[.]scenes/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]remove_saved_scene_from_library[\s\S]*delete from public[.]saved_scenes[\s\S]*delete from public[.]scenes/i,
        );

        expect(
          migration,
        ).toMatch(
          /trusted_saved_copy_payload[\s\S]*jsonb_build_object[\s\S]*'ownerId'[\s\S]*current_user_id::text[\s\S]*'sourceOwnerId'[\s\S]*source_owner_id_value::text[\s\S]*'sourceSceneId'[\s\S]*source_scene_id_value/i,
        );

        expect(
          migration,
        ).toMatch(
          /existing_copy_payload ->> 'sourceOwnerId'[\s\S]*is distinct from source_owner_id_value::text[\s\S]*existing_copy_payload ->> 'sourceSceneId'[\s\S]*is distinct from source_scene_id_value/i,
        );

        expect(
          migration,
        ).toMatch(
          /delete from public[.]scenes[\s\S]*payload ->> 'sourceOwnerId'[\s\S]*source_owner_id_value::text[\s\S]*payload ->> 'sourceSceneId'[\s\S]*source_scene_id_value/i,
        );
      },
    );

    it(
      "restamps Live provenance whenever trusted generation inputs change",
      () => {
        expect(
          migration,
        ).toMatch(
          /drop trigger if exists live_stages_stamp_host_profile[\s\S]*create trigger live_stages_stamp_host_profile\s+before insert or update of\s+host_id,\s+is_canal_generated,\s+canal_generated_at/i,
        );

        expect(
          migration,
        ).toMatch(
          /if new[.]is_canal_generated then[\s\S]*new[.]canal_generated_at[\s\S]*timezone[(]'utc', now[(][)][)][\s\S]*else\s+new[.]canal_generated_at :=\s+null/i,
        );

        expect(
          migration,
        ).toMatch(
          /when new[.]is_canal_generated then 'canal'[\s\S]*new[.]stage_kind/i,
        );
      },
    );

    it(
      "hides artifacts and Live Stages for private or blocked profiles",
      () => {
        expect(
          migration,
        ).toMatch(
          /owner_profile[.]is_public = true/i,
        );

        expect(
          migration,
        ).toMatch(
          /deleted_at is null[\s\S]*payload ->> 'visibility'/i,
        );

        expect(
          migration,
        ).toMatch(
          /function private[.]canal_users_are_blocked/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all\s+on function private[.]canal_users_are_blocked[(]uuid, uuid[)]\s+from public, anon, authenticated, service_role;\s+grant execute\s+on function private[.]canal_users_are_blocked[(]uuid, uuid[)]\s+to authenticated;/i,
        );

        expect(
          migration,
        ).toMatch(
          /Authenticated users can read public profiles[\s\S]*not private[.]canal_users_are_blocked[(]\s*[(]select auth[.]uid[(][)]\s*[)][,]\s*id[\s\S]*not private[.]canal_users_are_blocked[(]\s*id[,]\s*[(]select auth[.]uid[(][)]\s*[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /scenes[.]user_id[\s\S]*not private[.]canal_users_are_blocked[(]\s*scenes[.]user_id[,]\s*[(]select auth[.]uid[(][)]\s*[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /snapshots[.]user_id[\s\S]*not private[.]canal_users_are_blocked[(]\s*snapshots[.]user_id[,]\s*[(]select auth[.]uid[(][)]\s*[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /function private[.]can_access_live_stage[\s\S]*not private[.]canal_users_are_blocked/i,
        );

        expect(
          migration,
        ).toMatch(
          /drop function if exists public[.]join_live_stage_by_code[(]text[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]join_live_stage_by_code[(]\s*stage_code_value text,\s*expected_stage_id uuid default null\s*[)][\s\S]*expected_stage_id <>[\s\S]*matched_stage_id[\s\S]*private[.]canal_users_are_blocked/i,
        );

        expect(
          migration,
        ).toMatch(
          /grant execute\s+on function public[.]join_live_stage_by_code[(]text, uuid[)]\s+to authenticated/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant execute\s+on function public[.]join_live_stage_by_code[(]text[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /Listeners can join public live Stages[\s\S]*private[.]can_access_live_stage/i,
        );

        expect(
          migration,
        ).toMatch(
          /Members can send live Stage messages[\s\S]*private[.]can_access_live_stage/i,
        );
      },
    );

    it(
      "records playlist history behind owner-only RLS",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]scene_playlist_exports/i,
        );

        expect(
          migration,
        ).toMatch(
          /Users can read their playlist exports[\s\S]*auth[.]uid\(\)[\s\S]*user_id/i,
        );
      },
    );
  },
);
