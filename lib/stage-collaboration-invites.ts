import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type StageCollaborationInviteResult = {
  id: string;
  stageId: string;
  inviteeId: string;
  status: "pending" | "accepted" | "declined" | "revoked";
};

type InviteRow = {
  id?: unknown;
  stage_id?: unknown;
  invitee_id?: unknown;
  status?: unknown;
};

async function currentUserId(): Promise<string> {
  requireSupabaseConfiguration();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new Error(
      "Sign in to manage Stage collaborators.",
    );
  }

  return user.id;
}

async function assertSameUser(
  expectedUserId: string,
): Promise<void> {
  if (
    await currentUserId() !==
    expectedUserId
  ) {
    throw new Error(
      "Your Canal account changed. Reopen the Stage and try again.",
    );
  }
}

export async function inviteStageCollaborators(
  stageId: string,
  inviteeIds: readonly string[],
): Promise<StageCollaborationInviteResult[]> {
  const userId =
    await currentUserId();

  const uniqueInvitees =
    Array.from(
      new Set(
        inviteeIds.filter(
          (inviteeId) =>
            inviteeId &&
            inviteeId !== userId,
        ),
      ),
    ).slice(0, 25);

  if (uniqueInvitees.length < 1) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "invite_live_stage_collaborators",
      {
        stage_id_value: stageId,
        invitee_ids_value:
          uniqueInvitees,
      },
    );

  await assertSameUser(userId);

  if (error) {
    throw new Error(
      error.message ||
        "Canal could not invite these collaborators.",
    );
  }

  return ((data ?? []) as InviteRow[])
    .map((row) => {
      const status =
        typeof row.status === "string"
          ? row.status
          : "";

      if (
        typeof row.id !== "string" ||
        typeof row.stage_id !== "string" ||
        typeof row.invitee_id !== "string" ||
        ![
          "pending",
          "accepted",
          "declined",
          "revoked",
        ].includes(status)
      ) {
        return null;
      }

      return {
        id: row.id,
        stageId: row.stage_id,
        inviteeId:
          row.invitee_id,
        status:
          status as StageCollaborationInviteResult["status"],
      };
    })
    .filter(
      (
        value,
      ): value is StageCollaborationInviteResult =>
        value !== null,
    );
}

export async function respondToStageCollaborationInvite(
  inviteId: string,
  accept: boolean,
): Promise<string> {
  const userId =
    await currentUserId();

  const { data, error } =
    await supabase.rpc(
      "respond_to_live_stage_collaboration_invite",
      {
        invite_id_value:
          inviteId,
        accept_value: accept,
      },
    );

  await assertSameUser(userId);

  if (error) {
    throw new Error(
      error.message ||
        "Canal could not respond to this Stage invitation.",
    );
  }

  const stageId =
    data &&
    typeof data === "object" &&
    typeof (
      data as {
        id?: unknown;
      }
    ).id === "string"
      ? (
          data as {
            id: string;
          }
        ).id
      : "";

  if (!stageId) {
    throw new Error(
      "This Stage invitation is no longer available.",
    );
  }

  return stageId;
}
