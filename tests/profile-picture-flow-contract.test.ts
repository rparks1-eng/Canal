import fs from "node:fs";
import path from "node:path";

describe("Profile picture flow", () => {
  const profile = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "profile.tsx"), "utf8");
  const sharedAvatar = fs.readFileSync(path.join(process.cwd(), "components", "profile-avatar.tsx"), "utf8");
  const presets = fs.readFileSync(path.join(process.cwd(), "lib", "canal-profile-avatars.ts"), "utf8");

  it("opens editing and makes the circular profile icon open a dedicated chooser", () => {
    expect(profile).toContain('accessibilityLabel="Edit Profile"');
    expect(profile).toContain("onPress={beginEditing}");
    expect(profile).toContain('accessibilityLabel="Change profile picture"');
    expect(profile).toContain("onPress={() => setAvatarChooserOpen(true)}");
    expect(profile).toContain('presentationStyle="pageSheet"');
    expect(profile).toContain("borderRadius: 38");
  });

  it("offers Photo Library, camera, and all ten Canal designs", () => {
    expect(profile).toContain('accessibilityLabel="Choose profile picture from library"');
    expect(profile).toContain('chooseProfilePicture("library")');
    expect(profile).toContain('accessibilityLabel="Take a profile picture"');
    expect(profile).toContain('chooseProfilePicture("camera")');
    expect(profile).toContain("CANAL_PROFILE_AVATARS.map");
    expect(presets).toContain("LIVING_COVER_RECIPES.map");
  });

  it("persists Canal designs through the app-wide avatar renderer", () => {
    expect(profile).toContain("selectCanalProfilePicture(avatar.value)");
    expect(sharedAvatar).toContain("canalProfileAvatarImageSource(avatarUrl)");
    expect(profile).toContain("originalAvatarUrlRef.current");
    expect(profile).toContain("removeOwnedProfileAvatar(previousAvatarUrl, user.id)");
  });
});
