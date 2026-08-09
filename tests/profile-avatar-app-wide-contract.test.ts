import { readFileSync } from "node:fs";

import { describe, expect, it } from "@jest/globals";

function source(path: string): string {
  return readFileSync(require.resolve(path), "utf8");
}

describe("app-wide profile avatar contract", () => {
  it("renders every data-backed profile image through one circular avatar", () => {
    const avatar = source("../components/profile-avatar");

    expect(avatar).toContain('import { Image } from "expo-image"');
    expect(avatar).toContain("borderRadius: dimension / 2");
    expect(avatar).toContain('contentFit="cover"');
    expect(avatar).toContain("overflow: \"hidden\"");

    for (const route of [
      "../app/(tabs)/profile",
      "../app/(tabs)/explore",
      "../components/PublicSnapshotCard",
      "../app/friends",
      "../app/following",
      "../app/creator/[userId]",
      "../app/stage-invite-collaborators",
      "../app/live-stage/[stageId]",
      "../app/stage-lobby/[stageId]",
      "../app/(tabs)/live",
      "../app/public-scene",
      "../app/snapshots/[snapshotId]",
      "../components/activity-screen",
      "../app/releases/[releaseId]",
    ]) {
      const routeSource = source(route);
      expect(routeSource).toContain("<ProfileAvatar");
      expect(routeSource).toContain("avatarUrl={");
      expect(routeSource).toContain("displayName={");
    }

    const profileRoute = source("../app/(tabs)/profile");
    expect(profileRoute).not.toContain("styles.avatarFrame");

    const publicSnapshots = source("../lib/public-snapshots");
    expect(publicSnapshots).toContain("avatar_url");
    expect(publicSnapshots).toContain("avatarUrl:");

    const liveStages = source("../lib/live-stages");
    expect(liveStages).toContain('select("id, avatar_url")');
    expect(liveStages).toContain("hostAvatarUrl:");
    expect(liveStages).toContain("message.avatarUrl =");

    const snapshotSocial = source("../lib/snapshot-social");
    expect(snapshotSocial).toContain("is_verified, avatar_url");

    const activity = source("../lib/relationships");
    expect(activity).toContain("hydrateActivityAvatars");

    const stageCollaboration = source("../lib/stage-collaboration");
    expect(stageCollaboration).toContain('.select("id, avatar_url")');
  });
});
