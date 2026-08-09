import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260809045216_live_stage_collaboration_invitations.sql",
  ),
  "utf8",
);

describe("live Stage collaboration invitations", () => {
  it("stores bounded host-owned invitations with recipient RLS", () => {
    expect(migration).toContain(
      "create table if not exists public.live_stage_collaboration_invites",
    );
    expect(migration).toContain(
      "unique (stage_id, invitee_id)",
    );
    expect(migration).toContain(
      "invitee_id = (select auth.uid())",
    );
    expect(migration).toContain(
      "inviter_id = (select auth.uid())",
    );
    expect(migration).toContain(
      "array_length(invitee_ids_value, 1) > 25",
    );
  });

  it("allows only mutual friends to receive a host invitation", () => {
    expect(migration).toContain(
      "Only the host can invite collaborators",
    );
    expect(migration).toContain(
      "outgoing.user_id = current_user_id",
    );
    expect(migration).toContain(
      "incoming.user_id = invitee_id_value",
    );
    expect(migration).toContain(
      "Only mutual Canal friends can be invited",
    );
  });

  it("creates an Activity invitation and accepts it atomically", () => {
    expect(migration).toContain(
      "stage_invite_id uuid",
    );
    expect(migration).toContain(
      "Stage collaboration invite",
    );
    expect(migration).toContain(
      "respond_to_live_stage_collaboration_invite",
    );
    expect(migration).toContain(
      "do update set role = 'collaborator'",
    );
  });

  it("restricts contributions to hosts and accepted collaborators", () => {
    expect(migration).toContain(
      "enforce_live_stage_contribution_role",
    );
    expect(migration).toContain(
      "member.role = 'collaborator'",
    );
    expect(migration).toContain(
      "Only the host or an accepted collaborator can contribute",
    );
  });

  it("notifies listeners promoted after a Stage is already live", () => {
    expect(migration).toContain(
      "notify_live_stage_collaborator_promotion",
    );
    expect(migration).toContain(
      "You are now a Stage collaborator",
    );
    expect(migration).toContain(
      "Add a Scene or create your own take",
    );
  });
});
