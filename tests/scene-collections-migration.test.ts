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
    "20260728233934_creator_scene_collections.sql",
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8",
  );

describe(
  "creator Scene collections migration security contract",
  () => {
    it(
      "creates bounded collections with ordered owner-authored Scene items",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]creator_scene_collections[\s\S]*owner_id uuid not null[\s\S]*visibility text not null default 'draft'/i,
        );

        expect(
          migration,
        ).toMatch(
          /title_length[\s\S]*between 1 and 80[\s\S]*cntrl[\s\S]*description_length[\s\S]*char_length[(]description[)] <= 500[\s\S]*cntrl[\s\S]*visibility[\s\S]*'draft'[\s\S]*'public'/i,
        );

        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]creator_scene_collection_items[\s\S]*primary key [(]\s*collection_id,\s*scene_id\s*[)][\s\S]*unique [(]\s*collection_id,\s*position\s*[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /foreign key [(]\s*owner_id,\s*collection_id\s*[)][\s\S]*references public[.]creator_scene_collections[\s\S]*on delete cascade/i,
        );

        expect(
          migration,
        ).toMatch(
          /foreign key [(]\s*owner_id,\s*scene_id\s*[)][\s\S]*references public[.]scenes[\s\S]*on delete cascade/i,
        );
      },
    );

    it(
      "makes ownership immutable and validates public item integrity",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]protect_creator_scene_collection_owner[(][)][\s\S]*security invoker[\s\S]*new[.]owner_id is distinct from old[.]owner_id[\s\S]*owner is immutable/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]validate_creator_scene_collection_item[(][)][\s\S]*scene[.]deleted_at[\s\S]*scene[.]user_id = new[.]owner_id[\s\S]*scene_library_type = 'saved'[\s\S]*collection_visibility = 'public'[\s\S]*scene_visibility <> 'public'/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]validate_creator_scene_collection_publish[(][)][\s\S]*for share of scene[\s\S]*new[.]visibility = 'public'[\s\S]*not exists[\s\S]*creator_scene_collection_items[\s\S]*scene[.]deleted_at is not null[\s\S]*payload ->> 'visibility'[\s\S]*payload ->> 'libraryType'/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]protect_public_collection_scene[(][)][\s\S]*security invoker[\s\S]*collection[.]visibility = 'public'[\s\S]*tg_op = 'DELETE'[\s\S]*new[.]deleted_at is not null[\s\S]*new[.]payload ->> 'visibility'[\s\S]*new[.]payload ->> 'libraryType'[\s\S]*Remove the Scene from public collections/i,
        );

        expect(
          migration,
        ).toMatch(
          /create trigger scenes_protect_public_collections[\s\S]*before update of payload, deleted_at or delete[\s\S]*on public[.]scenes/i,
        );
      },
    );

    it(
      "allows owners to read drafts while public reads require an eligible profile and no blocks",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]creator_scene_collections[\s\S]*enable row level security[\s\S]*alter table public[.]creator_scene_collection_items[\s\S]*enable row level security/i,
        );

        expect(
          migration,
        ).toMatch(
          /create policy "Owners and eligible viewers can read creator Scene collections"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth[.]uid[(][)][)] = owner_id[\s\S]*visibility = 'public'[\s\S]*owner_profile[.]is_public = true/i,
        );

        expect(
          migration,
        ).toMatch(
          /create policy "Owners and eligible viewers can read creator Scene collection items"[\s\S]*auth[.]uid[(][)][)] = owner_id[\s\S]*collection[.]visibility = 'public'[\s\S]*owner_profile[.]is_public = true/i,
        );

        const blockChecks =
          migration.match(
            /private[.]canal_users_are_blocked/g,
          ) ?? [];

        expect(
          blockChecks,
        ).toHaveLength(
          4,
        );
      },
    );

    it(
      "exposes both tables as authenticated read-only Data API resources",
      () => {
        for (
          const table of [
            "creator_scene_collections",
            "creator_scene_collection_items",
          ]
        ) {
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `revoke all[\\s\\S]*on public[.]${table}[\\s\\S]*from public, anon, authenticated`,
              "i",
            ),
          );

          expect(
            migration,
          ).toMatch(
            new RegExp(
              `grant select[\\s\\S]*on public[.]${table}[\\s\\S]*to authenticated`,
              "i",
            ),
          );
        }

        expect(
          migration,
        ).not.toMatch(
          /grant (?:insert|update|delete|all)[\s\S]*on public[.]creator_scene_collection(?:s|_items)[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "saves ordered collections atomically through a strictly authenticated RPC",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]save_creator_scene_collection[(][\s\S]*collection_id_value uuid[\s\S]*scene_ids_value text[[][\]][\s\S]*returns public[.]creator_scene_collections[\s\S]*security definer[\s\S]*set search_path = ''/i,
        );

        expect(
          migration,
        ).toMatch(
          /auth[.]uid[(][)][\s\S]*cardinality[(]normalized_scene_ids[)] > 50[\s\S]*array_agg[\s\S]*trim[\s\S]*length[(]requested[.]scene_id[)] > 512[\s\S]*cntrl[\s\S]*count[(]distinct requested[.]scene_id[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /for share of scene[\s\S]*left join public[.]scenes as scene[\s\S]*scene[.]user_id = current_user_id[\s\S]*scene[.]deleted_at is null[\s\S]*normalized_visibility = 'public'[\s\S]*payload ->> 'visibility'[\s\S]*payload ->> 'libraryType'/i,
        );

        expect(
          migration,
        ).toMatch(
          /delete from public[.]creator_scene_collection_items[\s\S]*insert into public[.]creator_scene_collection_items[\s\S]*ordinality::integer - 1[\s\S]*with ordinality/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]save_creator_scene_collection[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "deletes only the authenticated owner's collection with cascading items",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]delete_creator_scene_collection[(][\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*auth[.]uid[(][)][\s\S]*delete from public[.]creator_scene_collections[\s\S]*owner_id = current_user_id[\s\S]*if not found/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]delete_creator_scene_collection[(]uuid[)][\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );
      },
    );
  },
);
