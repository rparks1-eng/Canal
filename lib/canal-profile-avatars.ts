import { LIVING_COVER_RECIPES } from "./living-covers";

export const CANAL_PROFILE_AVATAR_PREFIX = "canal-profile-avatar:";

export const CANAL_PROFILE_AVATARS = LIVING_COVER_RECIPES.map((recipe) => ({
  id: recipe.key,
  name: recipe.name,
  value: `${CANAL_PROFILE_AVATAR_PREFIX}${recipe.key}`,
  colors: recipe.gradient,
})) as readonly Readonly<{
  id: string;
  name: string;
  value: string;
  colors: readonly [string, string, string];
}>[];

export function canalProfileAvatarImageSource(value: string | null | undefined): string | null {
  const avatar = CANAL_PROFILE_AVATARS.find((item) => item.value === value);
  if (!avatar) return value?.trim() || null;
  const [light, middle, dark] = avatar.colors;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><radialGradient id="a" cx="25%" cy="20%" r="95%"><stop stop-color="${light}"/><stop offset=".52" stop-color="${middle}"/><stop offset="1" stop-color="${dark}"/></radialGradient><linearGradient id="b" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${dark}" stop-opacity=".08"/><stop offset=".52" stop-color="${light}" stop-opacity=".48"/><stop offset="1" stop-color="${middle}" stop-opacity=".1"/></linearGradient></defs><circle cx="128" cy="128" r="128" fill="url(#a)"/><path d="M-18 172C35 119 72 199 126 143S213 86 279 121V278H-18Z" fill="url(#b)"/><path d="M-8 91C45 52 83 114 134 72s91-42 139-7" fill="none" stroke="${light}" stroke-opacity=".18" stroke-width="34" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
