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
    expect(login).toMatch(/socialAvailability[?][.]google !==\s*true/u);
    expect(login).toMatch(/socialAvailability[?][.]apple !==\s*true/u);
    expect(auth).toContain("WebBrowser.maybeCompleteAuthSession()");
    expect(auth).toContain("skipBrowserRedirect:");
    expect(auth).toContain("openAuthSessionAsync(");
  });

  it("keeps email sign-in and account creation independent from social-provider availability", () => {
    const login = read("app/login.tsx");
    const primaryDisabledIndex = login.indexOf(
      "disabled={\n                    isSubmitDisabled",
    );
    const primaryButtonContract = login.slice(
      Math.max(0, primaryDisabledIndex - 500),
      primaryDisabledIndex + 100,
    );

    expect(login).toContain("const isSubmitDisabled =");
    expect(primaryDisabledIndex).toBeGreaterThan(0);
    expect(login).toMatch(/const isSubmitDisabled\s*=\s*loading \|\|\s*!configured;/u);
    expect(primaryButtonContract).not.toContain("socialAvailability");
    expect(login).toContain('accessibilityLabel="Display name"');
    expect(login).toContain('accessibilityLabel="Handle"');
    expect(login).toContain('accessibilityLabel="Email"');
    expect(login).toContain('accessibilityLabel="Password"');
  });
});
