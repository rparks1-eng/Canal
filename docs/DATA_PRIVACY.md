# Canal data and privacy baseline

Canal stores account and synchronized product data in Supabase and keeps selected
working data on the current device. Clearing device data is not the same as deleting
a Canal account.

## Limited usage analytics

Limited usage analytics are off by default. A signed-in person can enable or disable
them from Settings → Data Controls.

When enabled, Canal may record only:

- completion of onboarding;
- first Scene creation;
- successful Scene export;
- successful public Snapshot publication;
- a return during the seventh day after account creation; and
- a fixed workflow failure point, bounded failure category, and initial/retry status.

An analytics row also contains a random event identifier, the authenticated account
owner, platform, schema version, and event time. It never includes passwords, email
addresses, reset or callback links, Spotify credentials, access or refresh tokens,
request URLs, raw errors, provider responses, search text, track lists, artist names,
Scene or Snapshot content, captions, Stage chat, or content identifiers.

Events waiting for delivery are stored in an account-isolated device queue for no
more than seven days. The queue is limited to 100 events per account. Supabase row
security restricts analytics rows to their authenticated owner. Rows expire after
90 days and are removed by a scheduled database retention job.

Turning analytics off immediately stops collection, removes queued events, and
requests deletion of that account's existing analytics rows. If Canal is offline,
the cloud deletion remains pending and retries after reconnection. Analytics cannot
be re-enabled until a pending deletion succeeds.

## Device data

Canal uses local storage for caches, drafts, settings, queued offline work, and music
connection state. The local JSON export intentionally excludes the legacy Spotify
session value. It is not a complete account export and can still contain personal
Canal content stored on the device.

“Clear This Device” removes local Canal data and disconnects local music credentials.
It does not delete the Canal account or most synchronized Supabase data. Cloud data
may synchronize back after signing in again.

## Cloud data

Supabase stores the Canal account and synchronized profiles, Scenes, Snapshots,
relationships, playlist export history, activity, and Live Stage data. Database row
level security and account ownership checks are the authorization boundary.

A complete cloud export and account-deletion endpoint are not yet available in the
app. They remain release gates and must be implemented through an authenticated
trusted server workflow that verifies cascades, revokes sessions, and reports
retention behavior.
