import type { ImagePickerAsset } from "expo-image-picker";

import { supabase } from "./supabase";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function avatarExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function profileAvatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export async function uploadProfileAvatar(
  asset: ImagePickerAsset,
  userId: string,
): Promise<{ path: string; publicUrl: string }> {
  if (asset.type && asset.type !== "image") {
    throw new Error("Choose a photo, not a video.");
  }
  if (asset.fileSize && asset.fileSize > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("Profile pictures must be 5 MB or smaller.");
  }

  const mimeType = asset.mimeType?.toLowerCase() || "image/jpeg";
  if (!ALLOWED_AVATAR_TYPES.has(mimeType)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Canal could not read that photo.");
  const body = await response.arrayBuffer();
  if (body.byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("Profile pictures must be 5 MB or smaller.");
  }

  const path = `${userId}/avatar-${Date.now()}.${avatarExtension(mimeType)}`;
  const uploaded = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(path, body, { cacheControl: "31536000", contentType: mimeType, upsert: false });
  if (uploaded.error) throw uploaded.error;

  const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeOwnedProfileAvatar(
  url: string | null | undefined,
  userId: string,
): Promise<void> {
  const path = profileAvatarPathFromUrl(url);
  if (!path || !path.startsWith(`${userId}/`)) return;
  const removed = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  if (removed.error) throw removed.error;
}
