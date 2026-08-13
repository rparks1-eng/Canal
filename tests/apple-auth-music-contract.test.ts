import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Apple account and music integration", () => {
  it("uses native Sign in with Apple on iOS and preserves web OAuth", () => {
    const auth = read("lib/canal-auth.ts");
    const login = read("app/login.tsx");

    expect(auth).toContain('provider === "apple"');
    expect(auth).toContain('Platform.OS === "ios"');
    expect(auth).toContain("AppleAuthentication.signInAsync");
    expect(auth).toContain('Platform.OS === "web"');
    expect(auth).toContain("supabase.auth.signInWithOAuth");
    expect(auth).toContain("return null");
    expect(login).toContain("if (!session)");
    expect(auth).toContain("Crypto.CryptoDigestAlgorithm.SHA256");
    expect(auth).toContain("supabase.auth.signInWithIdToken");
    expect(auth).toContain('provider: "apple"');
    expect(auth).toContain("credential.identityToken");
    expect(auth).toContain("supabase.auth.signInWithOAuth");
    expect(auth).toContain("full_name");
  });

  it("declares the required Apple capabilities and purpose strings", () => {
    const config = JSON.parse(read("app.json"));
    const entitlements = read("ios/Canal/Canal.entitlements");
    const info = read("ios/Canal/Info.plist");

    expect(config.expo.ios.usesAppleSignIn).toBe(true);
    expect(config.expo.plugins).toContain("expo-apple-authentication");
    expect(config.expo.ios.infoPlist.NSAppleMusicUsageDescription).toContain(
      "Apple Music",
    );
    expect(entitlements).toContain("com.apple.developer.applesignin");
    expect(entitlements).toContain("Default");
    expect(info).toContain("NSAppleMusicUsageDescription");
  });

  it("uses MusicKit automatic token management without shipping a private key", () => {
    const swift = read(
      "modules/canal-apple-music/ios/CanalAppleMusicModule.swift",
    );
    const podspec = read(
      "modules/canal-apple-music/ios/CanalAppleMusic.podspec",
    );

    expect(swift).toContain("MusicAuthorization.request()");
    expect(swift).toContain("MusicSubscription.current");
    expect(swift).toContain("MusicCatalogSearchRequest");
    expect(swift).toContain("MusicLibraryRequest<Song>");
    expect(swift).toContain("MusicLibraryRequest<Album>");
    expect(swift).toContain("MusicLibraryRequest<Artist>");
    expect(swift).toContain("MusicRecentlyPlayedRequest<Song>");
    expect(swift).toContain("playlist.with(");
    expect(swift).toContain("preferredSource: .library");
    expect(swift).toContain("collection.nextBatch(");
    expect(swift).toContain("withTaskGroup(");
    expect(swift).toContain('"playlistTracks":');
    expect(swift).toContain('"playlistTracksTruncated":');
    expect(swift).toContain('"albumsTruncated":');
    expect(swift).toContain('"artistsTruncated":');
    expect(swift).toContain("libraryAddedDate");
    expect(swift).toContain("lastPlayedDate");
    expect(swift).toContain("playCount");
    expect(swift).toContain("MusicLibrary.shared.createPlaylist");
    expect(podspec).toContain("MusicKit");
    expect(swift).not.toMatch(/developerToken|privateKey|AuthKey_/u);
  });

  it("normalizes bounded Apple playlist tracks and reports every truncated library window", () => {
    const nativeTypes = read("modules/canal-apple-music/index.ts");
    const library = read("lib/apple-music.ts");

    expect(nativeTypes).toContain("playlistTracks?: CanalAppleMusicTrack[]");
    expect(nativeTypes).toContain("playlistTracksTruncated?: boolean");
    expect(nativeTypes).toContain("albumsTruncated?: boolean");
    expect(nativeTypes).toContain("artistsTruncated?: boolean");
    expect(library).toContain("(library.playlistTracks ?? []).map(normalizeAppleMusicTrack)");
    expect(library).toContain("playlistTracks,");
    expect(library).toContain("library.playlistTracksTruncated");
    expect(library).toContain("library.albumsTruncated");
    expect(library).toContain("library.artistsTruncated");
    expect(library).not.toContain("playlistTracks: [],");
  });

  it("lets either connected service power creation and combines both when available", () => {
    const studio = read("app/scene-studio.tsx");
    const preview = read("app/scene-preview.tsx");
    const combined = read("lib/combined-music-library.ts");

    expect(studio).toContain("readCombinedSceneMusicLibrary");
    expect(studio).toContain("readyProviderIds.length === 0");
    expect(studio).toContain("addUserSelectedGenreCatalogTracksFromProviders");
    expect(preview).toContain("readCombinedSceneMusicLibrary");
    expect(preview).toContain("Sync Spotify or Apple Music");
    expect(combined).toContain("applyAppleArtwork");
    expect(combined).toContain('"apple-music" as const');
  });

  it("registers Apple Music and scopes its cache to an exact Canal session", () => {
    const services = read("lib/music-services.ts");
    const storage = read("lib/apple-music.ts");

    expect(services).toContain("appleMusicProvider");
    expect(storage).toContain("captureCanalAccountSessionGuard");
    expect(storage).toContain("assertCanalAccountSessionGuardCurrent");
    expect(storage).toContain("ownerId: guard.userId");
    expect(storage).toContain("sessionGeneration: guard.sessionGeneration");
    expect(storage).toContain("previous === null");
    expect(storage).toContain("AsyncStorage.removeItem(key)");
  });

  it("offers Apple Music connection, sync, and Scene export without removing Spotify", () => {
    const connect = read("app/connect-music.tsx");
    const settings = read("app/music-services.tsx");
    const detail = read("app/scenes/[sceneId].tsx");
    const publicScene = read("app/public-scene.tsx");

    expect(connect).toContain("Connect Apple Music");
    expect(connect).toContain("Connect Spotify");
    expect(settings).toContain("Sync Apple Music Library");
    expect(settings).toContain("Sync Spotify Library");
    expect(detail).toContain('"apple-music"');
    expect(detail).toContain('"spotify"');
    expect(publicScene).toContain('"apple-music"');
    expect(publicScene).toContain('label="Export"');
  });
});
