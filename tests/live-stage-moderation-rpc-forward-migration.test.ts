import {
  createHash,
} from "node:crypto";
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

const historicalMigration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260729013323_live_stage_moderation.sql",
    ),
    "utf8",
  );

const forwardMigration =
  readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260729022846_live_stage_moderation_actor_overloads.sql",
    ),
    "utf8",
  );

function canonicalizeSql(
  sql: string,
): string {
  return sql
    .replace(
      /\s+/gu,
      " ",
    )
    .replace(
      /\(\s+/gu,
      "(",
    )
    .replace(
      /\s+\)/gu,
      ")",
    )
    .trim();
}

function functionDefinition(
  migration: string,
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

const hardenedOverloads = [
  {
    functionName:
      "report_live_stage_message",
    declaration:
      "create or replace function public.report_live_stage_message(stage_id_value uuid, message_id_value uuid, reason_value text, expected_actor_id_value uuid)",
    identity:
      "uuid, uuid, text, uuid",
    legacyIdentity:
      "uuid, uuid, text",
  },
  {
    functionName:
      "moderate_live_stage_member",
    declaration:
      "create or replace function public.moderate_live_stage_member(stage_id_value uuid, target_user_id_value uuid, action_value text, expected_actor_id_value uuid, reason_value text default null)",
    identity:
      "uuid, uuid, text, uuid, text",
    legacyIdentity:
      "uuid, uuid, text, text",
  },
  {
    functionName:
      "moderate_live_stage_message",
    declaration:
      "create or replace function public.moderate_live_stage_message(stage_id_value uuid, message_id_value uuid, expected_actor_id_value uuid, reason_value text default null)",
    identity:
      "uuid, uuid, uuid, text",
    legacyIdentity:
      "uuid, uuid, text",
  },
] as const;

const canonicalForwardMigration =
  canonicalizeSql(
    forwardMigration,
  );

describe(
  "live Stage moderation RPC forward migration",
  () => {
    it(
      "leaves the committed historical migration byte-for-byte unchanged",
      () => {
        expect(
          createHash(
            "sha256",
          )
            .update(
              historicalMigration,
            )
            .digest(
              "hex",
            ),
        ).toBe(
          "2ffe76e7dfed76f9d06717c4a226073014b09fd205d6f3772b829e8308bb4133",
        );
      },
    );

    it(
      "re-declares the three exact actor-bound overloads from the canonical migration",
      () => {
        expect(
          forwardMigration.match(
            /create or replace function public[.](?:report_live_stage_message|moderate_live_stage_member|moderate_live_stage_message)\(/gu,
          ),
        ).toHaveLength(
          hardenedOverloads.length,
        );

        for (
          const {
            declaration,
            functionName,
          } of hardenedOverloads
        ) {
          const forwardDefinition =
            functionDefinition(
              forwardMigration,
              functionName,
            );
          const historicalDefinition =
            functionDefinition(
              historicalMigration,
              functionName,
            );

          expect(
            canonicalizeSql(
              forwardDefinition,
            ),
          ).toBe(
            canonicalizeSql(
              historicalDefinition,
            ),
          );

          expect(
            canonicalizeSql(
              forwardDefinition,
            ),
          ).toContain(
            declaration,
          );
        }
      },
    );

    it.each(
      hardenedOverloads,
    )(
      "locks down $functionName to the authenticated actor-bound signature",
      ({
        functionName,
        identity,
      }) => {
        const definition =
          canonicalizeSql(
            functionDefinition(
              forwardMigration,
              functionName,
            ),
          );

        expect(
          definition,
        ).toContain(
          "returns void language plpgsql security definer set search_path = ''",
        );

        expect(
          definition,
        ).toContain(
          "current_user_id uuid := (select auth.uid())",
        );

        expect(
          definition,
        ).toMatch(
          /current_user_id is null then raise exception[\s\S]+?using errcode = '42501'/u,
        );

        expect(
          definition,
        ).toMatch(
          /current_user_id is distinct from expected_actor_id_value then raise exception[\s\S]+?using errcode = '42501'/u,
        );

        expect(
          canonicalForwardMigration,
        ).toContain(
          `revoke all on function public.${functionName}(${identity}) from public, anon, authenticated, service_role`,
        );

        expect(
          canonicalForwardMigration,
        ).toContain(
          `grant execute on function public.${functionName}(${identity}) to authenticated`,
        );
      },
    );

    it(
      "grants each hardened overload only to authenticated callers",
      () => {
        expect(
          canonicalForwardMigration.match(
            /revoke all on function public[.](?:report_live_stage_message|moderate_live_stage_member|moderate_live_stage_message)\(/gu,
          ),
        ).toHaveLength(
          hardenedOverloads.length,
        );

        expect(
          canonicalForwardMigration.match(
            /grant execute on function public[.](?:report_live_stage_message|moderate_live_stage_member|moderate_live_stage_message)\(/gu,
          ),
        ).toHaveLength(
          hardenedOverloads.length,
        );

        expect(
          canonicalForwardMigration,
        ).not.toMatch(
          /grant execute on function public[.](?:report_live_stage_message|moderate_live_stage_member|moderate_live_stage_message)\([^)]*\) to (?:public|anon|service_role)/u,
        );
      },
    );

    it(
      "retains report access checks and host-only live mutation checks",
      () => {
        const reportDefinition =
          canonicalizeSql(
            functionDefinition(
              forwardMigration,
              "report_live_stage_message",
            ),
          );
        const memberDefinition =
          canonicalizeSql(
            functionDefinition(
              forwardMigration,
              "moderate_live_stage_member",
            ),
          );
        const messageDefinition =
          canonicalizeSql(
            functionDefinition(
              forwardMigration,
              "moderate_live_stage_message",
            ),
          );

        expect(
          reportDefinition,
        ).toContain(
          "private.can_access_live_stage(stage_id_value)",
        );

        expect(
          reportDefinition,
        ).toContain(
          "where message.id = message_id_value and message.stage_id = stage_id_value",
        );

        expect(
          reportDefinition,
        ).toContain(
          "private.canal_users_are_blocked(current_user_id, message_author_id)",
        );

        for (
          const definition of [
            memberDefinition,
            messageDefinition,
          ]
        ) {
          expect(
            definition,
          ).toContain(
            "stage.host_id = current_user_id",
          );

          expect(
            definition,
          ).toContain(
            "stage_status <> 'live'",
          );
        }
      },
    );

    it(
      "leaves legacy overload permissions and definitions untouched for compatibility",
      () => {
        expect(
          canonicalForwardMigration,
        ).not.toMatch(
          /\bdrop function\b/u,
        );

        for (
          const {
            functionName,
            legacyIdentity,
          } of hardenedOverloads
        ) {
          expect(
            canonicalForwardMigration,
          ).not.toContain(
            `on function public.${functionName}(${legacyIdentity})`,
          );
        }
      },
    );

    it(
      "applies all overload and privilege changes atomically",
      () => {
        expect(
          canonicalForwardMigration.startsWith(
            "begin;",
          ),
        ).toBe(
          true,
        );

        expect(
          canonicalForwardMigration.endsWith(
            "commit;",
          ),
        ).toBe(
          true,
        );
      },
    );
  },
);
