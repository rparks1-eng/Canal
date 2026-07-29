import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

const MIGRATION_PATH =
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260729033411_creator_release_ballots.sql",
  );

const migration =
  fs.readFileSync(
    MIGRATION_PATH,
    "utf8",
  );

const compact =
  migration.replace(
    /\s+/gu,
    " ",
  );

function functionSource(
  name: string,
): string {
  const start =
    migration.indexOf(
      `create or replace function public.${name}(`,
    );

  expect(start).toBeGreaterThanOrEqual(
    0,
  );

  const end =
    migration.indexOf(
      "\n$$;",
      start,
    );

  expect(end).toBeGreaterThan(
    start,
  );

  return migration.slice(
    start,
    end + 4,
  );
}

describe(
  "Creator Release Ballot migration contract",
  () => {
    it(
      "creates the four bounded, indexed tables with immutable snapshot provenance",
      () => {
        for (const table of [
          "creator_releases",
          "creator_release_items",
          "creator_release_contributors",
          "creator_release_votes",
        ]) {
          expect(
            migration,
          ).toContain(
            `create table if not exists public.${table}`,
          );
          expect(
            migration,
          ).toContain(
            `alter table public.${table}\nenable row level security`,
          );
        }

        expect(
          compact,
        ).toMatch(
          /creator_releases_title_length check \( char_length\(trim\(title\)\) between 1 and 80/u,
        );
        expect(
          compact,
        ).toMatch(
          /creator_releases_description_length check \( char_length\(description\) <= 500/u,
        );
        expect(
          compact,
        ).toMatch(
          /creator_release_items_revision_positive check \(scene_revision > 0\)/u,
        );
        expect(
          compact,
        ).toMatch(
          /creator_release_items_position_bounded check \(position between 0 and 49\)/u,
        );
        expect(
          compact,
        ).toMatch(
          /creator_release_items_final_vote_count_nonnegative check \( final_vote_count is null or final_vote_count >= 0 \)/u,
        );
        expect(
          compact,
        ).toMatch(
          /primary key \( release_id, voter_id \)/u,
        );
        expect(
          compact,
        ).toMatch(
          /foreign key \( release_id, scene_id \) references public\.creator_release_items \( release_id, scene_id \)/u,
        );

        const releaseTable =
          migration.slice(
            migration.indexOf(
              "create table if not exists public.creator_releases",
            ),
            migration.indexOf(
              "create table if not exists public.creator_release_items",
            ),
          );

        const itemTable =
          migration.slice(
            migration.indexOf(
              "create table if not exists public.creator_release_items",
            ),
            migration.indexOf(
              "create table if not exists public.creator_release_contributors",
            ),
          );

        expect(
          releaseTable,
        ).not.toMatch(
          /references public[.]creator_scene_collections/u,
        );
        expect(
          itemTable,
        ).not.toMatch(
          /references public[.]scenes/u,
        );

        for (const indexName of [
          "creator_releases_owner_status_updated_index",
          "creator_releases_collection_index",
          "creator_release_items_owner_release_index",
          "creator_release_contributors_user_status_index",
          "creator_release_votes_release_scene_index",
          "creator_release_votes_voter_release_index",
        ]) {
          expect(
            migration,
          ).toContain(
            `create index if not exists ${indexName}`,
          );
        }
      },
    );

    it(
      "protects ownership, one-way state, and every opened snapshot from direct mutation",
      () => {
        expect(
          compact,
        ).toMatch(
          /new\.owner_id is distinct from old\.owner_id or new\.collection_id is distinct from old\.collection_id/u,
        );
        expect(
          compact,
        ).toMatch(
          /\(old\.status = 'draft' and new\.status = 'open'\) or \(old\.status = 'open' and new\.status = 'closed'\)/u,
        );
        expect(
          compact,
        ).toMatch(
          /if release_status <> 'draft' then raise exception 'Opened Release Ballot Scenes are immutable\.'/u,
        );
        expect(
          migration,
        ).toContain(
          "create trigger creator_release_items_protect",
        );
        expect(
          migration,
        ).toContain(
          "create trigger creator_release_contributors_protect",
        );
        expect(
          migration,
        ).toContain(
          "create trigger creator_release_votes_protect",
        );
      },
    );

    it(
      "creates only from an owned public collection and freezes ordered IDs and database revisions atomically",
      () => {
        const create =
          functionSource(
            "create_creator_release",
          );
        const open =
          functionSource(
            "open_creator_release",
          );

        expect(
          create,
        ).toMatch(
          /creator_scene_collections[\s\S]*collection[.]owner_id = current_user_id[\s\S]*for share/u,
        );
        expect(
          create,
        ).toContain(
          "collection_visibility <> 'public'",
        );

        expect(
          open,
        ).toMatch(
          /from public[.]creator_releases as release[\s\S]*for update/u,
        );
        expect(
          open,
        ).toMatch(
          /creator_scene_collections[\s\S]*for update/u,
        );
        expect(
          open,
        ).toMatch(
          /for share of collection_item, scene/u,
        );
        expect(
          open,
        ).toMatch(
          /insert into public[.]creator_release_items[\s\S]*collection_item[.]scene_id,[\s\S]*scene[.]revision,[\s\S]*collection_item[.]position/u,
        );
        expect(
          open,
        ).toContain(
          "get diagnostics snapshot_count = row_count",
        );
        expect(
          open,
        ).toMatch(
          /status = 'open',[\s\S]*opened_at = now[(][)]/u,
        );
        expect(
          migration,
        ).toMatch(
          /^begin;[\s\S]*commit;\s*$/u,
        );
      },
    );

    it(
      "deduplicates eligible accepted collaborators and publishes only explicit consent snapshots",
      () => {
        const open =
          functionSource(
            "open_creator_release",
          );
        const respond =
          functionSource(
            "respond_creator_release_credit",
          );

        expect(
          open,
        ).toMatch(
          /select distinct[\s\S]*scene_collaborators[\s\S]*collaborator[.]status = 'accepted'/u,
        );
        expect(
          open,
        ).toContain(
          "collaborator.collaborator_id <> current_user_id",
        );
        expect(
          open.match(
            /private[.]canal_users_are_blocked/gu,
          ),
        ).toHaveLength(2);

        expect(
          compact,
        ).toMatch(
          /status = 'pending' and responded_at is null and public_display_name is null and public_handle is null/u,
        );
        expect(
          compact,
        ).toMatch(
          /status = 'accepted' and responded_at is not null and public_display_name is not null and public_handle is not null and char_length\(trim\(public_display_name\)\) between 1 and 60/u,
        );

        expect(
          respond.replace(
            /\s+/gu,
            " ",
          ),
        ).toMatch(
          /normalized_response not in \( 'accepted', 'declined' \)/u,
        );
        expect(
          respond,
        ).toMatch(
          /contributor[.]contributor_id = current_user_id[\s\S]*for update/u,
        );
        expect(
          respond,
        ).toMatch(
          /public_display_name = snapshot_display_name,[\s\S]*public_handle = snapshot_handle/u,
        );
        expect(
          respond.match(
            /private[.]canal_users_are_blocked/gu,
          ),
        ).toHaveLength(2);

        const contributorPolicy =
          migration.slice(
            migration.indexOf(
              'create policy "Private consent and accepted public creator release credits"',
            ),
            migration.indexOf(
              "revoke all\non public.creator_releases",
            ),
          );

        expect(
          contributorPolicy,
        ).toMatch(
          /status = 'accepted'[\s\S]*public_display_name is not null[\s\S]*public_handle is not null/u,
        );
        expect(
          contributorPolicy.match(
            /private[.]canal_users_are_blocked/gu,
          )?.length,
        ).toBeGreaterThanOrEqual(
          6,
        );
      },
    );

    it(
      "serializes vote and close, permits one changeable private vote, and never returns voter identity",
      () => {
        const cast =
          functionSource(
            "cast_creator_release_vote",
          );
        const close =
          functionSource(
            "close_creator_release",
          );
        const ownVote =
          functionSource(
            "read_my_creator_release_vote",
          );

        for (const source of [
          cast,
          close,
        ]) {
          expect(
            source,
          ).toMatch(
            /from public[.]creator_releases as release[\s\S]*for update/u,
          );
        }

        expect(
          cast,
        ).toContain(
          "target_release.owner_id = current_user_id",
        );
        expect(
          cast.match(
            /private[.]canal_users_are_blocked/gu,
          ),
        ).toHaveLength(2);
        expect(
          cast.replace(
            /\s+/gu,
            " ",
          ),
        ).toMatch(
          /on conflict \( release_id, voter_id \) do update/u,
        );
        expect(
          cast,
        ).toMatch(
          /returns text[\s\S]*return saved_scene_id/u,
        );
        expect(
          cast,
        ).not.toMatch(
          /returns public[.]creator_release_votes|returning creator_release_votes[.](voter_id|created_at|updated_at)/u,
        );

        expect(
          ownVote,
        ).toMatch(
          /where vote[.]release_id = target_release[.]id[\s\S]*vote[.]voter_id = current_user_id/u,
        );
        expect(
          ownVote,
        ).toMatch(
          /returns text/u,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant select\s+on public[.]creator_release_votes/iu,
        );
        expect(
          migration,
        ).not.toMatch(
          /create policy[\s\S]{0,120}creator_release_votes/iu,
        );
      },
    );

    it(
      "publishes deterministic aggregate-only results after closure and counts committed votes despite later blocks",
      () => {
        const close =
          functionSource(
            "close_creator_release",
          );
        const results =
          functionSource(
            "read_creator_release_results",
          );

        expect(
          close,
        ).toMatch(
          /update public[.]creator_release_items as item[\s\S]*set final_vote_count = \([\s\S]*count\(\*\)::bigint[\s\S]*item[.]final_vote_count is null/u,
        );
        expect(
          close,
        ).toMatch(
          /item[.]final_vote_count > 0[\s\S]*item[.]final_vote_count desc,[\s\S]*item[.]position asc/u,
        );
        expect(
          close,
        ).toMatch(
          /status = 'closed',[\s\S]*closed_at = now[(][)],[\s\S]*winner_scene_id = winning_scene_id/u,
        );
        expect(
          close,
        ).toContain(
          "A later block prevents access and future vote changes",
        );
        expect(
          results,
        ).toContain(
          "target_release.status <> 'closed'",
        );
        expect(
          results,
        ).toMatch(
          /returns table \([\s\S]*"position" integer,[\s\S]*vote_count bigint,[\s\S]*is_winner boolean/u,
        );
        expect(
          results,
        ).toMatch(
          /coalesce\([\s\S]*item[.]final_vote_count,[\s\S]*0[\s\S]*\)::bigint[\s\S]*order by item[.]position/u,
        );
        expect(
          results,
        ).not.toContain(
          "creator_release_votes",
        );
        expect(
          results.slice(
            0,
            results.indexOf(
              "language plpgsql",
            ),
          ),
        ).not.toMatch(
          /returns table \([\s\S]*voter_id/u,
        );
      },
    );

    it(
      "uses reciprocal blocks consistently for public reads and authenticated operations",
      () => {
        const releasePolicy =
          migration.slice(
            migration.indexOf(
              'create policy "Owners and eligible listeners can read creator releases"',
            ),
            migration.indexOf(
              'drop policy if exists "Owners and eligible listeners can read creator release items"',
            ),
          );
        const itemPolicy =
          migration.slice(
            migration.indexOf(
              'create policy "Owners and eligible listeners can read creator release items"',
            ),
            migration.indexOf(
              'drop policy if exists "Private consent and accepted public creator release credits"',
            ),
          );

        expect(
          releasePolicy.match(
            /private[.]canal_users_are_blocked/gu,
          ),
        ).toHaveLength(2);
        expect(
          itemPolicy.match(
            /private[.]canal_users_are_blocked/gu,
          ),
        ).toHaveLength(2);

        for (const name of [
          "respond_creator_release_credit",
          "cast_creator_release_vote",
          "read_my_creator_release_vote",
          "read_creator_release_results",
        ]) {
          expect(
            functionSource(
              name,
            ).match(
              /private[.]canal_users_are_blocked/gu,
            ),
          ).toHaveLength(2);
        }
      },
    );

    it(
      "hardens every public RPC with one actor, an empty search path, and exact grants",
      () => {
        const signatures = [
          "create_creator_release(uuid, text, text, uuid)",
          "open_creator_release(uuid, uuid)",
          "respond_creator_release_credit(uuid, text, uuid)",
          "cast_creator_release_vote(uuid, text, uuid)",
          "close_creator_release(uuid, uuid)",
          "read_my_creator_release_vote(uuid, uuid)",
          "read_creator_release_results(uuid, uuid)",
        ];

        for (const name of [
          "create_creator_release",
          "open_creator_release",
          "respond_creator_release_credit",
          "cast_creator_release_vote",
          "close_creator_release",
          "read_my_creator_release_vote",
          "read_creator_release_results",
        ]) {
          const source =
            functionSource(
              name,
            );

          expect(
            source,
          ).toContain(
            "security definer",
          );
          expect(
            source,
          ).toContain(
            "set search_path = ''",
          );
          expect(
            source,
          ).toMatch(
            /current_user_id is null[\s\S]*expected_actor_id_value is null[\s\S]*current_user_id <> expected_actor_id_value/u,
          );
        }

        for (const signature of signatures) {
          expect(
            compact,
          ).toContain(
            `revoke all on function public.${signature} from public, anon, authenticated, service_role`,
          );
          expect(
            compact,
          ).toContain(
            `grant execute on function public.${signature} to authenticated`,
          );
        }

        expect(
          compact,
        ).toContain(
          "revoke all on public.creator_release_votes from public, anon, authenticated, service_role",
        );
      },
    );
  },
);
