import type { ScenePlaylistExport } from "./playlist-exports";

export type PlaylistDateFilter = "today" | "week" | "month" | "all";

export function playlistMatchesDateFilter(
  playlist: Pick<ScenePlaylistExport, "createdAt">,
  filter: PlaylistDateFilter,
  now = new Date(),
): boolean {
  if (filter === "all") return true;

  const created = new Date(playlist.createdAt);
  if (!Number.isFinite(created.getTime())) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return created >= today;

  if (filter === "week") {
    const week = new Date(today);
    week.setDate(today.getDate() - today.getDay());
    return created >= week;
  }

  const month = new Date(today);
  month.setDate(today.getDate() - 30);
  return created >= month;
}
