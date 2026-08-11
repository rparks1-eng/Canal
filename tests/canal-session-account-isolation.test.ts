import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mockAsyncStorage, mockStorage } from "./helpers/async-storage-mock";

type Session = { access_token: string; user: { id: string } };
type SessionResult = { data: { session: Session }; error: null };
type AuthGlobal = typeof globalThis & { __canalSessionAuthListener?: (event: string, session: Session | null) => void };
const mockGetSession = jest.fn<() => Promise<SessionResult>>();

jest.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: () => mockGetSession(),
    onAuthStateChange: (listener: AuthGlobal["__canalSessionAuthListener"]) => {
      (globalThis as AuthGlobal).__canalSessionAuthListener = listener;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    },
  } },
}));

const session = (id: string): SessionResult => ({ data: { session: { access_token: `token-${id}`, user: { id } } }, error: null });
const { readAccountOwnedSoundscapeHistory, readListeningHistory, recordListeningHistory } = jest.requireActual("../lib/canal-session") as typeof import("../lib/canal-session");

describe("account-scoped Soundscape history", () => {
  beforeEach(() => {
    mockStorage.clear();
    mockAsyncStorage.getItem.mockClear();
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.removeItem.mockClear();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(session("user-a"));
  });

  it("quarantines ambiguous legacy rows instead of claiming them", async () => {
    mockStorage.set("@canal/listening-history", JSON.stringify([{ id: "legacy" }]));
    await expect(readListeningHistory()).resolves.toEqual([]);
    expect(mockStorage.has("@canal/listening-history")).toBe(false);
    expect(mockStorage.get("@canal/quarantine/listening-history/legacy-v1")).toContain("legacy");
  });

  it("isolates account A history from account B", async () => {
    await recordListeningHistory({ sceneId: "scene-a", sceneName: "A", startedAt: "2026-08-11T10:00:00.000Z", tracksPlayed: 4, durationSeconds: 900 });
    mockGetSession.mockResolvedValue(session("user-b"));
    await expect(readListeningHistory()).resolves.toEqual([]);
    mockGetSession.mockResolvedValue(session("user-a"));
    await expect(readAccountOwnedSoundscapeHistory("user-a")).resolves.toMatchObject({ listening: [{ ownerId: "user-a", sceneId: "scene-a" }] });
  });

  it("rejects A to B to A session transitions", async () => {
    mockAsyncStorage.getItem.mockImplementationOnce(async () => {
      (globalThis as AuthGlobal).__canalSessionAuthListener?.("SIGNED_IN", session("user-b").data.session);
      (globalThis as AuthGlobal).__canalSessionAuthListener?.("SIGNED_IN", session("user-a").data.session);
      return null;
    });
    await expect(recordListeningHistory({ sceneId: "unsafe", sceneName: "Unsafe", startedAt: "2026-08-11T10:00:00.000Z", tracksPlayed: 1, durationSeconds: 20 })).rejects.toMatchObject({ code: "CANAL_SESSION_ACCOUNT_CHANGED" });
  });
});
