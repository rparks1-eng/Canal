# Living Editorial integration ledger

Base: `a802caa3735d75792d0349e678ab700a350e47ce`

Integration branch: `codex/living-editorial-integration`

Concept source: `canal-motion-directions.html`

## Release invariants

- Existing routes, actions, handlers, mutations, guards, provider links, authentication flows, and accessibility behavior must remain functional.
- Every changed route requires a before/after interaction inventory and focused interaction evidence.
- All interactive targets are at least 48 points with accessible labels, roles, state, Dynamic Type, visible focus, and non-color state communication.
- Motion is one-shot, cancel-safe, meaningful, and Reduce Motion compatible. Reduce Transparency uses a solid fallback.
- Spotify artwork and metadata remain unchanged, attributed, and linked back. No provider-derived taste profile or artwork transformation.
- The iPhone Simulator remains on the last-known-good integrated commit when a lane fails.

## Route-family status

| Family | Owner | Scope | Status | Integrated SHA | Evidence |
| --- | --- | --- | --- | --- | --- |
| Foundation/design system | Lane A | `theme/*`, `components/canal-ui/*` | Integrated PASS | `c95d9d2` | Independent PASS; rendered 9/9; TypeScript; lint has two test import-order warnings, zero errors |
| Scene account-scope foundation | Foundation chain | Exact 15-path Scene/lifecycle package | Integrated PASS | `71694f9` | Independent zero-P0/P1 PASS; 5 suites/16 tests, TypeScript, lint, diff-check PASS |
| Global shell/auth | Lane B | Root layouts, tabs, login/onboarding/account/auth callbacks | Integrated automated PASS; simulator pending | `1537de3` | Independent zero-P0/P1 PASS; rendered 16/16, TypeScript, lint zero errors, diff-check PASS |
| Home/explore/library/profile/activity/social | Lane C | Core tabs, discovery, social, Spotify library UI | Core/social routes integrated automated PASS; Spotify Library pending | `0463098` | Exact Home/Explore/Library redirect contracts plus editorial 7/7, core/social 12/12, and core navigation 14/14; TypeScript/lint zero errors/diff-check PASS |
| Scene workflow | Sequential owners | Studio, Preview, Scene detail, player, feedback | Studio/Preview strict genre integrated automated PASS; remaining Scene routes pending | `1f52689` | Strict genre + account-scope rendered/focused suites 17/17, TypeScript/lint/diff PASS |
| Snapshot/share | Snapshot owner | Snapshot composer, templates, share/export | Six routes integrated automated PASS; simulator pending | `8cb658d` | Rendered 8/8, TypeScript, lint zero errors, diff-check PASS |
| Live/event/run sheets | Repair owner required | Live Stage, releases, run sheets | Production package excluded after integration-harness failure | — | Latest focused package result 9 PASS / 13 FAIL; no production bytes retained |
| Route/accessibility contracts | Integrator/reviewer | Reachability and interaction matrix | Inventorying | — | Pending |

## Reachable route inventory

The authoritative zero-omission file ledger is [LIVING_EDITORIAL_ROUTE_MATRIX.md](./LIVING_EDITORIAL_ROUTE_MATRIX.md). It contains all 60 `app/**` inventory entries; 59 are reachable route/layout sources and `app/scene/app/canal.code-workspace` is explicitly classified as a non-route editor artifact. Any reachable row not explicitly marked PASS keeps the entire redesign incomplete.

- Shell/auth: `/_layout`, `/login`, `/onboarding`, `/connect-music`, `/music-services`, `/settings`, `/data-controls`, `/help`, auth callbacks, and not-found/native-intent recovery.
- Core editorial: Home, Explore, Library, Search, Profile, Activity, Favorites, Following, Friends, creator/friend detail, invites, blocked users, and Spotify Library.
- Scene workflow: Scene Studio, editable Scene Preview, Scene detail, collaboration, feedback, Now Playing, soundscape, and public Scene.
- Snapshot/share: Scene Snapshot, Snapshot index/detail/templates, collections, and public sharing.
- Live/event: Live tab, create/join/live stage, releases, Event Run Sheets, and release-ballot smoke.

Every lane owns its before/after interactive-control inventory. A route remains incomplete until tap, disabled/loading, recovery, back/deep-link, keyboard/form, account-isolation, and offline/reconnect behavior is evidenced where applicable.

## Exact-main functional-preservation baseline

Source: commit `a802caa3735d75792d0349e678ab700a350e47ce`, tree `a011371101a156c25043bfd85567f8696c50493a`. This is a static inventory, not a PASS.

