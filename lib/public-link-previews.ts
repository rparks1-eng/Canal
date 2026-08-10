import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

export type PublicLinkPreview = Readonly<Record<string, unknown> & {
  kind: "scene" | "snapshot" | "stage";
  id: string;
}>;

const PUBLIC_SHARE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function currentUserId(): Promise<string> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error("Sign in to share this Canal post.");
  }
  return data.user.id;
}

async function assertSameUser(expectedUserId: string): Promise<void> {
  if (await currentUserId() !== expectedUserId) {
    throw new Error(
      "Your Canal account changed. Reopen this post and try again.",
    );
  }
}

function normalizePreview(value: unknown): PublicLinkPreview | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    (record.kind !== "scene" && record.kind !== "snapshot" && record.kind !== "stage") ||
    typeof record.id !== "string" ||
    !record.id
  ) return null;
  return record as PublicLinkPreview;
}

async function preview(
  rpcName:
    | "get_public_scene_link_preview"
    | "get_public_snapshot_link_preview"
    | "get_public_stage_link_preview",
  args: Record<string, string>,
): Promise<PublicLinkPreview | null> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) throw new Error(error.message || "Canal could not load this public preview.");
  return normalizePreview(data);
}

export async function getOrCreatePublicSceneShareId(
  sceneId: string,
): Promise<string> {
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc("get_or_create_public_scene_share_id", {
    scene_id_value: sceneId,
  });
  await assertSameUser(userId);
  if (error || typeof data !== "string" || !PUBLIC_SHARE_ID_PATTERN.test(data)) {
    throw new Error(error?.message || "Publish this Scene before sharing it.");
  }
  return data;
}

export async function getOrCreatePublicSnapshotShareId(
  snapshotId: string,
): Promise<string> {
  const userId = await currentUserId();
  const { data, error } = await supabase.rpc("get_or_create_public_snapshot_share_id", {
    snapshot_id_value: snapshotId,
  });
  await assertSameUser(userId);
  if (error || typeof data !== "string" || !PUBLIC_SHARE_ID_PATTERN.test(data)) {
    throw new Error(error?.message || "Publish this Snapshot before sharing it.");
  }
  return data;
}

export function getPublicSceneLinkPreview(
  publicShareId: string,
): Promise<PublicLinkPreview | null> {
  return preview("get_public_scene_link_preview", {
    public_share_id_value: publicShareId,
  });
}

export function getPublicSnapshotLinkPreview(
  publicShareId: string,
): Promise<PublicLinkPreview | null> {
  return preview("get_public_snapshot_link_preview", {
    public_share_id_value: publicShareId,
  });
}

export function getPublicStageLinkPreview(
  stageId: string,
): Promise<PublicLinkPreview | null> {
  return preview("get_public_stage_link_preview", {
    stage_id_value: stageId,
  });
}
