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
      "20260728202905_live_stages_realtime.sql",
    ),
    "utf8",
  );

const compactMigration =
  migration.replace(
    /\s+/g,
    " ",
  );

describe(
  "live Stage migration security contract",
  () => {
    it(
      "uses timezone-safe timestamptz values",
      () => {
        expect(
          migration,
        ).not.toContain(
          "timezone('utc', now())",
        );

        expect(
          compactMigration,
        ).toContain(
          "created_at timestamptz not null default now()",
        );
      },
    );

    it(
      "generates Stage codes in the database and throttles code joins",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "create table if not exists private.live_stage_join_attempts",
        );

        expect(
          compactMigration,
        ).toContain(
          "uuid_send( gen_random_uuid() )",
        );

        expect(
          compactMigration,
        ).toContain(
          "pg_advisory_xact_lock( 1128353356, 1 )",
        );

        expect(
          compactMigration,
        ).toContain(
          "for update",
        );

        expect(
          migration,
        ).toMatch(
          /if not private\.consume_live_stage_join_attempt\([\s\S]+?where stage\.stage_code = stage_code_value/,
        );

        expect(
          compactMigration,
        ).toContain(
          "stage_code_value text, expected_stage_id uuid default null",
        );

        expect(
          migration,
        ).toMatch(
          /where stage\.stage_code = stage_code_value[\s\S]+?if \([\s\S]+?expected_stage_id is not null[\s\S]+?expected_stage_id <> matched_stage_id[\s\S]+?return;[\s\S]+?insert into public\.live_stage_members/,
        );

        expect(
          compactMigration,
        ).toContain(
          "drop function if exists public.join_live_stage_by_code(text)",
        );

        expect(
          compactMigration,
        ).toContain(
          "revoke all on function public.join_live_stage_by_code(text, uuid)",
        );

        expect(
          compactMigration,
        ).toContain(
          "grant execute on function public.join_live_stage_by_code(text, uuid)",
        );

        const insertGrant =
          migration.match(
            /grant insert \(([\s\S]+?)\)\s+on public\.live_stages/,
          );

        expect(
          insertGrant,
        ).not.toBeNull();

        expect(
          insertGrant?.[1],
        ).not.toContain(
          "stage_code",
        );
      },
    );

    it(
      "preserves host and message authorization invariants",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "create unique index if not exists live_stage_members_single_host_index",
        );

        expect(
          compactMigration,
        ).toContain(
          "execute function private.enforce_live_stage_host_role()",
        );

        expect(
          compactMigration,
        ).toContain(
          "member.stage_id = live_stage_messages.stage_id",
        );

        expect(
          compactMigration,
        ).toContain(
          "stage.id = live_stage_messages.stage_id",
        );
      },
    );

    it(
      "retains messages when a Stage member leaves",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "drop constraint if exists live_stage_messages_member",
        );

        expect(
          compactMigration,
        ).toContain(
          "constraint live_stage_messages_stage_fkey foreign key (stage_id) references public.live_stages(id) on delete cascade",
        );

        expect(
          compactMigration,
        ).toContain(
          "constraint live_stage_messages_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade",
        );

        expect(
          migration,
        ).not.toMatch(
          /foreign key\s*\(\s*stage_id\s*,\s*user_id\s*\)\s*references\s+public\.live_stage_members/i,
        );

        expect(
          compactMigration,
        ).toContain(
          "create index if not exists live_stage_messages_user_stage_index on public.live_stage_messages ( user_id, stage_id )",
        );

        expect(
          compactMigration,
        ).toContain(
          "execute function private.stamp_live_stage_message_author()",
        );

        expect(
          compactMigration,
        ).toContain(
          "member.stage_id = live_stage_messages.stage_id",
        );
      },
    );

    it(
      "bounds and validates every serialized Stage track field",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "octet_length(tracks::text) <= 262144",
        );

        expect(
          compactMigration,
        ).toContain(
          "jsonb_array_length(tracks) <= 100",
        );

        expect(
          compactMigration,
        ).toContain(
          "private.live_stage_tracks_are_safe(tracks)",
        );

        expect(
          compactMigration,
        ).toContain(
          "grant execute on function private.live_stage_tracks_are_safe(jsonb) to authenticated, service_role",
        );

        expect(
          compactMigration,
        ).toContain(
          "grant usage on schema private to authenticated, service_role",
        );

        expect(
          compactMigration,
        ).toContain(
          "jsonb_typeof(track) <> 'object'",
        );

        expect(
          compactMigration,
        ).toContain(
          "track - array[ 'id', 'title', 'artist', 'source', 'spotifyUri', 'spotifyUrl', 'durationMs', 'imageUrl' ]::text[]",
        );

        for (
          const fieldLimit of [
            "octet_length(track ->> 'id') > 256",
            "octet_length(track ->> 'title') > 800",
            "octet_length(track ->> 'artist') > 800",
            "octet_length(track ->> 'source') > 160",
            "octet_length(track ->> 'spotifyUri') > 128",
            "octet_length(track ->> 'spotifyUrl') > 192",
            "octet_length(track ->> 'imageUrl') > 2048",
          ]
        ) {
          expect(
            compactMigration,
          ).toContain(
            fieldLimit,
          );
        }

        expect(
          compactMigration,
        ).toContain(
          "track ->> 'spotifyUri' !~ '^spotify:track:[A-Za-z0-9]{22}$'",
        );

        expect(
          compactMigration,
        ).toContain(
          "track ->> 'spotifyUrl' !~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'",
        );

        expect(
          compactMigration,
        ).toContain(
          "split_part(spotify_uri, ':', 3) <> regexp_replace(",
        );

        expect(
          compactMigration,
        ).toContain(
          "(track ->> 'durationMs')::numeric > 86400000",
        );

        expect(
          compactMigration,
        ).toContain(
          "track ->> 'imageUrl' !~ '^https://i[.]scdn[.]co/image/[A-Za-z0-9]{16,128}$'",
        );
      },
    );

    it(
      "uses authorized private Broadcast instead of Postgres Changes",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "perform realtime.send(",
        );

        expect(
          compactMigration,
        ).toContain(
          "'stage_changed', 'live-stage:' || target_stage_id::text, true",
        );

        expect(
          migration.match(
            /execute function private\.broadcast_live_stage_changed\(\)/g,
          ),
        ).toHaveLength(
          3,
        );

        expect(
          compactMigration,
        ).toContain(
          "realtime.messages.extension = 'broadcast'",
        );

        expect(
          compactMigration,
        ).toContain(
          "private.live_stage_id_from_topic( (select realtime.topic()) )",
        );

        expect(
          compactMigration,
        ).not.toContain(
          "alter publication supabase_realtime add table public.live_",
        );

        expect(
          compactMigration,
        ).toContain(
          "alter publication supabase_realtime drop table public.live_stage_members",
        );
      },
    );

    it(
      "revokes inherited authenticated table privileges before narrow grants",
      () => {
        expect(
          compactMigration,
        ).toContain(
          "revoke all on public.live_stages, public.live_stage_members, public.live_stage_messages from public, anon, authenticated",
        );
      },
    );
  },
);