- Navigation seams: root auth/onboarding return guards; tabs; safe back-or-fallback replacements; route cards and deep links.
- Form seams: auth, profile, collections, stages, run sheets, releases, collaboration, Snapshot, Scene, search, and feedback inputs.
- Mutation seams: login/logout, provider connect/disconnect, data export/deletion/reset, social/block/report, Scene/Preview/player, Snapshot/export, release/live lifecycle.
- Confirmation seams: destructive account/data/social/Snapshot/release/live actions must retain their existing alerts and owner scope.
- Recovery seams: loading/disabled/offline/retry/error handling is present unevenly and requires changed-route proof.

Mandatory unresolved baseline gaps for every touched surface:

- P0: Reduce Motion/Transparency behavior, effective 48-point targets, and complete accessible labels/roles/state.
- P1: non-overlapping hit slop, pointer event and overlay/z-index routing, keyboard/focus/large-text behavior, double-submit/idempotency, offline/retry/error, deep-link fallback, and destructive confirmation account scope.
- Static source presence is insufficient evidence. Each lane must provide rendered interaction tests or mark the exact manual simulator check unresolved.

## Critical click-through matrix

| Flow | Automated contract | Simulator | Notes |
| --- | --- | --- | --- |
| Login, onboarding, logout, account switch | Pending | Pending | No real-account mutation |
| Spotify connect/reconnect/library/search/linkback | Pending | Pending | Disposable account only when separately authorized |
| Scene parameters → generation → editable preview → save/player | Pending | Pending | Preserve Familiar ↔ New and feedback actions |
| Snapshot media/template/export/cleanup | Pending | Pending | User-owned media only for expressive transforms |
| Home, Explore, Library, Profile, Activity, social | Pending | Pending | Quiet scrolling |
| Live/Event/Run Sheet privacy and lifecycle | Pending | Pending | No backend-model changes |
| Settings, deletion, block, destructive confirmations | Pending | Pending | Positive provenance and cleanup required |
| Offline/reconnect/loading/empty/error | Pending | Pending | No speculative PASS |

## Simulator

- Existing pre-integration Metro remains preserved.
- Integration Metro runs from this worktree on localhost port 8082 and is attached to the iPhone 17 Pro Simulator.
- Last-known-good integrated commit: `0463098`.
- Baseline `npm run validate`: PASS before any UI lane commit.
- Fast Refresh applies only after a reviewed integration commit is green.
- Native rebuilds are prohibited unless a reviewed native dependency or configuration change makes one unavoidable.

## Rejected lane evidence

- `02f7687cd5ed3b230a4f29cbe34cf9fc5b98f23e` is provenance-valid but excluded from integration. It used route-group hrefs for normalized pathname selection, capped Dynamic Type, relied on color for visible selection, and supplied source-token tests rather than interaction evidence.
- `6188864f6680e776af46f8908f770c5a8fe7ff2e` is excluded intermediate evidence; duplicate navigation and narrow-width hit-region overlap remained.

## Reviewed lane evidence

