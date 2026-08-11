import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

describe("Settings overhaul contracts", () => {
  it("exposes every functional settings destination with accessible rows", () => {
    const hub = read("components/settings/settings-hub.tsx");
    const route = read("app/settings-preferences.tsx");
    for (const label of ["Appearance", "Playback & Scene generation", "Notifications", "Accessibility", "Music services", "Song DNA & learning", "Downloads & storage", "Privacy & data", "Safety & connections", "Help, feedback & about", "Session & account actions"]) {
      expect(hub).toContain(label);
    }
    expect(route).toContain("minHeight: 56");
    expect(route).toContain("Linking.openSettings()");
    expect(route).toContain("Share.share");
    expect(route).toContain("logoutAllMusicPlatforms");
    expect(route).toContain('router.push("/data-controls")');
    expect(route).toContain('router.push("/music-services")');
  });

  it("makes True Black playback and Scene defaults real consumers", () => {
    const nowPlaying = read("app/now-playing.tsx");
    const studio = read("app/scene-studio.tsx");
    expect(nowPlaying).toContain("settings.trueBlackPlayback");
    expect(nowPlaying).toContain('backgroundColor: "#000000"');
    expect(studio).toContain("settings.allowExplicitDefault");
    expect(studio).toContain("settings.smoothTransitionsDefault");
    expect(studio).toContain("settings.avoidRecentDefault");
  });

  it("applies notification, learning, dislike-window and smart-sync choices", () => {
    const activity = read("components/activity-screen.tsx");
    const learning = read("lib/scene-recommendation-feedback.ts");
    const preferences = read("lib/song-preferences.ts");
    const home = read("app/(tabs)/index.tsx");
    expect(activity).toContain("stageInviteNotifications");
    expect(activity).toContain("collaborationNotifications");
    expect(activity).toContain("socialNotifications");
    expect(learning).toContain("accountSettings.songLearningEnabled");
    expect(preferences).toContain("accountSettings.dislikeWindowDays");
    expect(home).toContain("if (smartSpotifySync) await refreshRecommendations()");
  });

  it("persists account settings behind owner-only RLS", () => {
    const migration = read("supabase/migrations/20260810222738_user_app_settings.sql");
    expect(migration).toContain("alter table public.user_app_settings enable row level security");
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("revoke all on table public.user_app_settings from public, anon");
    expect(migration).toContain("grant select, insert, update, delete on table public.user_app_settings to authenticated");
  });
});
