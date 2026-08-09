import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

const migration =
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260728202905_live_stages_realtime.sql",
    ),
    "utf8",
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );

const hostReturningPolicy =
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260808044250_live_stage_host_returning_policy.sql",
    ),
    "utf8",
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );

const stageDetail =
  readFileSync(
    resolve(
      process.cwd(),
      "app/live-stage/[stageId].tsx",
    ),
    "utf8",
  ).replace(
    /\s+/g,
    " ",
  );

const createStage =
  readFileSync(
    resolve(
      process.cwd(),
      "app/create-stage.tsx",
    ),
    "utf8",
  ).replace(
    /\s+/g,
    " ",
  );

function sqlBetween(
  start: string,
  end: string,
): string {
  const startIndex =
    migration.indexOf(
      start,
    );
  const endIndex =
    migration.indexOf(
      end,
      startIndex,
    );

  expect(
    startIndex,
  ).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    endIndex,
  ).toBeGreaterThan(
    startIndex,
  );

  return migration.slice(
    startIndex,
    endIndex,
  );
}

describe(
  "live Stage database security contract",
  () => {
    it(
      "assigns invite codes on the server and does not grant clients that column",
      () => {
        expect(
          migration,
        ).toContain(
          "create trigger live_stages_assign_code before insert on public.live_stages",
        );

        const insertGrant =
          sqlBetween(
            "grant insert (",
            ") on public.live_stages",
          );

        expect(
          insertGrant,
        ).not.toContain(
          "stage_code",
        );
      },
    );

    it(
      "consumes a join attempt before looking up a six-digit code",
      () => {
        const joinRpc =
          sqlBetween(
            "create or replace function public.join_live_stage_by_code",
            "revoke all on function public.join_live_stage_by_code",
          );
        const throttleIndex =
          joinRpc.indexOf(
            "private.consume_live_stage_join_attempt",
          );
        const lookupIndex =
          joinRpc.indexOf(
            "where stage.stage_code = stage_code_value",
          );

        expect(
          throttleIndex,
        ).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          lookupIndex,
        ).toBeGreaterThan(
          throttleIndex,
        );
      },
    );

    it(
      "limits the privileged join RPC to authenticated callers",
      () => {
        expect(
          migration,
        ).toContain(
          "revoke all on function public.join_live_stage_by_code(text, uuid) from public, anon, authenticated, service_role",
        );
        expect(
          migration,
        ).toContain(
          "grant execute on function public.join_live_stage_by_code(text, uuid) to authenticated",
        );
      },
    );

    it(
      "uses database broadcasts with an authorized private-channel listener",
      () => {
        expect(
          migration,
        ).toContain(
          "perform realtime.send(",
        );
        expect(
          migration,
        ).toContain(
          "'stage_changed', 'live-stage:' || target_stage_id::text, true",
        );

        const broadcastPolicy =
          sqlBetween(
            'create policy "live stage members can receive broadcasts"',
            "do $$",
          );

        expect(
          broadcastPolicy,
        ).toContain(
          "on realtime.messages for select to authenticated",
        );
        expect(
          broadcastPolicy,
        ).toContain(
          "private.can_access_live_stage(",
        );
        expect(
          broadcastPolicy,
        ).toContain(
          "private.live_stage_id_from_topic(",
        );
      },
    );

    it(
      "opens and renders only normalized Live track resources",
      () => {
        expect(
          stageDetail,
        ).toContain(
          "getLiveStageTrackSpotifyUrl( currentTrack, )",
        );
        expect(
          stageDetail,
        ).toContain(
          "Linking.openURL( currentTrackSpotifyUrl, )",
        );
        expect(
          stageDetail,
        ).not.toContain(
          "Linking.openURL( currentTrack.spotifyUrl",
        );
        expect(
          stageDetail,
        ).toContain(
          "getLiveStageTrackImageUrl( currentTrack, )",
        );
        expect(
          stageDetail,
        ).toContain(
          "source={ currentTrackImageUrl }",
        );
        expect(
          stageDetail,
        ).toContain(
          '"Produced by Canal."',
        );
        expect(
          stageDetail,
        ).not.toContain(
          '"Produced and hosted by Canal."',
        );
      },
    );

    it(
      "does not submit a local Scene identifier as a cloud foreign key",
      () => {
        expect(
          createStage,
        ).toContain(
          "tracks: sceneTracks( selectedScene, )",
        );
        expect(
          createStage,
        ).not.toContain(
          "sceneId: selectedScene.id",
        );
      },
    );

    it(
      "lets a host read the Stage returned by its own insert",
      () => {
        expect(
          hostReturningPolicy,
        ).toContain(
          'create policy "members can read accessible live stages" on public.live_stages for select to authenticated',
        );
        expect(
          hostReturningPolicy,
        ).toContain(
          "(select auth.uid()) = host_id",
        );
        expect(
          hostReturningPolicy,
        ).toContain(
          "or (select private.can_access_live_stage(id))",
        );
      },
    );
  },
);
