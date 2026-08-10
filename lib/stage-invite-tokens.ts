import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type StageInviteRole =
  | "listener"
  | "member"
  | "collaborator";

export type StageInviteToken = Readonly<{
  token: string;
  expiresAt: string;
  role: StageInviteRole;
}>;

export type StageInviteRedemption = Readonly<{
  stageId: string;
  role: StageInviteRole;
  alreadyRedeemed: boolean;
}>;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const STAGE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function currentUserId(): Promise<string> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error("Sign in to use this Stage invitation.");
  }
  return data.user.id;
}

async function assertSameUser(expectedUserId: string): Promise<void> {
  if (await currentUserId() !== expectedUserId) {
    throw new Error(
      "Your Canal account changed. Reopen the Stage invitation and try again.",
    );
  }
}

function inviteRole(value: unknown): StageInviteRole | null {
  return value === "listener" || value === "member" || value === "collaborator"
    ? value
    : null;
}

export async function createStageInviteToken(input: Readonly<{
  stageId: string;
  role: StageInviteRole;
  expiresInSeconds?: number;
  maxRedemptions?: number;
}>): Promise<StageInviteToken> {
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc("create_live_stage_invite_link", {
    stage_id_value: input.stageId,
    grant_role_value: input.role,
    expires_in_seconds: input.expiresInSeconds ?? 86_400,
    max_redemptions_value: input.maxRedemptions ?? 1,
  });
  await assertSameUser(userId);

  const row = Array.isArray(data) ? data[0] : data;
  const token = row && typeof row === "object" && "invite_token" in row
    ? row.invite_token
    : null;
  const expiresAt = row && typeof row === "object" && "expires_at" in row
    ? row.expires_at
    : null;
  const role = row && typeof row === "object" && "grant_role" in row
    ? inviteRole(row.grant_role)
    : null;

  if (
    error ||
    typeof token !== "string" ||
    !TOKEN_PATTERN.test(token) ||
    typeof expiresAt !== "string" ||
    !role
  ) {
    throw new Error(error?.message || "Canal could not create this Stage invitation.");
  }
  return { token, expiresAt, role };
}

export async function redeemStageInviteToken(
  stageId: string,
  token: string,
): Promise<StageInviteRedemption> {
  if (!STAGE_UUID_PATTERN.test(stageId) || !TOKEN_PATTERN.test(token)) {
    throw new Error("This Stage invitation is invalid or unavailable.");
  }
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc("redeem_live_stage_invite_link", {
    expected_stage_id_value: stageId,
    invite_token_value: token,
  });
  await assertSameUser(userId);

  const row = Array.isArray(data) ? data[0] : data;
  const redeemedStageId = row && typeof row === "object" && "stage_id" in row
    ? row.stage_id
    : null;
  const role = row && typeof row === "object" && "granted_role" in row
    ? inviteRole(row.granted_role)
    : null;
  const alreadyRedeemed = row && typeof row === "object" && "already_redeemed" in row
    ? row.already_redeemed
    : null;
  if (
    error ||
    typeof redeemedStageId !== "string" ||
    redeemedStageId !== stageId ||
    !role ||
    typeof alreadyRedeemed !== "boolean"
  ) {
    throw new Error(error?.message || "This Stage invitation expired, was revoked, or is unavailable.");
  }
  const result: StageInviteRedemption = {
    stageId: redeemedStageId,
    role,
    alreadyRedeemed,
  };
  if (result.stageId !== stageId) {
    throw new Error("This Stage invitation expired, was revoked, or is unavailable.");
  }
  return result;
}

export async function revokeStageInviteToken(token: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) return false;
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc("revoke_live_stage_invite_link", {
    invite_token_value: token,
  });
  await assertSameUser(userId);
  if (error) throw new Error(error.message || "Canal could not revoke this invitation.");
  return data === true;
}

export function buildStageInviteUrl(
  baseUrl: string,
  stageId: string,
  token: string,
): string {
  if (!STAGE_UUID_PATTERN.test(stageId) || !TOKEN_PATTERN.test(token)) {
    throw new Error("Cannot create a link from an invalid Stage invitation.");
  }
  const normalizedBase = baseUrl.replace(/\/+$/u, "");
  return `${normalizedBase}/stages/${encodeURIComponent(stageId)}/join?invite=${encodeURIComponent(token)}`;
}
