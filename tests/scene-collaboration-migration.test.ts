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
    "20260728231656_scene_collaboration.sql",
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8",
  );

describe(
  "Scene collaboration migration security contract",
  () => {
    it(
      "adds a positive server revision and a constrained membership table",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]scenes[\s\S]*add column if not exists revision bigint not null default 1/i,
        );

        expect(
          migration,
        ).toMatch(
          /constraint scenes_revision_positive[\s\S]*check [(]revision > 0[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]stamp_canal_scene_revision[(][)][\s\S]*security invoker[\s\S]*new[.]revision = old[.]revision[\s\S]*old[.]revision [+] 1[\s\S]*A Scene revision must advance by exactly one/i,
        );

        expect(
          migration,
        ).toMatch(
          /create trigger scenes_stamp_revision[\s\S]*before insert or update[\s\S]*on public[.]scenes[\s\S]*stamp_canal_scene_revision[(][)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]scene_collaborators[\s\S]*primary key [(]\s*scene_owner_id,\s*scene_id,\s*collaborator_id\s*[)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /update public[.]scenes[\s\S]*where payload ->> 'revision' is null/i,
        );

        expect(
          migration,
        ).toMatch(
          /foreign key [(]\s*scene_owner_id,\s*scene_id\s*[)][\s\S]*references public[.]scenes [(]\s*user_id,\s*id\s*[)][\s\S]*on delete cascade/i,
        );

        for (
          const status of [
            "pending",
            "accepted",
            "declined",
            "revoked",
          ]
        ) {
          expect(
            migration,
          ).toContain(
            `'${status}'`,
          );
        }
      },
    );

    it(
      "exposes memberships read-only to owners and invitees",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]scene_collaborators[\s\S]*enable row level security/i,
        );

        expect(
          migration,
        ).toMatch(
          /create policy "Scene owners and invitees can read collaborations"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth[.]uid[(][)][)] = scene_owner_id[\s\S]*auth[.]uid[(][)][)] = collaborator_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on public[.]scene_collaborators[\s\S]*from public, anon, authenticated/i,
        );

        expect(
          migration,
        ).toMatch(
          /grant select[\s\S]*on public[.]scene_collaborators[\s\S]*to authenticated/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant (?:insert|update|delete|all)[\s\S]*on public[.]scene_collaborators[\s\S]*to authenticated/i,
        );
      },
    );

    it(
      "locks invitation lifecycle mutations behind authenticated RPCs",
      () => {
        for (
          const signature of [
            "invite_scene_collaborator\\(uuid, text, text\\)",
            "respond_to_scene_collaboration\\(uuid, text, text\\)",
            "revoke_scene_collaborator\\(uuid, text, uuid\\)",
          ]
        ) {
          expect(
            migration,
          ).toMatch(
            new RegExp(
              `revoke all[\\s\\S]*on function public[.]${signature}[\\s\\S]*from public, anon, authenticated, service_role`,
              "i",
            ),
          );

          expect(
            migration,
          ).toMatch(
            new RegExp(
              `grant execute[\\s\\S]*on function public[.]${signature}[\\s\\S]*to authenticated`,
              "i",
            ),
          );
        }

        expect(
          migration,
        ).toMatch(
          /function public[.]invite_scene_collaborator[\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*auth[.]uid[(][)][\s\S]*Only the Scene owner can invite collaborators[\s\S]*canal_users_are_blocked/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]respond_to_scene_collaboration[\s\S]*response must be accepted or declined[\s\S]*collaborator_id = current_user_id[\s\S]*status = 'pending'/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]revoke_scene_collaborator[\s\S]*Only the Scene owner can revoke collaborators[\s\S]*status = 'revoked'/i,
        );
      },
    );

    it(
      "adds accepted and unblocked collaborator reads without weakening public reads",
      () => {
        expect(
          migration,
        ).toMatch(
          /create policy "Authenticated users can read own or public scenes"[\s\S]*auth[.]uid[(][)][)] = user_id[\s\S]*payload ->> 'visibility'[\s\S]*owner_profile[.]is_public = true/i,
        );

        expect(
          migration,
        ).toMatch(
          /scene_collaborators as collaboration[\s\S]*collaboration[.]collaborator_id = [(]select auth[.]uid[(][)][)][\s\S]*collaboration[.]status = 'accepted'/i,
        );

        const blockedChecks =
          migration.match(
            /private[.]canal_users_are_blocked/g,
          ) ?? [];

        expect(
          blockedChecks.length,
        ).toBeGreaterThanOrEqual(
          6,
        );
      },
    );

    it(
      "uses bounded compare-and-swap updates with immutable ownership",
      () => {
        expect(
          migration,
        ).toMatch(
          /function public[.]update_collaborative_scene[\s\S]*expected_revision_value bigint[\s\S]*scene_payload_value jsonb[\s\S]*returns public[.]scenes[\s\S]*security definer[\s\S]*set search_path = ''/i,
        );

        expect(
          migration,
        ).toMatch(
          /octet_length[(]scene_payload_value::text[)] > 262144[\s\S]*jsonb_array_length[\s\S]*> 200/i,
        );

        expect(
          migration,
        ).toMatch(
          /The Scene ID is immutable[\s\S]*The Scene owner is immutable/i,
        );

        expect(
          migration,
        ).toMatch(
          /select scene[.][*][\s\S]*for update[\s\S]*current_scene[.]revision <> expected_revision_value[\s\S]*SCENE_REVISION_CONFLICT[\s\S]*errcode = '40001'/i,
        );

        expect(
          migration,
        ).toMatch(
          /update public[.]scenes[\s\S]*revision = next_revision[\s\S]*revision = expected_revision_value/i,
        );

        expect(
          migration,
        ).toMatch(
          /function public[.]stamp_canal_scene_revision[\s\S]*scene_collaborators as collaboration[\s\S]*new[.]payload ->> 'revision'[\s\S]*payload_revision_text::bigint <> old[.]revision[\s\S]*SCENE_REVISION_CONFLICT[\s\S]*errcode = '40001'/i,
        );

        const ownerUpdatePolicy =
          migration.match(
            /create policy "Users can update their own scenes"[\s\S]*?;\s*\n/i,
          )?.[0] ??
          "";

        expect(
          ownerUpdatePolicy,
        ).toMatch(
          /using[\s\S]*auth[.]uid[(][)][\s\S]*user_id[\s\S]*with check[\s\S]*auth[.]uid[(][)][\s\S]*user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /jsonb_build_object[\s\S]*'id',[\s\S]*scene_id_value[\s\S]*'ownerId',[\s\S]*scene_owner_id_value::text[\s\S]*'revision',[\s\S]*next_revision/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /entry[.]key = any[\s\S]*'favorite'|entry[.]key = any[\s\S]*'playCount'|entry[.]key = any[\s\S]*'feedback'/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*on function public[.]update_collaborative_scene[(]uuid, text, bigint, jsonb[)][\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
        );
      },
    );
  },
);
