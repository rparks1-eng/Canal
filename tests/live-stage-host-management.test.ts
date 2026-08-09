import fs from "node:fs";
import path from "node:path";

import { formatLiveStageElapsed } from "../lib/live-stages";

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app", "(tabs)", "live.tsx"), "utf8");
const managedRoute = fs.readFileSync(path.join(root, "app", "managed-stages.tsx"), "utf8");
const profileRoute = fs.readFileSync(path.join(root, "app", "(tabs)", "profile.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "lib", "live-stages.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260808190722_live_stage_host_management.sql"),
  "utf8",
);

describe("live Stage host management", () => {
  it("reports active and completed durations from the latest start boundary", () => {
    expect(formatLiveStageElapsed({
      createdAt: "2026-08-08T10:00:00.000Z",
      startedAt: "2026-08-08T12:00:00.000Z",
      status: "live",
    }, Date.parse("2026-08-08T13:17:00.000Z"))).toBe("1 hr 17 min");

    expect(formatLiveStageElapsed({
      createdAt: "2026-08-08T10:00:00.000Z",
      startedAt: "2026-08-08T12:00:00.000Z",
      endedAt: "2026-08-08T12:42:00.000Z",
      status: "ended",
    }, Date.parse("2026-08-08T15:00:00.000Z"))).toBe("42 min");
  });

  it("loads only host-owned history outside public live discovery", () => {
    expect(library).toMatch(/readHostedLiveStages[\s\S]*[.]eq\("host_id", currentUserId\)[\s\S]*[.]order\("started_at"/u);
    expect(library).toMatch(/readLiveStages[\s\S]*[.]eq\([\s\S]*"status",[\s\S]*"live"/u);
    expect(route).not.toContain("Your hosted Stages");
    expect(route).toContain('hostedStages.filter((stage) => stage.status === "live")');
    expect(route).toContain("Your live rooms");
    expect(route).not.toContain("Delete Stage");
    expect(profileRoute).toContain('router.push("/managed-stages")');
    expect(managedRoute).toContain("Live rooms first, followed by your newest ended Stages.");
    expect(managedRoute).toContain('a.status === "live" ? -1 : 1');
    expect(managedRoute).toContain("Restart");
    expect(managedRoute).toContain("Delete Stage");
  });

  it("restarts atomically with a new activity clock and preserved ownership", () => {
    expect(migration).toMatch(/add column if not exists started_at timestamptz/u);
    expect(migration).toMatch(/new[.]status = 'live'[\s\S]*old[.]status is distinct from 'live'[\s\S]*new[.]started_at = now[(][)]/u);
    expect(migration).toContain("new.ended_at = null");
    expect(migration).not.toContain("security definer");
    expect(library).toMatch(/restartLiveStage[\s\S]*currentTrackIndex: 0,[\s\S]*status: "live"/u);
  });

  it("keeps host actions accessible, offline-safe, and account-scoped", () => {
    expect(managedRoute).toContain('accessibilityLabel={`Manage ${stage.name}`}');
    expect(managedRoute).toMatch(/action:[\s\S]*minHeight: 52/u);
    expect(managedRoute).toContain('accessibilityLabel={`Delete ${stage.name}`}');
    expect(managedRoute).toContain('stage.status === "live"');
  });
});
