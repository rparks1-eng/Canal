import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("live Activity notifications", () => {
  it("publishes activity events to Supabase Realtime idempotently", () => {
    const migration = read("supabase/migrations/20260809065404_activity_events_realtime.sql");
    expect(migration).toContain("pg_publication_tables");
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).toContain("add table public.activity_events");
  });

  it("listens only to the current account and removes the channel", () => {
    const provider = read("providers/notification-center-provider.tsx");
    expect(provider).toContain("filter: `user_id=eq.${subscribedUserId}`");
    expect(provider).toContain("supabase.removeChannel(channel)");
    expect(provider).toContain("setUnreadCount((current) => current + 1)");
    expect(provider).toContain("showBanner({ id, title, description })");
  });

  it("shows a badge and clears it when Activity is read", () => {
    const header = read("components/canal-ui/canal-header-actions.tsx");
    const activity = read("components/activity-screen.tsx");
    expect(header).toContain("unreadCount > 0");
    expect(header).toContain("backgroundColor: \"#E43636\"");
    expect(activity).toContain("await markAllActivityRead()");
    expect(activity).toContain("clearUnreadCount()");
  });
});
