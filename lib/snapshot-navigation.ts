export type SnapshotReturnAction =
  | "back"
  | "/snapshots";

export function snapshotReturnAction(
  canGoBack: boolean,
): SnapshotReturnAction {
  return canGoBack
    ? "back"
    : "/snapshots";
}
