import type { ImagePickerAsset } from "expo-image-picker";

import { supabase } from "./supabase";

export const CANAL_AVATAR_PREFIX =
  "canal-avatar://";

export type CanalAvatarId =
  | "azure-bloom"
  | "rose-current"
  | "verdant-air"
  | "ember-veil"
  | "violet-fold"
  | "silver-tide"
  | "cobalt-drift"
  | "apricot-haze"
  | "lagoon-pulse"
  | "midnight-petal";

export type CanalAvatarDefinition = {
  id: CanalAvatarId;
  name: string;
  colors: readonly [
    string,
    string,
    string,
    string,
  ];
};

export const CANAL_AVATARS:
  readonly CanalAvatarDefinition[] = [
    {
      id: "azure-bloom",
      name: "Azure Bloom",
      colors: [
        "#137CBA",
        "#277DB4",
        "#73549C",
        "#D0698E",
      ],
    },
    {
      id: "rose-current",
      name: "Rose Current",
      colors: [
        "#D85F75",
        "#CE5B8C",
        "#854F9C",
        "#445B9B",
      ],
    },
    {
      id: "verdant-air",
      name: "Verdant Air",
      colors: [
        "#4DBD9D",
        "#3D9C91",
        "#397B91",
        "#596BA0",
      ],
    },
    {
      id: "ember-veil",
      name: "Ember Veil",
      colors: [
        "#EFAA55",
        "#EE7B58",
        "#CE506C",
        "#784C91",
      ],
    },
    {
      id: "violet-fold",
      name: "Violet Fold",
      colors: [
        "#7457B0",
        "#6956AD",
        "#9D538F",
        "#DC6F8D",
      ],
    },
    {
      id: "silver-tide",
      name: "Silver Tide",
      colors: [
        "#9CC9D0",
        "#729CAE",
        "#6E789E",
        "#9D7096",
      ],
    },
    {
      id: "cobalt-drift",
      name: "Cobalt Drift",
      colors: [
        "#205CA5",
        "#245899",
        "#334C8D",
        "#724C91",
      ],
    },
    {
      id: "apricot-haze",
      name: "Apricot Haze",
      colors: [
        "#E9AE64",
        "#E58C68",
        "#D26D77",
        "#94598D",
      ],
    },
    {
      id: "lagoon-pulse",
      name: "Lagoon Pulse",
      colors: [
        "#35B3AD",
        "#328FA5",
        "#3C79A0",
        "#695995",
      ],
    },
    {
      id: "midnight-petal",
      name: "Midnight Petal",
      colors: [
        "#173F69",
        "#263F73",
        "#493F77",
        "#884965",
      ],
    },
  ];

const CANAL_AVATAR_IDS =
  new Set<CanalAvatarId>(
    CANAL_AVATARS.map(
      (avatar) =>
        avatar.id,
    ),
  );

export function canalAvatarUrl(
  id: CanalAvatarId,
): string {
  return `${CANAL_AVATAR_PREFIX}${id}`;
}

export function parseCanalAvatarId(
  value: string | null | undefined,
): CanalAvatarId | null {
  if (
    !value?.startsWith(
      CANAL_AVATAR_PREFIX,
    )
  ) {
    return null;
  }

  const id = value.slice(
    CANAL_AVATAR_PREFIX.length,
  ) as CanalAvatarId;

  return CANAL_AVATAR_IDS.has(
    id,
  )
    ? id
    : null;
}

async function currentUserId(): Promise<string> {
  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(
      "Your Canal account session expired.",
    );
  }

  return user.id;
}

async function assertUser(
  expectedUserId: string,
): Promise<void> {
  const nextUserId =
    await currentUserId();

  if (
    nextUserId !==
    expectedUserId
  ) {
    throw new Error(
      "Your Canal account changed before the profile picture could be saved.",
    );
  }
}

async function persistAvatarUrl(
  userId: string,
  avatarUrl: string,
): Promise<string> {
  await assertUser(
    userId,
  );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "profiles",
      )
      .update({
        avatar_url:
          avatarUrl,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        userId,
      )
      .select(
        "avatar_url",
      )
      .single();

  if (error) {
    throw error;
  }

  await assertUser(
    userId,
  );

  if (
    data.avatar_url !==
    avatarUrl
  ) {
    throw new Error(
      "Canal could not confirm the saved profile picture.",
    );
  }

  return avatarUrl;
}

export async function saveCanalAvatar(
  id: CanalAvatarId,
): Promise<string> {
  if (
    !CANAL_AVATAR_IDS.has(
      id,
    )
  ) {
    throw new Error(
      "Choose a valid Canal profile picture.",
    );
  }

  const userId =
    await currentUserId();

  return persistAvatarUrl(
    userId,
    canalAvatarUrl(
      id,
    ),
  );
}

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
