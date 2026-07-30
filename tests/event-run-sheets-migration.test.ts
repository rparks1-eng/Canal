import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

const migrationPath =
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729200635_private_frozen_event_run_sheets.sql",
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8",
  );

describe(
  "private frozen Event Run Sheets forward migration",
  () => {
    it(
      "refuses to invent historical revisions or admit malformed legacy schedules",
      () => {
        expect(
          migration,
        ).toMatch(
          /if exists [(][\s\S]*creator_event_run_sheets[\s\S]*status <> 'planned'[\s\S]*active_position <> 0[\s\S]*EVENT_RUN_SHEET_LEGACY_PREFLIGHT_REQUIRED/i,
        );

        expect(
          migration,
        ).toContain(
          "operator-reviewed archival decision",
        );

        expect(
          migration,
        ).toMatch(
          /active_position <> 0[\s\S]*not isfinite[(]run_sheet[.]starts_at[)][\s\S]*pg_catalog[.]pg_timezone_names[\s\S]*zone[.]name = trim[(]run_sheet[.]time_zone[)]/i,
        );
      },
    );

    it(
      "replaces mutable collection coupling with a three-state versioned lifecycle",
      () => {
        expect(
          migration,
        ).toMatch(
          /drop constraint if exists creator_event_run_sheets_collection_fkey/i,
        );
        expect(
          migration,
        ).toMatch(
          /add column if not exists version bigint not null default 1[\s\S]*started_at timestamptz[\s\S]*completed_at timestamptz[\s\S]*source_collection_title text/i,
        );
        expect(
          migration,
        ).toMatch(
          /foreign key [(]owner_id[)][\s\S]*references auth[.]users[(]id[)][\s\S]*on delete cascade/i,
        );
        expect(
          migration,
        ).toMatch(
          /status in [(][\s\S]*'planned'[\s\S]*'running'[\s\S]*'completed'/i,
        );
        expect(
          migration,
        ).toMatch(
          /status = 'planned'[\s\S]*active_position = 0[\s\S]*started_at is null[\s\S]*status = 'running'[\s\S]*started_at is not null[\s\S]*status = 'completed'[\s\S]*completed_at >= started_at/i,
        );
      },
    );

    it(
      "creates a bounded source-independent ordered Scene snapshot",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]creator_event_run_sheet_items[\s\S]*scene_id text not null[\s\S]*scene_revision bigint not null[\s\S]*position integer not null[\s\S]*scene_title text not null[\s\S]*activity_label text not null[\s\S]*duration_label text not null[\s\S]*track_count integer not null/i,
        );
        expect(
          migration,
        ).toMatch(
          /primary key [(][\s\S]*run_sheet_id[\s\S]*scene_id[\s\S]*position_unique[\s\S]*run_sheet_id[\s\S]*position/i,
        );
        expect(
          migration,
        ).toMatch(
          /position between 0 and 49[\s\S]*track_count between 0 and 500/i,
        );
        expect(
          migration,
        ).not.toMatch(
          /creator_event_run_sheet_items[\s\S]{0,1800}references public[.](?:scenes|creator_scene_collection_items)/i,
        );
      },
    );

    it(
      "permits at most one running sheet per owner and collection",
      () => {
        expect(
          migration,
        ).toMatch(
          /create unique index if not exists[\s\S]*one_running_collection_index[\s\S]*owner_id[\s\S]*collection_id[\s\S]*where status = 'running'/i,
        );
      },
    );

    it(
      "protects immutable ownership, started metadata, snapshots, and completion",
      () => {
        expect(
          migration,
        ).toMatch(
          /function private[.]protect_creator_event_run_sheet[(][)][\s\S]*owner_id is distinct from old[.]owner_id[\s\S]*version <> old[.]version [+] 1[\s\S]*old[.]status = 'planned' and new[.]status = 'running'[\s\S]*old[.]status = 'running' and new[.]status = 'completed'[\s\S]*old[.]status = 'completed'/i,
        );
        expect(
          migration,
        ).toMatch(
          /function private[.]protect_creator_event_run_sheet_item[(][)][\s\S]*tg_op = 'UPDATE'[\s\S]*Frozen Event Run Sheet items are immutable[\s\S]*target_status <> 'planned'/i,
        );
        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*protect_creator_event_run_sheet[(][)][\s\S]*from public, anon, authenticated, service_role/i,
        );
      },
    );

    it(
      "keeps both tables owner-only with select-only Data API grants",
      () => {
        for (
          const table of [
            "creator_event_run_sheets",
            "creator_event_run_sheet_items",
          ]
        ) {
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `alter table public[.]${table}[\\s\\S]*enable row level security`,
              "i",
            ),
          );
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `on public[.]${table}[\\s\\S]*for select[\\s\\S]*to authenticated[\\s\\S]*[(]select auth[.]uid[(][)][)] = owner_id`,
              "i",
            ),
          );
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `revoke all[\\s\\S]*on public[.]${table}[\\s\\S]*from public, anon, authenticated, service_role`,
              "i",
            ),
          );
          expect(
            migration,
          ).not.toMatch(
            new RegExp(
              `grant (?:insert|update|delete|all)[\\s\\S]*on public[.]${table}[\\s\\S]*to authenticated`,
              "i",
            ),
          );
        }
      },
    );

    it(
      "uses actor-bound, empty-search-path, authenticated-only RPCs",
      () => {
        for (
          const signature of [
            "save_creator_event_run_sheet",
            "start_creator_event_run_sheet",
            "advance_creator_event_run_sheet",
            "complete_creator_event_run_sheet",
            "delete_creator_event_run_sheet",
          ]
        ) {
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `function public[.]${signature}[(][\\s\\S]*expected_actor_id_value uuid[\\s\\S]*security definer[\\s\\S]*set search_path = ''[\\s\\S]*auth[.]uid[(][)][\\s\\S]*current_user_id <> expected_actor_id_value`,
              "i",
            ),
          );
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `revoke all[\\s\\S]*on function public[.]${signature}[(][\\s\\S]*from public, anon, authenticated, service_role[\\s\\S]*grant execute[\\s\\S]*on function public[.]${signature}[(][\\s\\S]*to authenticated`,
              "i",
            ),
          );
        }
      },
    );

    it(
      "saves only planned owner collections with exact version, IANA validation, and consistent locks",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]save_creator_event_run_sheet[(][\s\S]*pg_catalog[.]pg_timezone_names[\s\S]*creator_scene_collections[\s\S]*owner_id = current_user_id[\s\S]*for update[\s\S]*status <> 'planned'[\s\S]*version <> expected_version_value[\s\S]*version = target_run_sheet[.]version [+] 1/i,
        );

        expect(
          migration,
        ).toMatch(
          /select run_sheet[.][*][\s\S]*from public[.]creator_event_run_sheets[\s\S]*for update[\s\S]*status <> 'planned'[\s\S]*version <> expected_version_value[\s\S]*consistent order[\s\S]*from public[.]creator_scene_collections[\s\S]*for key share/i,
        );
      },
    );

    it(
      "atomically freezes 1 to 50 contiguous unique current database revisions",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]start_creator_event_run_sheet[(][\s\S]*from public[.]creator_event_run_sheets[\s\S]*for update[\s\S]*pg_advisory_xact_lock[\s\S]*from public[.]creator_scene_collections[\s\S]*for update/i,
        );
        expect(
          migration,
        ).toMatch(
          /source_count not between 1 and 50[\s\S]*source_min_position <> 0[\s\S]*source_max_position <> source_count - 1[\s\S]*source_distinct_scenes <> source_count/i,
        );
        expect(
          migration,
        ).toMatch(
          /for share of collection_item, scene[\s\S]*insert into public[.]creator_event_run_sheet_items[\s\S]*scene[.]revision[\s\S]*collection_item[.]position[\s\S]*jsonb_array_length/i,
        );
        expect(
          migration,
        ).toMatch(
          /get diagnostics snapshot_count = row_count[\s\S]*snapshot_count <> source_count[\s\S]*status = 'running'[\s\S]*source_collection_title[\s\S]*started_at = now[(][)]/i,
        );
      },
    );

    it(
      "advances and completes with matching row locks, versions, and positions",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]advance_creator_event_run_sheet[(][\s\S]*for update[\s\S]*active_position <> expected_position_value[\s\S]*version <> expected_version_value[\s\S]*max[(]frozen_item[.]position[)][\s\S]*active_position = target_run_sheet[.]active_position [+] 1[\s\S]*version = target_run_sheet[.]version [+] 1/i,
        );
        expect(
          migration,
        ).toMatch(
          /function public[.]complete_creator_event_run_sheet[(][\s\S]*for update[\s\S]*active_position <> expected_position_value[\s\S]*version <> expected_version_value[\s\S]*active_position <> final_position[\s\S]*status = 'completed'[\s\S]*completed_at = now[(][)]/i,
        );
      },
    );

    it(
      "deletes only planned exact-version rows and removes obsolete bypass signatures",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]delete_creator_event_run_sheet[(][\s\S]*for update[\s\S]*status <> 'planned'[\s\S]*retained and cannot be deleted[\s\S]*version <> expected_version_value[\s\S]*delete from public[.]creator_event_run_sheets/i,
        );
        expect(
          migration,
        ).toMatch(
          /drop function if exists public[.]save_creator_event_run_sheet[(][\s\S]*timestamptz,[\s\S]*text[\s\S]*drop function if exists[\s\S]*advance_creator_event_run_sheet[(]uuid, integer[)][\s\S]*delete_creator_event_run_sheet[(]uuid[)]/i,
        );
      },
    );

    it(
      "indexes owner lifecycle, source exclusivity, and frozen item reads",
      () => {
        expect(
          migration,
        ).toMatch(
          /owner_status_starts_index[\s\S]*owner_id[\s\S]*status[\s\S]*starts_at[\s\S]*items_owner_run_sheet_index[\s\S]*owner_id[\s\S]*run_sheet_id[\s\S]*position/i,
        );
      },
    );
  },
);
