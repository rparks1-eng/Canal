import AsyncStorage from "@react-native-async-storage/async-storage";

import { isSupabaseConfigured, supabase } from "./supabase";

export type ListeningHistoryEntry = {
  id: string;
  ownerId: string;
  sceneId: string;
  sceneName: string;
  startedAt: string;
  completedAt?: string;
  tracksPlayed: number;
  durationSeconds: number;
};

export type SceneFeedbackRating =
  | "perfect"
  | "too-calm"
  | "too-intense"
  | "too-familiar"
  | "too-unfamiliar"
  | "wrong-mood"
  | "wrong-artists"
  | "too-repetitive";

export type SceneFeedbackEntry = {
  id: string;
  ownerId: string;
  sceneId: string;
  sceneName: string;
  rating: SceneFeedbackRating;
  note: string;
  createdAt: string;
};

export type SharedSnapshot = {
  id: string;
  sceneId: string;
  sceneName: string;
  activity: string;
  mood: string;
  caption: string;
  trackCount: number;
  artists: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
};

export type LocalProfile = {
  displayName: string;
  handle: string;
  bio: string;
  favoriteActivities: string;
  createdAt: string;
  updatedAt: string;
};

const HISTORY_KEY =
  "@canal/listening-history";

const FEEDBACK_KEY =
  "@canal/scene-feedback";

const HISTORY_ACCOUNT_KEY_PREFIX = `${HISTORY_KEY}:user:`;
const FEEDBACK_ACCOUNT_KEY_PREFIX = `${FEEDBACK_KEY}:user:`;
const LEGACY_HISTORY_QUARANTINE_KEY = "@canal/quarantine/listening-history/legacy-v1";
const LEGACY_FEEDBACK_QUARANTINE_KEY = "@canal/quarantine/scene-feedback/legacy-v1";
const LOCAL_SESSION_OWNER_ID = "local-anonymous";

const FEED_KEY =
  "@canal/local-feed";

const PROFILE_KEY =
  "@canal/local-profile";

function createId(
  prefix: string,
): string {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

type SessionIdentity = { ownerId: string; sessionFingerprint: string; accountGeneration: number };
let sessionAccountGeneration = 0;
let observedSessionFingerprint: string | null = null;

function observeSessionFingerprint(fingerprint: string): void {
  if (observedSessionFingerprint !== null && observedSessionFingerprint !== fingerprint) sessionAccountGeneration += 1;
  observedSessionFingerprint = fingerprint;
}

if (isSupabaseConfigured && typeof supabase.auth.onAuthStateChange === "function") {
  supabase.auth.onAuthStateChange((_event, session) => {
    observeSessionFingerprint(session ? `${session.user.id}:${session.access_token}` : LOCAL_SESSION_OWNER_ID);
  });
}

function sessionAccountChangedError(): Error {
  return Object.assign(new Error("The active Canal account changed while listening history was being updated. Try again."), { code: "CANAL_SESSION_ACCOUNT_CHANGED" });
}

async function captureSessionIdentity(): Promise<SessionIdentity> {
  if (!isSupabaseConfigured) return { ownerId: LOCAL_SESSION_OWNER_ID, sessionFingerprint: LOCAL_SESSION_OWNER_ID, accountGeneration: sessionAccountGeneration };
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  const sessionFingerprint = session ? `${session.user.id}:${session.access_token}` : LOCAL_SESSION_OWNER_ID;
  observeSessionFingerprint(sessionFingerprint);
  return { ownerId: session?.user.id ?? LOCAL_SESSION_OWNER_ID, sessionFingerprint, accountGeneration: sessionAccountGeneration };
}

async function assertSessionIdentity(expected: SessionIdentity): Promise<void> {
  const current = await captureSessionIdentity();
  if (current.ownerId !== expected.ownerId || current.sessionFingerprint !== expected.sessionFingerprint || current.accountGeneration !== expected.accountGeneration) throw sessionAccountChangedError();
}

function accountKey(prefix: string, ownerId: string): string { return `${prefix}${ownerId}`; }

async function quarantineLegacySessionStores(): Promise<void> {
  const [legacyHistory, legacyFeedback] = await Promise.all([AsyncStorage.getItem(HISTORY_KEY), AsyncStorage.getItem(FEEDBACK_KEY)]);
  if (legacyHistory) {
    if (!await AsyncStorage.getItem(LEGACY_HISTORY_QUARANTINE_KEY)) await AsyncStorage.setItem(LEGACY_HISTORY_QUARANTINE_KEY, legacyHistory);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }
  if (legacyFeedback) {
    if (!await AsyncStorage.getItem(LEGACY_FEEDBACK_QUARANTINE_KEY)) await AsyncStorage.setItem(LEGACY_FEEDBACK_QUARANTINE_KEY, legacyFeedback);
    await AsyncStorage.removeItem(FEEDBACK_KEY);
  }
}

function ownedEntries<T extends { ownerId: string }>(entries: T[], ownerId: string): T[] { return entries.filter((entry) => entry.ownerId === ownerId); }

async function readArray<T>(
  key: string,
): Promise<T[]> {
  const serialized =
    await AsyncStorage.getItem(key);

  if (!serialized) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(serialized);

    return Array.isArray(parsed)
      ? (parsed as T[])
      : [];
  } catch {
    return [];
  }
}

