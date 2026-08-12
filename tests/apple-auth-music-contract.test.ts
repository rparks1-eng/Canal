import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Apple account and music integration", () => {
  it("uses native Sign in with Apple on iOS and preserves web OAuth", () => {
    const auth = read("lib/canal-auth.ts");

    expect(auth).toContain('provider === "apple"');
    expect(auth).toContain('Platform.OS === "ios"');
    expect(auth).toContain("AppleAuthentication.signInAsync");
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
    expect(swift).toContain("MusicLibrary.shared.createPlaylist");
    expect(podspec).toContain("MusicKit");
    expect(swift).not.toMatch(/developerToken|privateKey|AuthKey_/u);
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
