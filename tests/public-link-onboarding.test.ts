import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260809234903_public_link_onboarding.sql"),
  "utf8",
);
const tokenClient = fs.readFileSync(path.join(root, "lib/stage-invite-tokens.ts"), "utf8");
const previewClient = fs.readFileSync(path.join(root, "lib/public-link-previews.ts"), "utf8");

describe("public link onboarding security contract", () => {
  it("stores only a cryptographic hash of an opaque token", () => {
    expect(migration).toContain("extensions.gen_random_bytes(32)");
    expect(migration).toContain("extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256')");
    expect(migration).toContain("token_hash bytea not null unique");
    expect(migration).not.toMatch(/raw_token\s+text\s+not null/iu);
    expect(tokenClient).toContain("/stages/${encodeURIComponent(stageId)}/join?invite=${encodeURIComponent(token)}");
    expect(tokenClient).not.toContain("stageCode");
  });

  it("supports bounded roles, expiry, revocation, and idempotent account replay", () => {
    expect(migration).toContain("grant_role in ('listener', 'member', 'collaborator')");
    expect(migration).toContain("invite_row.revoked_at is not null");
    expect(migration).toContain("invite_row.expires_at <= timezone('utc', now())");
    expect(migration).toContain("primary key (token_id, user_id)");
    expect(migration).toContain("redemption.user_id = current_user_id");
    expect(migration).toContain("prior_redemption.granted_role");
    expect(migration).toContain("true;");
  });

  it("binds redemption to auth.uid and rate limits before token lookup", () => {
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration).toContain("private.consume_live_stage_invite_redemption_attempt(current_user_id)");
    expect(migration.indexOf("consume_live_stage_invite_redemption_attempt(current_user_id)"))
      .toBeLessThan(migration.indexOf("select invite.*"));
    expect(migration).toContain("user_id = current_user_id");
    expect(migration).not.toContain("stage_code_value");
    expect(tokenClient).toContain("await assertSameUser(userId)");
    expect(tokenClient).toContain("Your Canal account changed");
  });

  it("keeps token state private and exposes only hardened RPCs", () => {
    expect(migration).toContain("alter table private.live_stage_invite_tokens enable row level security");
    expect(migration).toContain("revoke all on private.live_stage_invite_tokens from public, anon, authenticated");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("grant execute on function public.redeem_live_stage_invite_link(uuid, text)\nto authenticated");
    expect(migration).not.toMatch(/grant execute on function private[.]redeem_live_stage_invite_token/iu);
    expect(migration).not.toContain("grant usage on schema private");
  });

  it("binds redemption to the canonical Stage before replay or membership mutation", () => {
    expect(migration).toContain("expected_stage_id_value uuid");
    expect(migration).toContain("invite_row.stage_id is distinct from expected_stage_id_value");
    expect(migration.indexOf("invite_row.stage_id is distinct from expected_stage_id_value"))
      .toBeLessThan(migration.indexOf("select redemption.*"));
    expect(tokenClient).toContain("redeemStageInviteToken(\n  stageId: string,\n  token: string");
    expect(tokenClient).toContain("expected_stage_id_value: stageId");
  });

  it("fails private previews closed and never enumerates Stage members or codes", () => {
    expect(migration).toContain("coalesce(scene.payload ->> 'visibility', 'private') = 'public'");
    expect(migration).toContain("snapshot.visibility = 'public'");
    expect(migration).toContain("stage.visibility = 'public'");
    expect(migration).toContain("profile.is_public = true");
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]*?'stageCode'/u);
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]*?'members'/u);
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]*?'participants'/u);
  });

  it("uses opaque public UUIDs instead of internal Scene and Snapshot identifiers", () => {
    expect(migration).toContain("add column if not exists public_share_id uuid");
    expect(migration).toContain("set public_share_id = gen_random_uuid()");
    expect(migration).toContain("alter column public_share_id set not null");
    expect(migration).toContain("scenes_public_share_id_unique_index");
    expect(migration).toContain("snapshots_public_share_id_unique_index");
    expect(migration).toContain("get_or_create_public_scene_share_id");
    expect(migration).toContain("get_or_create_public_snapshot_share_id");
    expect(migration).toContain("scene.user_id = current_user_id");
    expect(migration).toContain("snapshot.user_id = current_user_id");
    expect(migration).toContain("where scene.public_share_id = public_share_id_value");
    expect(migration).toContain("where snapshot.public_share_id = public_share_id_value");
    expect(migration).not.toContain("owner_id_value");
    expect(migration).toContain(
      "grant execute on function public.get_public_snapshot_link_preview(uuid)",
    );
    expect(migration).not.toContain(
      "public.get_public_snapshot_link_preview(text)",
    );
  });

  it("fences owner share-ID lookups across account switches", () => {
    expect(previewClient).toContain("const userId = await currentUserId()");
    expect(previewClient.match(/await assertSameUser\(userId\)/gu)).toHaveLength(2);
    expect(previewClient).toContain("Your Canal account changed");
  });

  it("preserves the existing six-digit code join contract", () => {
    const legacy = fs.readFileSync(
      path.join(root, "supabase/migrations/20260809173000_live_stage_contribution_moderation.sql"),
      "utf8",
    );
    expect(legacy).toContain("join_live_stage_as_collaborator_by_code");
    expect(legacy).toContain("private.consume_live_stage_join_attempt(current_user_id)");
    expect(legacy).toContain("contribution.moderation_status = 'approved'");
    expect(legacy).toContain("set moderation_status = case when ready then 'approved' else 'pending' end");
  });
});
