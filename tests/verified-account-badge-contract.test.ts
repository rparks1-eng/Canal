import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("verified music account badge", () => {
  it("uses the project-local transparent asset beside verified account names", () => {
    const badge = fs.readFileSync(path.join(root, "components", "verified-account-badge.tsx"), "utf8");
    const profile = fs.readFileSync(path.join(root, "app", "(tabs)", "profile.tsx"), "utf8");
    const explore = fs.readFileSync(path.join(root, "app", "(tabs)", "live.tsx"), "utf8");
    expect(fs.existsSync(path.join(root, "assets", "badges", "verified-music.png"))).toBe(true);
    expect(badge).toContain("Verified music account");
    expect(profile).toContain("displayProfile.isVerified ? <VerifiedAccountBadge");
    expect(explore).toContain("props.stage.hostIsVerified ? <VerifiedAccountBadge");
  });
});
