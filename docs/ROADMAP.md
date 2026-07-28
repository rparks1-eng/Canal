# Canal product and engineering roadmap

Canal's first product wedge is a Mood and Activity Soundscape Builder.
The core loop is:

1. Connect an existing music service.
2. Shape a Scene by activity, mood, energy, familiarity, duration, and artists.
3. Refine the generated track list.
4. Save it in Canal and export it to the connected service.
5. Publish or share a vertical Snapshot that brings another listener back to Canal.

## Phase 1: reliable closed beta

- [x] Email authentication and password recovery
- [x] Spotify PKCE connection and library import
- [x] Scene Studio controls and local draft persistence
- [x] Scene generation, editing, saving, and Spotify export
- [x] Account-isolated Scene synchronization through Supabase
- [x] Public Scene discovery and saving
- [x] First-run Connect, Shape, Export onboarding
- [x] Cloud-backed public and private Snapshots
- [x] Reproducible core Supabase schema
- [x] Automated dependency, type, lint, unit, configuration, web-export, and
      security checks
- [ ] Native-device smoke test for sign-up, reset, Spotify connection, Scene creation,
      export, sharing, logout, and second-account isolation

Phase 1 is complete when a new tester can install Canal, recover an account, connect
Spotify, build a Scene, export it, publish a Snapshot, and sign into a second account
without seeing the first account's private data.

## Phase 2: retention and social proof

- [x] Replace remaining local-only relationship and activity data with Supabase tables
  and row-level security.
- Add a public Snapshot feed and profile Snapshot grid.
- Add explicit empty, offline, reconnect, and permission-recovery states.
- Add analytics for onboarding completion, first Scene creation, export, Snapshot
  publication, seven-day return, and failure points. Analytics must not include
  Spotify access tokens, passwords, email reset links, or private Scene payloads.
- Run usability tests with a small closed-beta group before changing the main
  navigation or visual system.

## Phase 3: service coverage and collaboration

- Add Apple Music only after a MusicKit developer token can be generated on a secure
  backend. Never embed an Apple private key or long-lived developer token in the app.
- Move provider-specific behavior behind a music-service adapter so Spotify and Apple
  Music share one Scene workflow.
- Add invited Scene collaboration with clear ownership and conflict handling.
- Promote Live Stages from local prototype storage to a synchronized backend after
  the single-user Scene loop is stable.

## Phase 4: creator and event products

- Creator-branded Snapshot templates and public Scene collections
- Collaborative releases and audience participation
- Event, venue, and DJ controls
- Licensing, moderation, reporting, and administrative tools required for broader
  distribution

## External release gates

- Supabase project URL and publishable key
- Applied Supabase migrations and allowed authentication redirect URLs
- Spotify client ID and production redirect URI
- Apple Developer and MusicKit credentials before Apple Music work
- Expo Application Services or native signing credentials for distributable builds
- Privacy policy, support contact, store metadata, and final device testing

## Autonomous workflow rules

- `docs/DELIVERY_WORKFLOW.md` defines the combined delivery loop and definition
  of done.
- Every implementation change is made on a branch and validated before a pull request.
- CI runs on pull requests and pushes to `main`.
- UX, accessibility, QA, and integration review happen inside the same delivery
  loop as implementation.
- Dependabot may open maintenance pull requests, but dependency-changing and
  subjective work is never merged automatically.
- A failed workflow can be retried once when the failure appears transient. Persistent
  failures require a root-cause note and a targeted fix.
- No autonomous workflow may add secrets to source control, weaken row-level security,
  or silently change Canal's product strategy.
