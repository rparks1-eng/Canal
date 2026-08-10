import fs from "node:fs";
import path from "node:path";

describe("signed-out public preview auth guard", () => {
  const root = path.resolve(__dirname, "..");
  const layout = fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
  const nativeIntent = fs.readFileSync(path.join(root, "app/+native-intent.ts"), "utf8");

  it("leaves an exact allowlisted preview mounted before authentication", () => {
    expect(layout).toMatch(
      /const deferredDestination\s*=\s*publicDestinationFromRoute[\s\S]*if \(deferredDestination\) \{\s*return;\s*\}/u,
    );
    expect(nativeIntent).toMatch(
      /if \(destination\) \{\s*return destination;\s*\}/u,
    );
    expect(nativeIntent).not.toContain('return "/login"');
  });

  it("retains the normal Login guard for every non-public route", () => {
    expect(layout).toMatch(
      /if \(\s*!session &&\s*!isAccountRoute\s*\)[\s\S]*if \(deferredDestination\)[\s\S]*router[.]replace\(\s*"\/login" as never/u,
    );
  });
});
