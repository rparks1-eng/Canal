# Canal closed-beta device smoke test

Run this checklist on a rebuilt app. Record the build identifier, device model,
operating-system version, tester, date, and any failed step in the pull request
or release record.

## Prerequisites

- Every committed Supabase migration is applied in filename order.
- Supabase allows the Canal authentication and password-reset redirect URLs.
- The build contains the public Supabase and Spotify configuration values.
- The Spotify dashboard allows the exact production redirect URI.
- Two test email accounts are available. Call them Account A and Account B.
- At least one account has a Spotify library with several saved tracks.

## Account and recovery

- [ ] Create Account A and confirm its email.
- [ ] Complete the Connect, Shape, Export onboarding.
- [ ] Log out and log back into Account A.
- [ ] Request a password reset, open the newest email, set a new password, and
      log in with it.
- [ ] Repeat password reset with Canal closed, backgrounded, and already open.
- [ ] Confirm the HTTPS reset page works when the native app cannot open.
- [ ] Confirm expired or already-used reset links show a recoverable error.

## Spotify and Scene loop

- [ ] Connect Spotify after Canal sign-in.
- [ ] Deny or cancel once and confirm Canal offers a clear retry.
- [ ] Import library data and create a Scene with mood, activity, energy,
      familiarity, duration, genre, and artist choices.
- [ ] Confirm the sync includes liked songs and tracks across the account's
      playlists, and that a stale library refreshes without blocking cached use.
- [ ] Type one letter into track search and confirm likely songs and artists appear
      immediately before live catalog results.
- [ ] Generate short and long Scenes. Confirm track count and summed track length
      align with the selected duration.
- [ ] Confirm a new Scene opens directly in playback, every visible track has artwork
      or an intentional fallback, and the player retains Home, Library, Create,
      Activity, and Profile navigation.
- [ ] Confirm Familiar favors liked and playlist music, Discovery adds genre-linked
      tracks outside the library, and selected genres change the generated mix.
- [ ] Edit the proposed track list, save the Scene, close the app, reopen it,
      and confirm the Scene remains.
- [ ] Export the Scene to Spotify and open the resulting playlist.
- [ ] Disconnect and reconnect Spotify without losing the Canal account or
      saved Scene.

## Snapshot and sharing

- [ ] Create a private Snapshot and confirm it appears only for Account A.
- [ ] Change it to public, share its link, and open the link from a fresh app
      launch.
- [ ] Edit the Snapshot and confirm the shared view updates.
- [ ] Delete the Snapshot and confirm it no longer opens.
- [ ] Turn off network access, create or edit a Snapshot, restore the network,
      and confirm synchronization completes without duplication.

## Live Stages

- [ ] Apply the Live Stages migrations to a development Supabase project and confirm
      the Live tables are absent from the `supabase_realtime` publication.
- [ ] Confirm the database Broadcast triggers deliver `stage_changed` on private
      `live-stage:<uuid>` channels, `realtime.messages` RLS authorizes access, the
      client subscribes with `private: true`, and Realtime public-channel access is
      disabled in the Supabase dashboard.
- [ ] Start public and private Stages from a saved Scene, then join each from Account B
      using discovery or its invite code as appropriate.
- [ ] Confirm participants and chat update on both devices without a manual refresh,
      and that a non-member cannot discover or read a private Stage.
- [ ] Send chat messages from both accounts and confirm empty, oversized, and
      unauthorized messages are rejected.
- [ ] Advance the queue and end the Stage as the host; confirm a listener cannot use
      host controls.
- [ ] Background, reopen, disconnect, and reconnect both devices; confirm the Stage
      recovers without duplicating participants, messages, or Snapshots.

## Account isolation

- [ ] Log out of Account A and sign in as Account B on the same device.
- [ ] Confirm Account B cannot see Account A's private Scenes or Snapshots.
- [ ] Confirm Account B can view but cannot edit Account A's public content.
- [ ] Create Account B content, switch back to Account A, and repeat the
      isolation check in the other direction.

## Platform and recovery states

- [ ] Verify all primary tabs, back navigation, deep links, keyboard behavior,
      loading states, empty states, and error-retry actions.
- [ ] Verify interactive controls have readable labels and usable touch targets
      with the platform screen reader enabled.
- [ ] Repeat the complete checklist on iOS and the Android checklist before an
      Android release.

Phase 1 passes only when every applicable box is checked and failures have a
linked issue or pull request.