- UI Foundation `8eecdb240cba8b10be3c12a1af50fbf44ada0f3b`: independent PASS, exact nine-path delta, manifest `5523093c4c77ac578dcd28470e09f0d6f3e2527849b96aa427588aaeff40485a`. Integrated as the complete three-commit chain through `c95d9d2`; interaction tests pass 9/9 on integration, TypeScript passes, and lint reports zero errors.
- Core navigation `b8efed76d34020a95342cd30e0522619fa1698ed`: independent PASS, exact two-path delta, manifest `a72bf5898cc3cf732f9e6fa2b190bb52d3326a342a0fe64cc70a822943a2fff3`. It preserves exact push/replace destinations, coalesces rapid navigation, resets on pathname transition, avoids selected-destination redispatch, supports Dynamic Type and non-color selection, and fits five 58×54 targets at 320 points without overlapping hit slop.
- Core navigation was integrated as its complete three-commit correction chain through `385908d`; the integrated SHA passes all 14 rendered navigation contracts, TypeScript, touched-file lint, and diff-check with a clean index.
- Scene account-scope Foundation `e0dc1ced01be000586ebbb0b746079c420b79fa0`: independent PASS, exact 15-path manifest `0a127dc0e14b720b1f31b7604b669ffbea54e797495a420fa049a3eac2fa789f`. Integrated as the complete five-commit chain through `71694f9`; all five focused suites (16 tests), TypeScript, touched lint, and diff-check pass on the combined integration branch.
- Shell/auth `d825d37f3bebe7077dfddaabef234af32aceeefb`: independent PASS, exact 15-path manifest `e6b25090cab1cc4db1f15a392d17bd5fe2bfa7b45e91d68b5cc6b638ddc846eb`. Integrated as the complete four-commit chain through `1537de3`; its rendered interaction suite passes 16/16 with TypeScript, zero lint errors, and diff-check PASS. Route rows remain incomplete until bounded simulator evidence is recorded.
- Primary editorial routes `24ef38e23547f46ec0341b92111f7d204e0a2044`: Controller independent package review PASS for exact seven-path manifest `521401859ccc40811d87f6934b8d5c96156c64268d6ae91dacc61912a7b0351e`. Integrated as the complete three-commit chain through `5a8fb6d`; rendered tests pass 7/7 with exact navigation, repaired-target geometry, retry, and deferred A→B isolation evidence. Unowned routes in this family remain PENDING.
- Strict genre `c51096153fb301051d4d4b001a278a830f95304e`: Controller independent review PASS after two bounded corrections, cumulative five-path manifest `07ce07d540e8ba7f6b31c94d09716442197392dc93d8432e05e3acb9106931a7`. Integrated through `1f52689`; four focused suites pass 17/17 with strict Rock/R&B eligibility, adjacent opt-in, actionable underfill, deterministic rejection filtering, rendered match explanations, exact Return behavior, and A→B fencing.
- Snapshot/share `be0586ce15de236f0adee67020df95f8f18e1a01`: Controller independent review PASS, cumulative seven-path manifest `e26a56eb227a16e05af40bea9aa7926d52c2a9841d30ecd0815af3fb10cf4780`. Integrated through `8cb658d`; its six-route rendered suite passes 8/8, TypeScript passes, lint has zero errors, and diff-check passes. Simulator evidence remains pending.
- Remaining core/social routes `b0bb5fb5808a4395bbe9fb6954a9401a8a7695cb`: Controller independent review PASS after an integration-only TypeScript correction, cumulative nine-path manifest `48c3d341252fd0034723c6fc89dc5d32ad784862edbf8d96c07da74b7e38f79d`. Integrated through `82ae6c0`; rendered tests pass 12/12, TypeScript and lint (zero errors) pass, and the package covers exact search, favorites, social, block/unblock, invite, retry, and A1→A2 behavior. No nonexistent Report action was invented.
- Scene/playback `27c5dd03a601432b6ba9e6614428bebce211cae7`: Controller independent review PASS after exact account-generation closure, cumulative seven-path manifest `b6106a9f2ce5c890ebb0e518d868b685de5560e5f83ef4c41794d72d79ae96f7`. Integrated through `93859e9`; rendered tests pass 12/12 with collaboration, feedback, detail/export, public share, Signal Film playback/retry/Reduce Motion, Soundscape, and A1→A2 fencing. TypeScript, lint, and diff-check pass.
- Redirect aliases `app/home.tsx`, `app/explore.tsx`, and `app/library.tsx` are intentionally visual N/A wrappers. Their exact destinations are rendered and asserted in the editorial 7/7 suite at `0463098`; they do not represent orphan legacy screens.

## Excluded integration evidence

- Live/Event/Releases lane `67c14d1d0c3033df8b9dcc59b4a84a0714d61677` remains excluded. Its production package was fully reverted after the focused integration suite failed; a clean reproduction still reports 9 passing and 13 failing interactions because the test harness does not exercise the route mutations under the current dependency graph. No Live/Event/Releases production byte is currently integrated from that lane.
- The frozen Spotify remediation source parcel (manifest `5ee01e9e9629cde2bccdb011afa32c1d5718c9f7ca9c65b38e08f40ec833f997`) is mechanically clean against this branch but is not safe to byte-copy as an isolated eight-file package. Its disabled library contract also requires explicit caller adaptation in Home, Settings, Music Services, app-session, and the Spotify provider adapter, while `app/spotify-library.tsx` must retain the integrated account-scope shell. The active import/taste UI remains a P1 blocker until that coordinated package is reviewed.

## Zero-omission static audit blockers

- Live/Event/Releases: reviewed production styling is not integrated; current controls include 36–46 point actions. A fresh production-only successor and an independent current-dependency interaction harness are required.
- Spotify Library: still uses route-local legacy styling and exposes active import/export/taste-generation behavior that conflicts with the frozen remediation.
- Scene Preview: strict genre and account fencing pass, but editable remove/reorder/feedback/Undo remains pending and must be ported onto the scoped repository.
- Now Playing: Signal Film is an approved playback-only exemption, but its storage retry target and decorative-layer hit testing require a bounded correction.
- Snapshot formats: Receipt/Ticket/Living Story content surfaces are approved Tactile Archive exemptions; surrounding chrome and decorative overlay hit testing still need reviewed evidence.
- Shell/auth and core/social routes pass their functional contracts but retain route-local palette/radius/type literals. They are not globally complete until each occurrence is migrated to shared semantics or receives a reviewed exact exemption.
