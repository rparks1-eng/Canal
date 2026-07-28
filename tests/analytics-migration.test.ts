import fs from "node:fs";
import path from "node:path";

describe(
  "analytics migration security contract",
  () => {
    const migrationPath =
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260728224846_analytics_events.sql",
      );

    const migration =
      fs.readFileSync(
        migrationPath,
        "utf8",
      );

    it(
      "uses an enum-only content-free event schema",
      () => {
        expect(
          migration,
        ).toMatch(
          /create table if not exists public[.]analytics_events/i,
        );

        expect(
          migration,
        ).toMatch(
          /onboarding_completed[\s\S]*first_scene_created[\s\S]*scene_export_completed[\s\S]*snapshot_published[\s\S]*seven_day_return[\s\S]*workflow_failed/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /^\s*(payload|metadata|access_token|refresh_token|password|email|scene_id|snapshot_id|track_id|url)\s+[a-z]/im,
        );

        expect(
          migration,
        ).toMatch(
          /analytics_events_shape_check[\s\S]*event_name = 'workflow_failed'[\s\S]*failure_point is not null[\s\S]*failure_class is not null/i,
        );
      },
    );

    it(
      "enables owner-only RLS with explicit Data API grants and no update access",
      () => {
        expect(
          migration,
        ).toMatch(
          /alter table public[.]analytics_events[\s\S]*enable row level security/i,
        );

        expect(
          migration,
        ).toMatch(
          /for insert[\s\S]*to authenticated[\s\S]*with check[\s\S]*auth[.]uid[(][)][\s\S]*user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /for select[\s\S]*to authenticated[\s\S]*using[\s\S]*auth[.]uid[(][)][\s\S]*user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /for delete[\s\S]*to authenticated[\s\S]*using[\s\S]*auth[.]uid[(][)][\s\S]*user_id/i,
        );

        expect(
          migration,
        ).toMatch(
          /revoke all[\s\S]*from public, anon, authenticated, service_role/i,
        );

        expect(
          migration,
        ).toMatch(
          /grant insert [(][\s\S]*client_event_id[\s\S]*user_id[\s\S]*event_name[\s\S]*occurred_at[\s\S]*[)][\s\S]*to authenticated/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /grant update|for update/i,
        );
      },
    );

    it(
      "bounds duplicates and purges expired rows after 90 days",
      () => {
        expect(
          migration,
        ).toMatch(
          /analytics_events_once_per_user_index[\s\S]*onboarding_completed[\s\S]*first_scene_created[\s\S]*seven_day_return/i,
        );

        expect(
          migration,
        ).toMatch(
          /expires_at[\s\S]*interval '90 days'/i,
        );

        expect(
          migration,
        ).toMatch(
          /occurred_at >= created_at - interval '7 days'[\s\S]*occurred_at <= created_at [+] interval '5 minutes'/i,
        );

        expect(
          migration,
        ).not.toMatch(
          /analytics_events_client_time_check[\s\S]{0,300}occurred_at >= now[(][)]/i,
        );

        expect(
          migration,
        ).toMatch(
          /cron[.]schedule[\s\S]*canal-analytics-retention[\s\S]*delete from public[.]analytics_events[\s\S]*expires_at <= now[(][)]/i,
        );
      },
    );
  },
);
