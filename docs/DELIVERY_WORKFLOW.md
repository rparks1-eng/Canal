# Canal delivery workflow

Canal uses one persistent delivery loop instead of independent agents making
overlapping changes. Product planning, implementation, UX review, quality
assurance, integration, and security remain separate checks inside that loop.

## Single source of work

`docs/ROADMAP.md` is the ordered backlog. Open pull requests are work in progress.
The delivery loop must finish or repair existing work before selecting another
roadmap item.

## Delivery loop

Each run follows this order:

1. Inspect open pull requests and the latest GitHub Actions results.
2. Repair a failing active change before starting new work.
3. If a development pull request is open, continue that pull request instead of
   opening a competing implementation.
4. Otherwise choose the highest-priority unchecked roadmap item that is not
   blocked by an external credential, dashboard setting, or physical device.
5. Implement the smallest complete user outcome. Functional code and its UX,
   accessibility, loading, empty, error, offline, and permission states belong
   in the same change.
6. Add focused tests and run `npm run validate`.
7. Open or update one draft pull request. Record what changed, the validation
   evidence, and every untested device or external gate.
8. Do not merge automatically. Begin the next item only after the active change
   is resolved.

An explicit product/release-owner direction may allow work on later roadmap items
while an external release gate is deferred. Record the decision, date, deferred
checks, and accepted risk in the roadmap and active pull request. This exception
changes backlog sequencing only: it does not turn an unexecuted or undocumented
smoke test into a pass, satisfy the definition of done for a release, or authorize
production distribution.

User-reported completion criteria remain part of this loop until both source
validation and the applicable external smoke tests pass. Current criteria include
password-reset return and fallback behavior, direct post-creation playback, persistent
player navigation, track artwork, duration-aligned generation, first-character song
and artist typeahead, current streaming-data recommendations, genre selection, full
liked-song and playlist indexing, per-track genre inference, and discovery outside
the existing listening pattern.

This ordering replaces separate roadmap, UI, QA, and integration loops. It
prevents duplicate branches, conflicting redesigns, repeated dependency
installs, and multiple test runs for the same change.

## Persistent automation

| Layer | Responsibility |
| --- | --- |
| Canal Delivery Loop | Prioritize, implement, review UX, test, and prepare one draft pull request at a time |
| GitHub CI | Check Expo dependency compatibility, lint, TypeScript, unit tests, public configuration, web export, and newly introduced vulnerable dependencies |
| CodeQL | Scan JavaScript and TypeScript changes and the default branch for security issues |
| Dependabot | Propose compatible npm and GitHub Actions maintenance updates each week |
| Release gate | Require a person with the configured services and devices to run the native smoke test |

## Failure routing

- A likely transient GitHub Actions failure may be retried once.
- A repeated failure is implementation work. Record the root cause and fix the
  active branch before continuing the roadmap.
- A failed dependency update is closed or revised. It must not block unrelated
  product work.
- A subjective UI change stays in a draft pull request until reviewed.
- A task that needs Supabase, Spotify, Apple, Expo, signing, or store credentials
  stops at a documented gate. Credentials are never added to source control.

## Definition of done

A roadmap item is done only when:

- the user outcome works through the intended screen flow;
- relevant loading, empty, error, offline, and permission states are handled;
- focused tests exist and `npm run validate` passes;
- data ownership and Supabase row-level security are preserved;
- the pull request states which native devices and external services were
  actually tested.

Phase 1 is complete only when every Phase 1 roadmap item is checked and
`docs/DEVICE_SMOKE_TEST.md` passes on a rebuilt app. Source checks cannot
substitute for the native smoke test.

## Product constraints

- Canal accounts are activated before music services are connected.
- Canal builds and exports Soundscapes; it does not stream provider audio as an
  unlicensed replacement player.
- The closed beta prioritizes the single-user Scene and Snapshot loop.
- Real-time public rooms wait until licensing, moderation, and cold-start risks
  are addressed.
