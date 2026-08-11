import fs from "node:fs";
import path from "node:path";

const read = (file: string): string =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("web account actions", () => {
  it("uses browser confirmation and only leaves Settings after verified logout", () => {
    const settings = read("app/settings-preferences.tsx");

    expect(settings).toContain('Platform.OS === "web"');
    expect(settings).toContain("globalThis as typeof globalThis");
    expect(settings).toContain("retryIncompleteAccountCleanup({ allowSignOut: true })");
    expect(settings).toContain("await logoutAllMusicPlatforms()");
    expect(settings.indexOf("if (!result.signedOut)")).toBeLessThan(
      settings.indexOf('router.replace("/login")'),
    );
    expect(settings).not.toContain("logoutAllMusicPlatforms().then(() => router.replace");
  });

  it("reflects the hosted provider configuration instead of showing false-working buttons", () => {
    const login = read("app/login.tsx");
    const auth = read("lib/canal-auth.ts");

    expect(login).toContain("readCanalSocialAuthProviderAvailability()");
    expect(login).toContain("socialProviders?.google !== true");
    expect(login).toContain("socialProviders?.apple !== true");
    expect(login).toContain("Google and Apple sign-in are not enabled");
    expect(auth).toContain("WebBrowser.maybeCompleteAuthSession()");
    expect(auth).toContain("skipBrowserRedirect:");
    expect(auth).toContain("openAuthSessionAsync(");
  });
});
