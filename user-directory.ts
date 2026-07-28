import {
  CANAL_USERS,
  CanalUser,
} from "./mock-data";

export type DirectoryUser =
  CanalUser;

export function getDirectoryUsers(): DirectoryUser[] {
  return [...CANAL_USERS].sort(
    (first, second) =>
      first.displayName.localeCompare(
        second.displayName,
      ),
  );
}

export function getDirectoryUser(
  username: string,
): DirectoryUser | null {
  const normalizedUsername =
    normalizeUsername(username);

  return (
    CANAL_USERS.find(
      (user) =>
        user.username ===
        normalizedUsername,
    ) ?? null
  );
}

function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}