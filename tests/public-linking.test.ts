import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_CANAL_PUBLIC_ORIGIN,
  canalPublicOrigin,
  parsePublicDestination,
  publicDestinationFromRoute,
  publicDestinationUrl,
} from "../lib/public-linking";

const SCENE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SNAPSHOT_ID = "a987fbc9-4bed-4078-8f07-9141ba07c9f3";
const STAGE_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("public Canal linking", () => {
  const previousOrigin = process.env.EXPO_PUBLIC_CANAL_WEB_URL;

  afterEach(() => {
    if (previousOrigin === undefined) {
      delete process.env.EXPO_PUBLIC_CANAL_WEB_URL;
    } else {
      process.env.EXPO_PUBLIC_CANAL_WEB_URL = previousOrigin;
    }
  });

  it("accepts only the canonical destination families", () => {
    expect(parsePublicDestination(`https://canal.app/scenes/${SCENE_ID}`))
      .toBe(`/scenes/${SCENE_ID}`);
    expect(parsePublicDestination(`canal:///snapshots/${SNAPSHOT_ID}`))
      .toBe(`/snapshots/${SNAPSHOT_ID}`);
    const invite = "A".repeat(43);
    expect(parsePublicDestination(`/stages/${STAGE_ID}/join?invite=${invite}`))
      .toBe(`/stages/${STAGE_ID}/join?invite=${invite}`);
    expect(parsePublicDestination(`/public-soundscape?ownerId=${SCENE_ID}&periodKind=year&periodKey=2026`))
      .toBe(`/public-soundscape?ownerId=${SCENE_ID}&periodKind=year&periodKey=2026`);
  });

  it("recognizes only exact public preview route state for the auth guard", () => {
    expect(publicDestinationFromRoute("scenes", { sceneId: SCENE_ID }))
      .toBe(`/scenes/${SCENE_ID}`);
    expect(publicDestinationFromRoute("snapshots", { snapshotId: SNAPSHOT_ID }))
      .toBe(`/snapshots/${SNAPSHOT_ID}`);
    expect(publicDestinationFromRoute("stages", {
      stageId: STAGE_ID,
      invite: "A".repeat(43),
    })).toBe(`/stages/${STAGE_ID}/join?invite=${"A".repeat(43)}`);
    expect(publicDestinationFromRoute("public-soundscape", {
      ownerId: SCENE_ID,
      periodKind: "season",
      periodKey: "2026-fall",
    })).toBe(`/public-soundscape?ownerId=${SCENE_ID}&periodKind=season&periodKey=2026-fall`);

    expect(publicDestinationFromRoute("settings", {})).toBeNull();
    expect(publicDestinationFromRoute("scenes", { sceneId: "private-local-id" }))
      .toBeNull();
    expect(publicDestinationFromRoute("stages", {
      stageId: STAGE_ID,
      invite: "bad/token",
    })).toBeNull();
  });

  it.each([
    "https://evil.example/scenes/550e8400-e29b-41d4-a716-446655440000",
    "https://canal.app/scenes/not-a-uuid",
    `https://canal.app/scenes/${SCENE_ID}?next=https://evil.example`,
    `https://canal.app/snapshots/${SNAPSHOT_ID}#redirect`,
    `/stages/${STAGE_ID}/join?invite=bad%2Ftoken`,
    `/stages/${STAGE_ID}/join?invite=good-token&next=/settings`,
    "javascript:alert(1)",
    `/public-soundscape?ownerId=${SCENE_ID}&periodKind=year&periodKey=2026-fall`,
    `/public-soundscape?ownerId=${SCENE_ID}&periodKind=year&periodKey=2026&next=/settings`,
  ])("rejects unsafe or non-allowlisted destination %s", (input) => {
    expect(parsePublicDestination(input)).toBeNull();
  });

  it("uses an HTTPS configurable origin and fails closed to canal.app", () => {
    expect(canalPublicOrigin()).toBe(DEFAULT_CANAL_PUBLIC_ORIGIN);

    process.env.EXPO_PUBLIC_CANAL_WEB_URL = "https://links.canal.app/path";
    expect(canalPublicOrigin()).toBe("https://links.canal.app");
    expect(publicDestinationUrl(`/scenes/${SCENE_ID}`))
      .toBe(`https://links.canal.app/scenes/${SCENE_ID}`);

    process.env.EXPO_PUBLIC_CANAL_WEB_URL = "http://canal.app";
    expect(canalPublicOrigin()).toBe(DEFAULT_CANAL_PUBLIC_ORIGIN);
  });

  it("ships iOS and Android association declarations", () => {
    const root = path.resolve(__dirname, "..");
    const appConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
    const apple = JSON.parse(fs.readFileSync(path.join(root, "public/.well-known/apple-app-site-association"), "utf8"));
    const android = JSON.parse(fs.readFileSync(path.join(root, "public/.well-known/assetlinks.json"), "utf8"));

    expect(appConfig.expo.ios.associatedDomains).toContain("applinks:canal.app");
    expect(appConfig.expo.ios.associatedDomains).toContain("applinks:canal.expo.app");
    expect(appConfig.expo.android.package).toBe("com.raishawnparks.canal");
    expect(appConfig.expo.android.intentFilters[0].autoVerify).toBe(true);
    expect(appConfig.expo.android.intentFilters[0].data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: "canal.expo.app", pathPrefix: "/scenes/" }),
        expect.objectContaining({ host: "canal.expo.app", pathPrefix: "/public-soundscape" }),
      ]),
    );
    expect(apple.applinks.details[0].components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "/": "/public-soundscape" }),
      ]),
    );
    expect(apple.applinks.details[0].appID)
      .toBe("6UBGGFVD92.com.raishawnparks.canal");
    expect(android[0].target.package_name).toBe("com.raishawnparks.canal");
  });
});
