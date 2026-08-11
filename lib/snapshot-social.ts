import {
  isSupabaseConfigured,
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type SnapshotSocialSummary = {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type SnapshotComment = {
  id: string;
  snapshotId: string;
  userId: string;
  parentCommentId?: string;
  body: string;
  createdAt: string;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  likeCount: number;
  likedByMe: boolean;
};

export type SnapshotSocialState = {
  summary: SnapshotSocialSummary;
  comments: SnapshotComment[];
};

type LikeRow = {
  snapshot_id: string;
  user_id: string;
};

type CommentRow = {
  id: string;
  snapshot_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
};

type CommentLikeRow = {
  comment_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  handle: string;
  is_verified: boolean | null;
  avatar_url: string | null;
};

type SnapshotSocialSubscription = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<() => void>;
};

const snapshotSocialSubscriptions = new Map<
  string,
  SnapshotSocialSubscription
>();

export async function loadSnapshotSocial(
  snapshotId: string,
  expectedUserId: string,
): Promise<SnapshotSocialState> {
  requireSupabaseConfiguration();
  const safeSnapshotId = requireSnapshotId(snapshotId);
  const safeUserId = requireUserId(expectedUserId);

  await assertCurrentUser(safeUserId);

  const [likesResult, commentsResult, commentLikesResult] =
    await Promise.all([
      supabase
        .from("snapshot_likes")
        .select("snapshot_id, user_id")
        .eq("snapshot_id", safeSnapshotId),
      supabase
        .from("snapshot_comments")
        .select("id, snapshot_id, user_id, parent_comment_id, body, created_at")
        .eq("snapshot_id", safeSnapshotId)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("snapshot_comment_likes")
        .select("comment_id, user_id")
        .eq("snapshot_id", safeSnapshotId),
    ]);

  const error =
    likesResult.error ??
    commentsResult.error ??
    commentLikesResult.error;
  if (error) throw error;

  await assertCurrentUser(safeUserId);

  const likes = (likesResult.data ?? []) as LikeRow[];
  const commentRows = (commentsResult.data ?? []) as CommentRow[];
  const commentLikes = (commentLikesResult.data ?? []) as CommentLikeRow[];
  const profileIds = Array.from(new Set(commentRows.map((row) => row.user_id)));
  const profiles = await loadProfiles(profileIds);

  await assertCurrentUser(safeUserId);

  const likesByComment = new Map<string, CommentLikeRow[]>();
  for (const like of commentLikes) {
    const current = likesByComment.get(like.comment_id) ?? [];
    current.push(like);
    likesByComment.set(like.comment_id, current);
  }

  return {
    summary: {
      likeCount: likes.length,
      commentCount: commentRows.length,
      likedByMe: likes.some((like) => like.user_id === safeUserId),
    },
    comments: commentRows.map((row) => {
      const profile = profiles.get(row.user_id);
      const rowLikes = likesByComment.get(row.id) ?? [];

      return {
        id: row.id,
        snapshotId: row.snapshot_id,
        userId: row.user_id,
        parentCommentId: cleanUuid(row.parent_comment_id) ?? undefined,
        body: row.body,
        createdAt: row.created_at,
        displayName: profile?.display_name?.trim() || profile?.handle || "Canal listener",
        handle: profile?.handle || "canal_listener",
        avatarUrl: profile?.avatar_url ?? null,
        isVerified: profile?.is_verified === true,
        likeCount: rowLikes.length,
        likedByMe: rowLikes.some((like) => like.user_id === safeUserId),
      };
    }),
  };
}

export async function loadSnapshotSocialSummaries(
  snapshotIds: string[],
  expectedUserId: string,
): Promise<Record<string, SnapshotSocialSummary>> {
  if (!isSupabaseConfigured || snapshotIds.length === 0) return {};

  const ids = Array.from(new Set(snapshotIds.map(requireSnapshotId))).slice(0, 100);
  const safeUserId = requireUserId(expectedUserId);
  await assertCurrentUser(safeUserId);

  const [likesResult, commentsResult] = await Promise.all([
    supabase
      .from("snapshot_likes")
      .select("snapshot_id, user_id")
      .in("snapshot_id", ids),
    supabase
      .from("snapshot_comments")
      .select("snapshot_id")
      .in("snapshot_id", ids),
  ]);

  const error = likesResult.error ?? commentsResult.error;
  if (error) throw error;
  await assertCurrentUser(safeUserId);

  const summaries: Record<string, SnapshotSocialSummary> = {};
  for (const id of ids) {
    summaries[id] = { likeCount: 0, commentCount: 0, likedByMe: false };
  }

  for (const row of (likesResult.data ?? []) as LikeRow[]) {
    const summary = summaries[row.snapshot_id];
    if (!summary) continue;
    summary.likeCount += 1;
    summary.likedByMe ||= row.user_id === safeUserId;
  }

  for (const row of (commentsResult.data ?? []) as Pick<CommentRow, "snapshot_id">[]) {
    const summary = summaries[row.snapshot_id];
    if (summary) summary.commentCount += 1;
  }

  return summaries;
}

export async function setSnapshotLike(
  snapshotId: string,
  liked: boolean,
  expectedUserId: string,
): Promise<void> {
  requireSupabaseConfiguration();
  const safeSnapshotId = requireSnapshotId(snapshotId);
  const safeUserId = requireUserId(expectedUserId);
  await assertCurrentUser(safeUserId);

  const operation = liked
    ? supabase.from("snapshot_likes").upsert(
        { snapshot_id: safeSnapshotId, user_id: safeUserId },
        { onConflict: "snapshot_id,user_id", ignoreDuplicates: true },
      )
    : supabase
        .from("snapshot_likes")
        .delete()
        .eq("snapshot_id", safeSnapshotId)
        .eq("user_id", safeUserId);

  const { error } = await operation;
  if (error) throw error;
  await assertCurrentUser(safeUserId);
}

export async function addSnapshotComment(
  snapshotId: string,
  body: string,
  expectedUserId: string,
  parentCommentId?: string,
): Promise<void> {
  requireSupabaseConfiguration();
  const safeSnapshotId = requireSnapshotId(snapshotId);
  const safeUserId = requireUserId(expectedUserId);
  const safeBody = body.trim();
  if (safeBody.length < 1 || Array.from(safeBody).length > 500) {
    throw new Error("Comments must be between 1 and 500 characters.");
  }

  const safeParentId = parentCommentId ? requireUserId(parentCommentId) : null;
  await assertCurrentUser(safeUserId);

  const { error } = await supabase.from("snapshot_comments").insert({
    snapshot_id: safeSnapshotId,
    user_id: safeUserId,
    parent_comment_id: safeParentId,
    body: safeBody,
  });
  if (error) throw error;
  await assertCurrentUser(safeUserId);
}

export async function setSnapshotCommentLike(
  snapshotId: string,
  commentId: string,
  liked: boolean,
  expectedUserId: string,
): Promise<void> {
  requireSupabaseConfiguration();
  const safeSnapshotId = requireSnapshotId(snapshotId);
  const safeCommentId = requireUserId(commentId);
  const safeUserId = requireUserId(expectedUserId);
  await assertCurrentUser(safeUserId);

  const operation = liked
    ? supabase.from("snapshot_comment_likes").upsert(
        {
          snapshot_id: safeSnapshotId,
          comment_id: safeCommentId,
          user_id: safeUserId,
        },
        { onConflict: "comment_id,user_id", ignoreDuplicates: true },
      )
    : supabase
        .from("snapshot_comment_likes")
        .delete()
        .eq("comment_id", safeCommentId)
        .eq("user_id", safeUserId);

  const { error } = await operation;
  if (error) throw error;
  await assertCurrentUser(safeUserId);
}

export function subscribeSnapshotSocial(
  snapshotId: string,
  onChange: () => void,
): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  const safeSnapshotId = requireSnapshotId(snapshotId);
  let subscription = snapshotSocialSubscriptions.get(safeSnapshotId);

  if (!subscription) {
    const listeners = new Set<() => void>();
    const notify = (): void => {
      listeners.forEach((listener) => listener());
    };
    const channel = supabase
      .channel(`snapshot-social:${safeSnapshotId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshot_likes", filter: `snapshot_id=eq.${safeSnapshotId}` },
        notify,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshot_comments", filter: `snapshot_id=eq.${safeSnapshotId}` },
        notify,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshot_comment_likes", filter: `snapshot_id=eq.${safeSnapshotId}` },
        notify,
      )
      .subscribe();

    subscription = { channel, listeners };
    snapshotSocialSubscriptions.set(safeSnapshotId, subscription);
  }

  subscription.listeners.add(onChange);

  return () => {
    const current = snapshotSocialSubscriptions.get(safeSnapshotId);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size > 0) return;
    snapshotSocialSubscriptions.delete(safeSnapshotId);
    void supabase.removeChannel(current.channel);
  };
}

async function loadProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, is_verified, avatar_url")
    .in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function assertCurrentUser(expectedUserId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== expectedUserId) {
    throw new Error("The active Canal account changed. Try again for the current account.");
  }
}

function requireSnapshotId(value: string): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 160 || /[\u0000-\u001f\u007f]/u.test(cleaned)) {
    throw new Error("The Snapshot reference is invalid.");
  }
  return cleaned;
}

function requireUserId(value: string): string {
  const cleaned = value.trim();
  if (!UUID_PATTERN.test(cleaned)) throw new Error("The account reference is invalid.");
  return cleaned;
}

function cleanUuid(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}
