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
      "../app/friends",
      "../app/following",
      "../app/creator/[userId]",
      "../app/stage-invite-collaborators",
      "../app/releases/[releaseId]",
    ]) {
      const routeSource = source(route);
      expect(routeSource).toContain("<ProfileAvatar");
      expect(routeSource).toContain("avatarUrl={");
      expect(routeSource).toContain("displayName={");
    }
  });
});