async function writeArray<T>(
  key: string,
  values: T[],
): Promise<void> {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(values),
  );
}

export async function readListeningHistory(): Promise<
  ListeningHistoryEntry[]
> {
  const identity = await captureSessionIdentity();
  await quarantineLegacySessionStores();
  await assertSessionIdentity(identity);
  const history = await readArray<ListeningHistoryEntry>(accountKey(HISTORY_ACCOUNT_KEY_PREFIX, identity.ownerId));
  await assertSessionIdentity(identity);

  return ownedEntries(history, identity.ownerId).sort(
    (first, second) =>
      new Date(
        second.completedAt ??
          second.startedAt,
      ).getTime() -
      new Date(
        first.completedAt ??
          first.startedAt,
      ).getTime(),
  );
}

export async function recordListeningHistory(
  input: Omit<
    ListeningHistoryEntry,
    "id" | "ownerId"
  >,
): Promise<ListeningHistoryEntry> {
  const identity = await captureSessionIdentity();
  await quarantineLegacySessionStores();
  await assertSessionIdentity(identity);
  const entry: ListeningHistoryEntry = {
    ...input,

    id:
      createId("history"),
    ownerId: identity.ownerId,
  };

  const key = accountKey(HISTORY_ACCOUNT_KEY_PREFIX, identity.ownerId);
  const history = ownedEntries(await readArray<ListeningHistoryEntry>(key), identity.ownerId);
  await assertSessionIdentity(identity);

  await writeArray(
    key,
    [entry, ...history].slice(
      0,
      100,
    ),
  );
  try { await assertSessionIdentity(identity); } catch (error) { await writeArray(key, history); throw error; }

  return entry;
}

export async function clearListeningHistory(): Promise<void> {
  const identity = await captureSessionIdentity();
  await AsyncStorage.removeItem(accountKey(HISTORY_ACCOUNT_KEY_PREFIX, identity.ownerId));
  await assertSessionIdentity(identity);
}

export async function readFeedbackEntries(): Promise<
  SceneFeedbackEntry[]
> {
  const identity = await captureSessionIdentity();
  await quarantineLegacySessionStores();
  await assertSessionIdentity(identity);
  const entries = await readArray<SceneFeedbackEntry>(accountKey(FEEDBACK_ACCOUNT_KEY_PREFIX, identity.ownerId));
  await assertSessionIdentity(identity);
  return ownedEntries(entries, identity.ownerId);
}

export async function addFeedbackEntry(
  input: Omit<
    SceneFeedbackEntry,
    "id" | "ownerId" | "createdAt"
  >,
): Promise<SceneFeedbackEntry> {
  const identity = await captureSessionIdentity();
  await quarantineLegacySessionStores();
  await assertSessionIdentity(identity);
  const entry: SceneFeedbackEntry = {
    ...input,

    id:
      createId("feedback"),
    ownerId: identity.ownerId,

    createdAt:
      new Date().toISOString(),
  };

  const key = accountKey(FEEDBACK_ACCOUNT_KEY_PREFIX, identity.ownerId);
  const entries = ownedEntries(await readArray<SceneFeedbackEntry>(key), identity.ownerId);
  await assertSessionIdentity(identity);

  await writeArray(
    key,
    [entry, ...entries].slice(
      0,
      200,
    ),
  );
  try { await assertSessionIdentity(identity); } catch (error) { await writeArray(key, entries); throw error; }

  return entry;
}

