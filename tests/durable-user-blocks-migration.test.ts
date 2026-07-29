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
      "20260729020413_durable_relationship_blocks.sql",
    ),
    "utf8",
  );

const profileAndStageMigration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260728211454_complete_profile_social_and_stage_provenance.sql",
    ),
    "utf8",
  );

const stageModerationMigration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260729013323_live_stage_moderation.sql",
    ),
    "utf8",
  );

function functionBody(
  schema:
    | "private"
    | "public",
  name: string,
): string {
  return (
    migration.match(
      new RegExp(
        `create or replace function ${schema}[.]${name}[(][\\s\\S]*?as [$][$]([\\s\\S]*?)[$][$];`,
        "i",
      ),
    )?.[1] ??
    ""
  );
}

function policyBody(
  policyName: string,
  operation:
    | "select"
    | "insert"
    | "update"
    | "delete",
): string {
  return (
    migration.match(
      new RegExp(
        `create policy "${policyName}"[\\s\\S]*?for ${operation}[\\s\\S]*?(?=drop policy|commit;)`,
        "i",
      ),
    )?.[0] ??
    ""
  );
}

describe(
  "durable relationship blocks migration",
  () => {
    it(
      "commits a private operator-verification scaffold before the hardening transaction",
      () => {
        const scaffoldIndex =
          migration.indexOf(
            "private.user_relationship_block_verifications (",
          );

        const firstCommitIndex =
          migration.indexOf(
            "commit;",
          );

        const hardeningBeginIndex =
          migration.indexOf(
            "begin;",
            firstCommitIndex +
              "commit;".length,
          );

        const lockIndex =
          migration.indexOf(
            "lock table public.user_relationships",
          );

        expect(
          scaffoldIndex,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          migration,
        ).toMatch(
          /create table if not exists\s+private[.]user_relationship_block_verifications \([\s\S]*user_id uuid not null[\s\S]*legacy_target_username text not null[\s\S]*verified_target_user_id uuid not null[\s\S]*references auth[.]users[(]id[)][\s\S]*verified_at timestamptz not null[\s\S]*verification_note text not null[\s\S]*primary key \(\s*user_id,\s*legacy_target_username\s*\)/i,
        );

        expect(
          migration,
        ).toMatch(
          /alter table\s+private[.]user_relationship_block_verifications\s+enable row level security;\s*revoke all\s+on table private[.]user_relationship_block_verifications\s+from public, anon, authenticated, service_role;/i,
        );

        expect(
          scaffoldIndex,
        ).toBeLessThan(
          firstCommitIndex,
        );

        expect(
          firstCommitIndex,
        ).toBeLessThan(
          hardeningBeginIndex,
        );

        expect(
          hardeningBeginIndex,
        ).toBeLessThan(
          lockIndex,
        );
      },
    );

    it(
      "locks first and requires reviewed evidence for null and already-bound legacy blocks",
      () => {
        const lockIndex =
          migration.indexOf(
            "lock table public.user_relationships",
          );

        const guardIndex =
          migration.indexOf(
            "if exists (",
          );

        const dedupeIndex =
          migration.indexOf(
            "with ranked_relationships as (",
          );

        const firstAlterIndex =
          migration.indexOf(
            "alter table public.user_relationships",
          );

        expect(
          lockIndex,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          lockIndex,
        ).toBeLessThan(
          guardIndex,
        );

        expect(
          migration,
        ).toMatch(
          /lock table public[.]user_relationships\s*in access exclusive mode;\s*lock table private[.]user_relationship_block_verifications\s*in share mode;\s*lock table public[.]profiles\s*in share row exclusive mode/i,
        );

        expect(
          guardIndex,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          migration,
        ).toMatch(
          /if exists \(\s*select 1\s*from public[.]user_relationships as relationship\s*where relationship[.]relationship_type = 'blocked'\s*and not exists \([\s\S]*private[.]user_relationship_block_verifications[\s\S]*verification[.]user_id =\s*relationship[.]user_id[\s\S]*verification[.]legacy_target_username =\s*relationship[.]target_username[\s\S]*\) then\s*raise exception[\s\S]*errcode = '23502'[\s\S]*including already non-null target IDs/i,
        );

        expect(
          guardIndex,
        ).toBeLessThan(
          dedupeIndex,
        );

        expect(
          guardIndex,
        ).toBeLessThan(
          firstAlterIndex,
        );

        expect(
          migration,
        ).toMatch(
          /update public[.]user_relationships as relationship\s*set target_user_id =\s*verification[.]verified_target_user_id\s*from private[.]user_relationship_block_verifications\s+as verification[\s\S]*relationship[.]relationship_type = 'blocked'[\s\S]*verification[.]legacy_target_username =\s*relationship[.]target_username/i,
        );

        const targetIdAssignments =
          migration.match(
            /update public[.]user_relationships[\s\S]*?set target_user_id[\s\S]*?;/gi,
          ) ??
          [];

        expect(
          targetIdAssignments,
        ).toHaveLength(
          1,
        );

        expect(
          targetIdAssignments[0],
        ).toMatch(
          /verified_target_user_id[\s\S]*private[.]user_relationship_block_verifications/i,
        );

        expect(
          targetIdAssignments[0],
        ).not.toMatch(
          /public[.]profiles|handle/i,
        );
      },
    );

    it(
      "deduplicates with blocks winning before moving identity to a non-null UUID primary key",
      () => {
        expect(
          migration,
        ).toMatch(
          /row_number[(][)] over \(\s*partition by\s*user_id,\s*target_user_id\s*order by\s*case relationship_type\s*when 'blocked' then 0\s*else 1\s*end,\s*created_at desc/i,
        );

        expect(
          migration,
        ).toMatch(
          /delete from public[.]user_relationships as relationship[\s\S]*relationship_rank > 1/i,
        );

        expect(
          migration,
        ).toMatch(
          /delete from public[.]user_relationships as follow\s*using public[.]user_relationships as block\s*where follow[.]relationship_type = 'following'\s*and block[.]relationship_type = 'blocked'\s*and follow[.]user_id = block[.]target_user_id\s*and follow[.]target_user_id = block[.]user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /drop index if exists\s+public[.]user_relationships_owner_target_unique_index/i,
        );

        expect(
          migration,
        ).toMatch(
          /drop constraint if exists user_relationships_pkey[\s\S]*alter column target_user_id set not null[\s\S]*add constraint user_relationships_pkey\s*primary key \(\s*user_id,\s*target_user_id\s*\)/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /primary key \(\s*user_id,\s*target_username/i,
        );

        expect(
          migration,
        ).toMatch(
          /drop constraint if exists\s+user_relationships_target_user_id_fkey[\s\S]*add constraint user_relationships_target_user_id_fkey\s*foreign key [(]target_user_id[)]\s*references auth[.]users[(]id[)]\s*on delete cascade/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /add constraint user_relationships_target_user_id_fkey[\s\S]*references public[.]profiles/i,
        );
      },
    );

    it(
      "makes the shared block helper UUID-only",
      () => {
        const helper =
          functionBody(
            "private",
            "canal_users_are_blocked",
          );

        expect(
          helper,
        ).toMatch(
          /[(]select auth[.]uid[(][)][)] is not null[\s\S]*[(]select auth[.]uid[(][)][)] = first_user_id[\s\S]*or [(]select auth[.]uid[(][)][)] = second_user_id[\s\S]*relationship[.]user_id = first_user_id[\s\S]*relationship[.]target_user_id = second_user_id[\s\S]*relationship[.]relationship_type = 'blocked'/i,
        );

        expect(
          helper,
        ).not.toMatch(
          /target_username|profiles|handle/i,
        );
      },
    );

    it(
      "refreshes username snapshots by immutable target UUID on migration, profile insert, and handle change",
      () => {
        expect(
          migration,
        ).toMatch(
          /update public[.]user_relationships as relationship\s*set target_username = lower[(]target_profile[.]handle[)]\s*from public[.]profiles as target_profile\s*where relationship[.]target_user_id = target_profile[.]id/i,
        );

        expect(
          migration,
        ).toMatch(
          /function private[.]refresh_relationship_target_username[(][)][\s\S]*security definer\s*set search_path = ''[\s\S]*if tg_op = 'INSERT' then[\s\S]*elsif old[.]handle is distinct from new[.]handle then[\s\S]*update public[.]user_relationships\s*set target_username = lower[(]new[.]handle[)][\s\S]*where target_user_id = new[.]id/i,
        );

        expect(
          migration,
        ).toMatch(
          /create trigger profiles_refresh_relationship_target_username\s*after insert or update of handle\s*on public[.]profiles\s*for each row\s*execute function private[.]refresh_relationship_target_username[(][)]/i,
        );
      },
    );

    it(
      "binds the block RPC to the exact authenticated account and current target identity",
      () => {
        const rpc =
          functionBody(
            "public",
            "set_canal_user_block",
          );

        expect(
          migration,
        ).toMatch(
          /function public[.]set_canal_user_block\(\s*target_user_id_value uuid,\s*target_username_value text,\s*blocked_value boolean,\s*expected_actor_id_value uuid\s*\)\s*returns void\s*language plpgsql\s*security definer\s*set search_path = ''/i,
        );

        expect(
          rpc,
        ).toMatch(
          /current_user_id uuid :=\s*[(]select auth[.]uid[(][)][)]/i,
        );

        expect(
          rpc,
        ).toMatch(
          /current_user_id is null[\s\S]*errcode = '42501'[\s\S]*expected_actor_id_value is null\s*or expected_actor_id_value <> current_user_id[\s\S]*errcode = '42501'/i,
        );

        expect(
          rpc,
        ).toMatch(
          /blocked_value is null[\s\S]*A block state is required/i,
        );

        expect(
          rpc,
        ).toMatch(
          /target_user_id_value is null[\s\S]*immutable target profile ID is required to change a block[\s\S]*target_user_id_value = current_user_id[\s\S]*cannot block or unblock itself[\s\S]*if not blocked_value then/i,
        );

        expect(
          rpc,
        ).toMatch(
          /select\s*target_profile[.]id,\s*lower[(]target_profile[.]handle[)][\s\S]*where target_profile[.]id =\s*target_user_id_value\s*for share/i,
        );

        expect(
          rpc,
        ).not.toMatch(
          /normalized_target_username|where lower[(]target_profile[.]handle[)]|target profile ID or current handle/i,
        );

        expect(
          rpc,
        ).toMatch(
          /resolved_target_user_id is null\s*or current_target_username is null[\s\S]*target Canal profile could not be resolved/i,
        );

        const unblockBranchEnd =
          rpc.indexOf(
            "select\n    target_profile.id",
          );

        const unblockBranch =
          rpc.slice(
            rpc.indexOf(
              "if not blocked_value then",
            ),
            unblockBranchEnd,
          );

        expect(
          unblockBranch,
        ).toMatch(
          /delete from public[.]user_relationships[\s\S]*target_user_id =\s*target_user_id_value[\s\S]*relationship_type = 'blocked'[\s\S]*return;/i,
        );

        expect(
          unblockBranch,
        ).not.toMatch(
          /target_username_value|profiles/i,
        );
      },
    );

    it(
      "atomically removes reciprocal follows and changes only the caller's exact UUID block",
      () => {
        const rpc =
          functionBody(
            "public",
            "set_canal_user_block",
          );

        expect(
          rpc,
        ).toMatch(
          /delete from public[.]user_relationships\s*where relationship_type = 'following'[\s\S]*user_id = current_user_id[\s\S]*target_user_id =\s*resolved_target_user_id[\s\S]*user_id = resolved_target_user_id[\s\S]*target_user_id =\s*current_user_id/i,
        );

        expect(
          rpc,
        ).toMatch(
          /insert into public[.]user_relationships[\s\S]*current_user_id,\s*resolved_target_user_id,\s*current_target_username,\s*'blocked'[\s\S]*on conflict \(\s*user_id,\s*target_user_id\s*\)[\s\S]*relationship_type = 'blocked'/i,
        );

        expect(
          rpc,
        ).toMatch(
          /if not blocked_value then[\s\S]*delete from public[.]user_relationships\s*where user_id = current_user_id\s*and target_user_id =\s*target_user_id_value\s*and relationship_type = 'blocked'[\s\S]*return;/i,
        );

        const deleteStatements =
          rpc.match(
            /delete from public[.]user_relationships[\s\S]*?;/gi,
          ) ??
          [];

        expect(
          deleteStatements,
        ).not.toHaveLength(
          0,
        );

        for (
          const statement
          of deleteStatements
        ) {
          expect(
            statement,
          ).not.toMatch(
            /target_username\s*=/i,
          );
        }
      },
    );

    it(
      "serializes direct follows and RPC blocks on the same UUID pair invariant",
      () => {
        const invariant =
          functionBody(
            "private",
            "enforce_relationship_pair_invariants",
          );

        const rpc =
          functionBody(
            "public",
            "set_canal_user_block",
          );

        for (
          const body
          of [
            invariant,
            rpc,
          ]
        ) {
          expect(
            body,
          ).toMatch(
            /pg_catalog[.]pg_advisory_xact_lock\(\s*pg_catalog[.]hashtextextended\(\s*least\([\s\S]*\|\| ':'\s*\|\| greatest\(/i,
          );
        }

        expect(
          migration,
        ).toMatch(
          /create trigger user_relationships_enforce_pair_invariants\s*before insert or update\s*on public[.]user_relationships\s*for each row\s*execute function private[.]enforce_relationship_pair_invariants[(][)]/i,
        );

        expect(
          invariant,
        ).toMatch(
          /new[.]relationship_type = 'following'[\s\S]*block[.]user_id = new[.]user_id[\s\S]*block[.]target_user_id =\s*new[.]target_user_id[\s\S]*or exists[\s\S]*block[.]user_id =\s*new[.]target_user_id[\s\S]*block[.]target_user_id =\s*new[.]user_id[\s\S]*follow cannot cross an active Canal block/i,
        );

        expect(
          invariant,
        ).toMatch(
          /[(]select auth[.]uid[(][)][)] is not null\s*and [(]select auth[.]uid[(][)][)] <> new[.]user_id then\s*return new/i,
        );
      },
    );

    it(
      "exposes the hardened RPC only to authenticated callers",
      () => {
        expect(
          migration,
        ).toMatch(
          /revoke all\s*on function public[.]set_canal_user_block[(]uuid, text, boolean, uuid[)]\s*from public, anon, authenticated, service_role;\s*grant execute\s*on function public[.]set_canal_user_block[(]uuid, text, boolean, uuid[)]\s*to authenticated;/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant execute\s*on function public[.]set_canal_user_block[(]uuid, text, boolean, uuid[)]\s*to (?:public|anon|service_role)/i,
        );
      },
    );

    it(
      "allows direct reads and writes only for UUID-backed follows with reciprocal block checks",
      () => {
        const selectPolicy =
          policyBody(
            "Users can read profile follows",
            "select",
          );

        const insertPolicy =
          policyBody(
            "Users can create their own relationships",
            "insert",
          );

        const updatePolicy =
          policyBody(
            "Users can update their own relationships",
            "update",
          );

        const deletePolicy =
          policyBody(
            "Users can delete their own relationships",
            "delete",
          );

        expect(
          selectPolicy,
        ).toMatch(
          /relationship_type = 'following'[\s\S]*target_user_id = [(]select auth[.]uid[(][)][)][\s\S]*source_profile[.]id = user_id[\s\S]*target_profile[.]id = target_user_id/i,
        );

        expect(
          selectPolicy.match(
            /not private[.]canal_users_are_blocked[(]/gi,
          ) ?? [],
        ).toHaveLength(
          4,
        );

        for (
          const policy
          of [
            insertPolicy,
            updatePolicy,
          ]
        ) {
          expect(
            policy,
          ).toMatch(
            /relationship_type = 'following'/i,
          );

          expect(
            policy,
          ).toMatch(
            /target_user_id is not null/i,
          );

          expect(
            policy,
          ).toMatch(
            /target_profile[.]id = target_user_id[\s\S]*target_profile[.]is_public = true[\s\S]*lower[(]target_profile[.]handle[)] =\s*lower[(]target_username[)]/i,
          );

          expect(
            policy,
          ).toMatch(
            /not private[.]canal_users_are_blocked\(\s*[(]select auth[.]uid[(][)][)],\s*target_user_id\s*\)[\s\S]*not private[.]canal_users_are_blocked\(\s*target_user_id,\s*[(]select auth[.]uid[(][)][)]\s*\)/i,
          );

          expect(
            policy,
          ).not.toMatch(
            /relationship_type = 'blocked'/i,
          );
        }

        expect(
          updatePolicy,
        ).toMatch(
          /using \(\s*[(]select auth[.]uid[(][)][)] = user_id\s*and relationship_type = 'following'\s*\)/i,
        );

        expect(
          deletePolicy,
        ).toMatch(
          /for delete[\s\S]*using \(\s*[(]select auth[.]uid[(][)][)] = user_id\s*and relationship_type = 'following'\s*\)/i,
        );

        expect(
          deletePolicy,
        ).not.toMatch(
          /relationship_type = 'blocked'/i,
        );
      },
    );

    it(
      "keeps Live Stage access and moderation wired to the hardened helper",
      () => {
        expect(
          profileAndStageMigration,
        ).toMatch(
          /function private[.]can_access_live_stage[\s\S]*private[.]canal_users_are_blocked\(\s*[(]select auth[.]uid[(][)][)],\s*stage[.]host_id\s*\)[\s\S]*private[.]canal_users_are_blocked\(\s*stage[.]host_id,\s*[(]select auth[.]uid[(][)]\s*[)]/i,
        );

        const stageHelperCalls =
          stageModerationMigration.match(
            /private[.]canal_users_are_blocked[(]/g,
          ) ??
          [];

        expect(
          stageHelperCalls.length,
        ).toBeGreaterThanOrEqual(
          10,
        );
      },
    );
  },
);
