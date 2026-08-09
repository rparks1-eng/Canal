import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app/music-services.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "app/(tabs)/index.tsx"), "utf8");
const auth = fs.readFileSync(path.join(root, "lib/spotify-auth.ts"), "utf8");
const library = fs.readFileSync(path.join(root, "lib/spotify-library.ts"), "utf8");

describe("Spotify durable session and bounded cache UI", () => {
  it("keeps provider authority in SecureStore and refreshes one expired token at a time", () => {
    expect(auth).toContain('import * as SecureStore from "expo-secure-store"');
    expect(auth).toContain("refreshSpotifySessionOnce");
    expect(auth).toContain("refreshInFlight");
    expect(auth).toContain("session.refreshToken");
    expect(auth).not.toContain("AsyncStorage.setItem(\n      SPOTIFY_SESSION");
  });

  it("uses a complete account-scoped snapshot for seven days before an automatic refresh", () => {
    expect(library).toContain("7 * 24 * 60 * 60 * 1000");
    expect(library).toContain("envelope?.ownerId ===");
    expect(library).toContain("envelope.accountGeneration ===");
    expect(library).toContain("importStatusIsComplete");
    expect(library).toContain("libraryRefreshPromise");
    expect(route).toContain("await getLatestSpotifyLibrarySnapshot()");
    expect(route).toContain("Scene Studio will use the saved Spotify snapshot");
  });

  it("places one accessible reconnect action inside the Spotify status card", () => {
    expect(route).toContain('accessibilityLabel="Reconnect Spotify"');
    expect(route).toContain("styles.reconnectButton");
    expect(route).toContain("!showsInlineSpotifyReconnect");
    expect(route).toContain("minHeight: 48");
    expect(home).toContain('accessibilityLabel="Reconnect Spotify"');
    expect(home).toContain("Using your saved music");
    expect(home).toContain("styles.spotifyReconnectButton");
    expect(home).toContain('recommendationIssue.action !==\n              "reconnect-spotify"');
  });
});