export async function readAccountOwnedSoundscapeHistory(expectedUserId: string): Promise<{ listening: ListeningHistoryEntry[]; feedback: SceneFeedbackEntry[] }> {
  const identity = await captureSessionIdentity();
  if (identity.ownerId !== expectedUserId || identity.ownerId === LOCAL_SESSION_OWNER_ID) throw sessionAccountChangedError();
  const [listening, feedback] = await Promise.all([
    readArray<ListeningHistoryEntry>(accountKey(HISTORY_ACCOUNT_KEY_PREFIX, identity.ownerId)),
    readArray<SceneFeedbackEntry>(accountKey(FEEDBACK_ACCOUNT_KEY_PREFIX, identity.ownerId)),
  ]);
  await assertSessionIdentity(identity);
  return { listening: ownedEntries(listening, identity.ownerId), feedback: ownedEntries(feedback, identity.ownerId) };
}

export async function readSharedSnapshots(): Promise<
  SharedSnapshot[]
> {
  const snapshots =
    await readArray<SharedSnapshot>(
      FEED_KEY,
    );

  return snapshots.sort(
    (first, second) =>
      new Date(
        second.createdAt,
      ).getTime() -
      new Date(
        first.createdAt,
      ).getTime(),
  );
}

export async function publishSnapshot(
  input: Omit<
    SharedSnapshot,
    | "id"
    | "createdAt"
    | "likes"
    | "likedByMe"
  >,
): Promise<SharedSnapshot> {
  const snapshot: SharedSnapshot = {
    ...input,

    id:
      createId("snapshot"),

    createdAt:
      new Date().toISOString(),

    likes: 0,
    likedByMe: false,
  };

  const snapshots =
    await readSharedSnapshots();

  await writeArray(
    FEED_KEY,
    [snapshot, ...snapshots].slice(
      0,
      100,
    ),
  );

  return snapshot;
}

export async function toggleSnapshotLike(
  snapshotId: string,
): Promise<SharedSnapshot | null> {
  const snapshots =
    await readSharedSnapshots();

  const index =
    snapshots.findIndex(
      (snapshot) =>
        snapshot.id ===
        snapshotId,
    );

  if (index < 0) {
    return null;
  }

  const current =
    snapshots[index];

  const updated: SharedSnapshot = {
    ...current,

    likedByMe:
      !current.likedByMe,

    likes:
      current.likes +
      (current.likedByMe
        ? -1
        : 1),
  };

  snapshots[index] =
    updated;

  await writeArray(
    FEED_KEY,
    snapshots,
  );

  return updated;
}

export async function readLocalProfile(): Promise<
  LocalProfile
> {
  const serialized =
    await AsyncStorage.getItem(
      PROFILE_KEY,
    );

  if (serialized) {
    try {
      const parsed =
        JSON.parse(
          serialized,
        ) as Partial<LocalProfile>;

      return {
        displayName:
          parsed.displayName ??
          "Canal Listener",

        handle:
          parsed.handle ??
          "@canaluser",

        bio:
          parsed.bio ?? "",

        favoriteActivities:
          parsed.favoriteActivities ??
          "",

        createdAt:
          parsed.createdAt ??
          new Date().toISOString(),

        updatedAt:
          parsed.updatedAt ??
          new Date().toISOString(),
      };
    } catch {
      // Use defaults.
    }
  }

  const now =
    new Date().toISOString();

  return {
    displayName:
      "Canal Listener",

    handle:
      "@canaluser",

    bio: "",

    favoriteActivities:
      "",

    createdAt: now,
    updatedAt: now,
  };
}

export async function saveLocalProfile(
  input: LocalProfile,
): Promise<LocalProfile> {
  const profile: LocalProfile = {
    ...input,

    handle:
      input.handle.startsWith("@")
        ? input.handle
        : `@${input.handle}`,

    updatedAt:
      new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    PROFILE_KEY,
    JSON.stringify(profile),
  );

  return profile;
}
