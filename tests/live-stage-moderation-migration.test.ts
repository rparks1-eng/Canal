import {
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

const migration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260729013323_live_stage_moderation.sql",
    ),
    "utf8",
  );

const realtimeMigration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260728202905_live_stages_realtime.sql",
    ),
    "utf8",
  );

const compactMigration =
  migration.replace(
    /\s+/gu,
    " ",
  );

const canonicalMigration =
  compactMigration
    .replace(
      /\(\s+/gu,
      "(",
    )
    .replace(
      /\s+\)/gu,
      ")",
    );

function functionBody(
  functionName: string,
): string {
  const marker =
    `create or replace function public.${functionName}(`;
  const start =
    migration.indexOf(
      marker,
    );
  const end =
    migration.indexOf(
      "$$;",
      start,
    );

  expect(
    start,
  ).toBeGreaterThanOrEqual(
    0,
  );

  expect(
    end,
  ).toBeGreaterThan(
    start,
  );

  return migration.slice(
    start,
    end + 3,
  );
}

describe(
  "live Stage moderation migration",
  () => {
    it(
      "throttles chat on the server without exposing the rate-limit table",
      () => {
        expect(
          canonicalMigration,
        ).toContain(
          "create table if not exists private.live_stage_message_rate_limits",
        );

        expect(
          canonicalMigration,
        ).toContain(
          "attempt_time - interval '10 seconds'",
        );

        expect(
          compactMigration,
        ).toContain(
          "if current_count > 5 then",
        );

        expect(
          compactMigration,
        ).toContain(
          "create trigger zz_live_stage_messages_throttle before insert on public.live_stage_messages",
        );

        expect(
          compactMigration,
        ).toContain(
          "revoke all on private.live_stage_message_rate_limits from public, anon, authenticated, service_role",
        );
      },
    );

    it(
      "retains immutable, bounded moderation evidence",
      () => {
        const evidenceTable =
          migration.match(
            /create table if not exists public[.]live_stage_moderation_events \(([\s\S]+?)\n\);/u,
          )?.[1] ??
          "";

        expect(
          evidenceTable,
        ).toContain(
          "stage_id uuid not null",
        );

        expect(
          evidenceTable,
        ).not.toMatch(
          /references public[.](?:live_stages|live_stage_members|live_stage_messages)/u,
        );

        expect(
          evidenceTable,
        ).toContain(
          "octet_length(evidence_body)",
        );

        expect(
          evidenceTable,
        ).toContain(
          "live_stage_moderation_events_report_context",
        );

        expect(
          evidenceTable,
        ).toMatch(
          /action = 'message_reported'[\s\S]+?report_reason is not null[\s\S]+?action <> 'message_reported'[\s\S]+?report_reason is null/u,
        );

        expect(
          compactMigration,
        ).toContain(
          "alter table public.live_stage_moderation_events enable row level security",
        );

        expect(
          compactMigration,
        ).toContain(
          "grant select on public.live_stage_bans, public.live_stage_moderation_events to authenticated, service_role",
        );

        expect(
          compactMigration,
        ).toMatch(
          /create policy "Actors and hosts can read live Stage moderation evidence"[\s\S]+?actor_id = \(select auth[.]uid\(\)\)[\s\S]+?action <> 'message_reported'[\s\S]+?stage[.]host_id = \(select auth[.]uid\(\)\)/u,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant\s+(?:update|delete|insert)[\s\S]*on public[.]live_stage_moderation_events/u,
        );
      },
    );

    it.each([
      [
        "report_live_stage_message",
        "uuid, uuid, text, uuid",
      ],
      [
        "moderate_live_stage_member",
        "uuid, uuid, text, uuid, text",
      ],
      [
        "moderate_live_stage_message",
        "uuid, uuid, uuid, text",
      ],
    ])(
      "locks down the %s RPC",
      (
        functionName,
        signature,
      ) => {
        const body =
          functionBody(
            functionName,
          );

        expect(
          body,
        ).toContain(
          "returns void",
        );

        expect(
          body,
        ).toContain(
          "security definer",
        );

        expect(
          body,
        ).toContain(
          "set search_path = ''",
        );

        expect(
          body,
        ).toContain(
          "(select auth.uid())",
        );

        expect(
          body,
        ).toContain(
          "current_user_id is distinct from",
        );

        expect(
          body,
        ).toContain(
          "expected_actor_id_value",
        );

        expect(
          canonicalMigration,
        ).toContain(
          `revoke all on function public.${functionName}(${signature}) from public, anon, authenticated, service_role`,
        );

        expect(
          canonicalMigration,
        ).toContain(
          `grant execute on function public.${functionName}(${signature}) to authenticated`,
        );
      },
    );

    it(
      "keeps reporting available after a Stage ends while live-only host mutations stay locked",
      () => {
        const reportBody =
          functionBody(
            "report_live_stage_message",
          );

        expect(
          reportBody,
        ).not.toContain(
          "stage.status = 'live'",
        );

        expect(
          reportBody,
        ).not.toContain(
          "stage_status <> 'live'",
        );

        expect(
          reportBody,
        ).toContain(
          "private.can_access_live_stage",
        );

        expect(
          reportBody,
        ).not.toContain(
          "from public.live_stage_members",
        );

        expect(
          reportBody,
        ).toMatch(
          /from public[.]live_stage_messages[\s\S]+?private[.]canal_users_are_blocked\(\s*current_user_id,\s*message_author_id\s*\)[\s\S]+?private[.]canal_users_are_blocked\(\s*message_author_id,\s*current_user_id\s*\)[\s\S]+?insert into public[.]live_stage_moderation_events/u,
        );

        expect(
          reportBody,
        ).toMatch(
          /reason_value is null\s+or reason_value not in/u,
        );

        expect(
          functionBody(
            "moderate_live_stage_member",
          ),
        ).toMatch(
          /action_value is null\s+or action_value not in/u,
        );

        for (
          const functionName of [
            "moderate_live_stage_member",
            "moderate_live_stage_message",
          ]
        ) {
          expect(
            functionBody(
              functionName,
            ),
          ).toContain(
            "stage_status <> 'live'",
          );
        }

        expect(
          compactMigration,
        ).toContain(
          "create or replace function private.touch_live_stage()",
        );

        expect(
          compactMigration,
        ).toContain(
          "if old.status = 'ended' and new.status is distinct from 'ended' then",
        );

        expect(
          realtimeMigration,
        ).toContain(
          "execute function private.touch_live_stage()",
        );
      },
    );

    it(
      "persists removals as bans across direct and code join paths",
      () => {
        const memberBody =
          functionBody(
            "moderate_live_stage_member",
          );
        const joinBody =
          functionBody(
            "join_live_stage_by_code",
          );

        expect(
          memberBody,
        ).toMatch(
          /action_value = 'remove'[\s\S]+?insert into public[.]live_stage_bans[\s\S]+?delete from public[.]live_stage_members/u,
        );

        expect(
          compactMigration,
        ).toContain(
          "create policy \"Listeners can join public live Stages\"",
        );

        expect(
          compactMigration,
        ).toMatch(
          /create policy "Listeners can join public live Stages"[\s\S]+?not exists \( select 1 from public[.]live_stage_bans/u,
        );

        expect(
          joinBody,
        ).toMatch(
          /exists \([\s\S]+?from public[.]live_stage_bans[\s\S]+?ban[.]user_id = current_user_id/u,
        );

        expect(
          compactMigration,
        ).toMatch(
          /create or replace function private[.]can_access_live_stage[\s\S]+?not exists \( select 1 from public[.]live_stage_bans/u,
        );
      },
    );

    it(
      "hides reciprocally blocked peers while leaving server-authorized invalidation payloads row-free",
      () => {
        const membershipPolicy =
          migration.match(
            /create policy "Members can read live Stage membership"([\s\S]+?)\n\);/u,
          )?.[1] ??
          "";
        const messagePolicy =
          migration.match(
            /create policy "Members can read live Stage messages"([\s\S]+?)\n\);/u,
          )?.[1] ??
          "";

        for (
          const policy of [
            membershipPolicy,
            messagePolicy,
          ]
        ) {
          expect(
            policy,
          ).toContain(
            "private.canal_users_are_blocked",
          );

          expect(
            policy.match(
              /private[.]canal_users_are_blocked/gu,
            ),
          ).toHaveLength(
            2,
          );

          expect(
            policy,
          ).toContain(
            "user_id = (select auth.uid())",
          );

          expect(
            policy,
          ).toContain(
            "stage.host_id =",
          );
        }

        expect(
          realtimeMigration,
        ).toMatch(
          /realtime[.]send\(\s*jsonb_build_object\(\s*'stage_id',[\s\S]+?'stage_changed'/u,
        );

        expect(
          realtimeMigration,
        ).not.toMatch(
          /realtime[.]send\([\s\S]{0,250}(?:message[.]body|member[.]display_name)/u,
        );
      },
    );

    it(
      "closes unaudited host table mutations without breaking self-service leave",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "drop policy if exists \"Hosts can update live Stage roles\" on public.live_stage_members",
        );

        expect(
          compactMigration,
        ).toContain(
          "revoke update (role) on public.live_stage_members from authenticated",
        );

        expect(
          compactMigration,
        ).toMatch(
          /create policy "Members can leave live Stages"[\s\S]+?auth[.]uid\(\)\) = user_id[\s\S]+?role <> 'host'/u,
        );

        expect(
          compactMigration,
        ).toContain(
          "drop policy if exists \"Authors and hosts can delete live Stage messages\" on public.live_stage_messages",
        );

        expect(
          compactMigration,
        ).not.toMatch(
          /where stage[.]id = stage_id(?:\s|$)/u,
        );
      },
    );
  },
);
