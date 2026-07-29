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
    "20260729000558_creator_snapshot_templates.sql",
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8",
  );

describe(
  "creator Snapshot templates migration security contract",
  () => {
    it(
      "creates bounded fixed-theme owner templates with one default",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]creator_snapshot_templates[\s\S]*owner_id uuid not null[\s\S]*name text not null[\s\S]*brand_label text not null[\s\S]*theme text not null[\s\S]*is_default boolean not null/i,
        );

        expect(
          migration,
        ).toMatch(
          /name_length[\s\S]*between 1 and 60[\s\S]*brand_label_length[\s\S]*between 1 and 32[\s\S]*theme[\s\S]*'sunset'[\s\S]*'midnight'[\s\S]*'paper'/i,
        );

        expect(
          migration,
        ).toMatch(
          /create unique index if not exists creator_snapshot_templates_one_default_index[\s\S]*owner_id[\s\S]*where is_default = true/i,
        );
      },
    );

    it(
      "keeps template rows owner-only and read-only through the Data API",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]creator_snapshot_templates[\s\S]*enable row level security/i,
        );

        expect(
          migration,
        ).toMatch(
          /create policy "Owners can read creator Snapshot templates"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth[.]uid[(][)][)] = owner_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on public[.]creator_snapshot_templates[\s\S]*from public, anon, authenticated[\s\S]*grant select[\s\S]*to authenticated/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant (?:insert|update|delete|all)[\s\S]*on public[.]creator_snapshot_templates[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "saves and deletes only through strictly authenticated owner RPCs",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]save_creator_snapshot_template[(][\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*auth[.]uid[(][)][\s\S]*for update[\s\S]*at most 20 Snapshot templates/i,
        );

        expect(
          migration,
        ).toMatch(
          /update public[.]creator_snapshot_templates[\s\S]*owner_id = current_user_id[\s\S]*insert into public[.]creator_snapshot_templates/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]save_creator_snapshot_template[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]delete_creator_snapshot_template[(][\s\S]*auth[.]uid[(][)][\s\S]*delete from public[.]creator_snapshot_templates[\s\S]*owner_id = current_user_id[\s\S]*if not found/i,
        );
      },
    );

    it(
      "adds complete Snapshot provenance and stamps it from an owner template",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]snapshots[\s\S]*add column if not exists template_id uuid[\s\S]*add column if not exists template_brand_label text[\s\S]*add column if not exists template_theme text/i,
        );

        expect(
          migration,
        ).toMatch(
          /snapshots_template_provenance_complete[\s\S]*template_id is null[\s\S]*template_brand_label is null[\s\S]*template_theme is null[\s\S]*template_id is not null[\s\S]*between 1 and 32/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]stamp_snapshot_template_provenance[(][)][\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*template[.]id = new[.]template_id[\s\S]*template[.]owner_id = new[.]user_id/i,
        );
      },
    );

    it(
      "makes published branding immutable and revokes direct function execution",
      () => {
        expect(
          migration,
        ).toMatch(
          /tg_op = 'UPDATE'[\s\S]*new[.]template_id is distinct from old[.]template_id[\s\S]*Snapshot template provenance is immutable[\s\S]*new[.]template_brand_label := old[.]template_brand_label[\s\S]*new[.]template_theme := old[.]template_theme/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]stamp_snapshot_template_provenance[(][)][\s\S]*from public, anon, authenticated, service_role/i,
        );
      },
    );
  },
);
