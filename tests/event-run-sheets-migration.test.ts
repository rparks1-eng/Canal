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
    "20260729002555_creator_event_run_sheets.sql",
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8",
  );

describe(
  "private Event Run Sheets migration security contract",
  () => {
    it(
      "creates bounded owner collection Run Sheets",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]creator_event_run_sheets[\s\S]*owner_id uuid not null[\s\S]*collection_id uuid not null[\s\S]*active_position integer not null default 0[\s\S]*status text not null default 'planned'/i,
        );

        expect(
          migration,
        ).toMatch(
          /foreign key [(][\s\S]*owner_id[\s\S]*collection_id[\s\S]*references public[.]creator_scene_collections[\s\S]*owner_id[\s\S]*id[\s\S]*on delete cascade/i,
        );

        expect(
          migration,
        ).toMatch(
          /title_length[\s\S]*between 1 and 80[\s\S]*venue_length[\s\S]*between 1 and 120[\s\S]*time_zone_length[\s\S]*between 1 and 64[\s\S]*'planned'[\s\S]*'completed'/i,
        );
      },
    );

    it(
      "enforces collection-backed positions and deferred collection integrity",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]validate_creator_event_run_sheet[(][)][\s\S]*count[(][*][)]::integer[\s\S]*collection_item_count = 0[\s\S]*active_position > collection_item_count[\s\S]*status = 'planned'[\s\S]*active_position >= collection_item_count/i,
        );

        expect(
          migration,
        ).toMatch(
          /create constraint trigger creator_event_run_sheets_validate_collection_change[\s\S]*after insert or update or delete[\s\S]*deferrable initially deferred/i,
        );

        expect(
          migration,
        ).toMatch(
          /if tg_op in \('DELETE', 'UPDATE'\)[\s\S]*old[.]owner_id[\s\S]*old[.]collection_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /if tg_op in \('INSERT', 'UPDATE'\)[\s\S]*new[.]owner_id[\s\S]*new[.]collection_id/i,
        );
      },
    );

    it(
      "allows only owners to read and exposes no Data API writes",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]creator_event_run_sheets[\s\S]*enable row level security/i,
        );

        expect(
          migration,
        ).toMatch(
          /create policy "Owners can read Event Run Sheets"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth[.]uid[(][)][)] = owner_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on public[.]creator_event_run_sheets[\s\S]*from public, anon, authenticated[\s\S]*grant select[\s\S]*to authenticated/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant (?:insert|update|delete|all)[\s\S]*on public[.]creator_event_run_sheets[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "saves only owner collections with bounded metadata and valid time zones",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]save_creator_event_run_sheet[(][\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*auth[.]uid[(][)][\s\S]*pg_catalog[.]pg_timezone_names[\s\S]*collection[.]owner_id[\s\S]*current_user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /select run_sheet[.]owner_id[\s\S]*for update[\s\S]*owner is immutable[\s\S]*insert into public[.]creator_event_run_sheets[\s\S]*update public[.]creator_event_run_sheets/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]save_creator_event_run_sheet[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "advances atomically with a compare-and-swap and completes at the end",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]advance_creator_event_run_sheet[(][\s\S]*for update[\s\S]*active_position[\s\S]*<> expected_position_value[\s\S]*errcode = '40001'/i,
        );

        expect(
          migration,
        ).toMatch(
          /active_position =[\s\S]*current_run_sheet[.]active_position [+] 1[\s\S]*when current_run_sheet[.]active_position [+] 1[\s\S]*>= collection_item_count[\s\S]*then 'completed'/i,
        );

        expect(
          migration,
        ).toMatch(
          /where id = current_run_sheet[.]id[\s\S]*owner_id = current_user_id[\s\S]*active_position = expected_position_value/i,
        );
      },
    );

    it(
      "deletes only the authenticated owner's Run Sheet and revokes default execution",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]delete_creator_event_run_sheet[(][\s\S]*auth[.]uid[(][)][\s\S]*delete from public[.]creator_event_run_sheets[\s\S]*owner_id = current_user_id[\s\S]*if not found/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]delete_creator_event_run_sheet[(]uuid[)][\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );
      },
    );
  },
);
