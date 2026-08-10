import fs from "node:fs";
import path from "node:path";

import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  consumeDeferredDestination,
  rememberDeferredDestination,
  restoreDeferredDestination,
} from "../lib/deferred-destination";

import {
  parsePublicDestination,
  publicDestinationFromRoute,
} from "../lib/public-linking";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const SCENE_SHARE_ID =
  "550e8400-e29b-41d4-a716-446655440000";
const SNAPSHOT_SHARE_ID =
  "a987fbc9-4bed-4078-8f07-9141ba07c9f3";
const STAGE_ID =
  "123e4567-e89b-42d3-a456-426614174000";
const INVITE_TOKEN = "A".repeat(43);

describe("public link end-to-end contract", () => {
  afterEach(() => {
    mockStorage.clear();
  });

  it("keeps exact canonical previews visible before authentication", () => {
    expect(publicDestinationFromRoute("scenes", {
      sceneId: SCENE_SHARE_ID,
    })).toBe(`/scenes/${SCENE_SHARE_ID}`);
    expect(publicDestinationFromRoute("snapshots", {
      snapshotId: SNAPSHOT_SHARE_ID,
    })).toBe(`/snapshots/${SNAPSHOT_SHARE_ID}`);
    expect(publicDestinationFromRoute("stages", {
      invite: INVITE_TOKEN,
      stageId: STAGE_ID,
    })).toBe(`/stages/${STAGE_ID}/join?invite=${INVITE_TOKEN}`);

    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(
      /if \(deferredDestination\) \{\s*return;\s*\}/u,
    );
    expect(read("app/+native-intent.ts")).toMatch(
      /if \(destination\) \{\s*return destination;\s*\}/u,
    );
  });

  it("persists the exact CTA destination through auth, onboarding, and Spotify before consuming once", async () => {
    const destination =
      `/stages/${STAGE_ID}/join?invite=${INVITE_TOKEN}` as const;

    const actions = read(
      "components/public-preview/public-preview-actions.tsx",
    );
    expect(actions).toMatch(
      /await rememberDeferredDestination\(destination\)/u,
    );
    expect(actions).toMatch(
      /pathname: "\/login", params: \{ mode \}/u,
    );

    await rememberDeferredDestination(destination);

    expect(read("app/auth/callback.tsx")).not.toContain(
      "consumeDeferredDestination",
    );
    expect(read("app/onboarding.tsx")).not.toContain(
      "consumeDeferredDestination",
    );
    expect(read("app/connect-music.tsx")).not.toContain(
      "consumeDeferredDestination",
    );
    expect(read("app/spotify-callback.tsx")).not.toContain(
      "consumeDeferredDestination",
    );

    await expect(consumeDeferredDestination()).resolves.toBe(
      destination,
    );
    await expect(consumeDeferredDestination()).resolves.toBeNull();
  });

  it("resolves public share UUIDs for both signed-out previews and signed-in returns", () => {
    const scene = read("app/scenes/[sceneId].tsx");
    const snapshot = read("app/snapshots/[snapshotId].tsx");

    expect(scene).toMatch(
      /getSceneById\(sceneId\)[\s\S]*internalScene \? <SceneDetailContent \/> : <PublicScenePreview publicShareId=\{sceneId\}/u,
    );
    expect(scene).toMatch(
      /getPublicSceneLinkPreview\(publicShareId\)/u,
    );
    expect(snapshot).toMatch(
      /readSnapshotWithStatus\(snapshotId\)[\s\S]*internalSnapshot[\s\S]*<PublicSnapshotPreview signedIn=\{signedIn\} snapshotId=\{snapshotId\}/u,
    );
    expect(snapshot).toMatch(
      /getPublicSnapshotLinkPreview\(snapshotId\)/u,
    );
  });

  it("redeems only the exact Stage path, token, Stage identity, and bounded role", () => {
    const route = read("app/stages/[stageId]/join.tsx");
    const client = read("lib/stage-invite-tokens.ts");
    const migration = read(
      "supabase/migrations/20260809234903_public_link_onboarding.sql",
    );

    expect(parsePublicDestination(
      `/stages/${STAGE_ID}/join?invite=${INVITE_TOKEN}`,
    )).toBe(`/stages/${STAGE_ID}/join?invite=${INVITE_TOKEN}`);
    expect(parsePublicDestination(
      `/stages/${STAGE_ID}/join?invite=${"B".repeat(42)}`,
    )).toBeNull();
    expect(route).toContain(
      "redeemStageInviteToken(stageId, invite)",
    );
    expect(client).toMatch(
      /(?:result[.]stageId|redeemedStageId) !== stageId/u,
    );
    expect(client).toMatch(
      /value === "listener"[\s\S]*value === "member"[\s\S]*value === "collaborator"[\s\S]*[?] value[\s\S]*: null/u,
    );
    expect(migration).toContain(
      "grant_role in ('listener', 'member', 'collaborator')",
    );
  });

  it("fails private, missing, revoked, and expired resources closed", () => {
    const previews = read("lib/public-link-previews.ts");
    const states = read(
      "components/public-preview/public-preview-state.tsx",
    );
    const stage = read("app/stages/[stageId]/join.tsx");
    const migration = read(
      "supabase/migrations/20260809234903_public_link_onboarding.sql",
    );

    expect(previews).toContain("return normalizePreview(data)");
    expect(states).toContain('"not-found"');
    expect(states).toContain('"private"');
    expect(states).toContain('"expired"');
    expect(stage).toMatch(
      /catch \(error\) \{\s*setExpired\(true\)/u,
    );
    expect(migration).toContain(
      "invite_row.revoked_at is not null",
    );
    expect(migration).toContain(
      "invite_row.expires_at <= timezone('utc', now())",
    );
    expect(migration).toContain(
      "coalesce(scene.payload ->> 'visibility', 'private') = 'public'",
    );
    expect(migration).toContain(
      "snapshot.visibility = 'public'",
    );
  });

  it("restores a claimed destination on account switch without navigating the next account", async () => {
    const destination =
      `/snapshots/${SNAPSHOT_SHARE_ID}` as const;
    await rememberDeferredDestination(destination);
    const claimed = await consumeDeferredDestination();
    expect(claimed).toBe(destination);
    await restoreDeferredDestination(claimed!);
    await expect(consumeDeferredDestination()).resolves.toBe(
      destination,
    );

    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(
      /activeUserIdRef[.]current !==\s*expectedUserId[\s\S]*restoreDeferredDestination\([\s\S]*return;/u,
    );
  });

  it("shares finished Snapshot media together with its canonical public URL", () => {
    const snapshot = read("app/snapshots/[snapshotId].tsx");
    const production = read("lib/snapshot-media-production.ts");

    expect(snapshot).toMatch(
      /getOrCreatePublicSnapshotShareId\(snapshot[.]id\)[\s\S]*shareFinishedSnapshot\(\{[\s\S]*canonicalUrl:[\s\S]*canalCanonicalUrl\(`\/snapshots\/\$\{encodeURIComponent\(publicShareId\)\}`\)/u,
    );
    expect(production).toMatch(
      /Sharing[.]shareAsync\(result[.]uri,[\s\S]*mimeType: "video\/mp4"[\s\S]*await presentSnapshotCanonicalLink\(input[.]canonicalUrl, input[.]dialogTitle\)/u,
    );
    expect(production).toMatch(
      /presentSnapshotCanonicalLink[\s\S]*Share[.]share\(\{[\s\S]*message: canonicalUrl,[\s\S]*url: canonicalUrl/u,
    );
  });
});
