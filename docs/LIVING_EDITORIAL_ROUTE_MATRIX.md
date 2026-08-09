# Living Editorial zero-omission route matrix

Pinned inventory source: `a802caa3735d75792d0349e678ab700a350e47ce` (`app/**`, 60 files). A row is complete only when its route visibly adopts Living Editorial, preserves every interaction, passes automated evidence, and has bounded simulator evidence. `PENDING` means the entire redesign remains incomplete.

| Route file | Owner | Visual | Interaction/state | Automated | Simulator | Integrated SHA |
| --- | --- | --- | --- | --- | --- | --- |
| `app/_layout.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/(tabs)/_layout.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/+native-intent.ts` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/+not-found.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/auth/callback.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/auth/forgot-password.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/auth/reset-password.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/login.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/onboarding.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/connect-music.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/music-services.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/spotify-callback.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/settings.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/data-controls.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/help.tsx` | Shell/auth | PASS | PASS | PASS (shell/auth 16/16) | PENDING | `1537de3` |
| `app/(tabs)/index.tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/(tabs)/explore.tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/(tabs)/library.tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/(tabs)/profile.tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/(tabs)/activity.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/(tabs)/create.tsx` | Core editorial | PASS (reviewed existing conformance) | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/explore.tsx` | Core editorial | N/A (redirect-only) | PASS | PASS (exact redirect; editorial 7/7) | N/A | `0463098` |
| `app/home.tsx` | Core editorial | N/A (redirect-only) | PASS | PASS (exact redirect; editorial 7/7) | N/A | `0463098` |
| `app/library.tsx` | Core editorial | N/A (redirect-only) | PASS | PASS (exact redirect; editorial 7/7) | N/A | `0463098` |
| `app/search.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/favorites.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/following.tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/friends.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/friend/[username].tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/creator/[userId].tsx` | Core editorial | PASS | PASS | PASS (editorial 7/7) | PENDING | `5a8fb6d` |
| `app/blocked-users.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/invite-friends.tsx` | Core editorial | PASS | PASS | PASS (core/social 12/12) | PENDING | `82ae6c0` |
| `app/spotify-library.tsx` | Spotify UI | PENDING | PENDING | PENDING | PENDING | — |
| `app/scene-studio.tsx` | Scene/strict genre | PASS | PASS | PASS (strict/account 17/17) | PENDING | `1f52689` |
| `app/scene-preview.tsx` | Scene/strict genre then Scene integrator | PASS for strict/account scope; feedback editing pending | PASS for strict/account scope; feedback editing pending | PASS (strict/account 17/17) | PENDING | `1f52689` |
| `app/scene-collaboration.tsx` | Scene | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/scene-feedback.tsx` | Scene | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/scenes/[sceneId].tsx` | Scene | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/public-scene.tsx` | Scene | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/now-playing.tsx` | Scene/playback | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/soundscape.tsx` | Scene/playback | PASS | PASS | PASS (Scene/playback 12/12) | PENDING | `93859e9` |
| `app/scene-snapshot.tsx` | Snapshot/share | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/snapshot-templates.tsx` | Snapshot/share | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/snapshots/index.tsx` | Snapshot/share | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/snapshots/[snapshotId].tsx` | Snapshot/share | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/collections/new.tsx` | Snapshot/collections | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/collections/[collectionId].tsx` | Snapshot/collections | PASS | PASS | PASS (Snapshot 8/8) | PENDING | `8cb658d` |
| `app/(tabs)/live.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/create-stage.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/join-stage.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/live-stage/[stageId].tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/event-run-sheet.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/event-run-sheets/index.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/event-run-sheets/new.tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/event-run-sheets/[runSheetId].tsx` | Live/event | PENDING | PENDING | PENDING | PENDING | — |
| `app/releases/index.tsx` | Releases/ballot | PENDING | PENDING | PENDING | PENDING | — |
| `app/releases/new.tsx` | Releases/ballot | PENDING | PENDING | PENDING | PENDING | — |
| `app/releases/[releaseId].tsx` | Releases/ballot | PENDING | PENDING | PENDING | PENDING | — |
| `app/auth/release-ballot-smoke.tsx` | Releases/ballot | PENDING | PENDING | PENDING | PENDING | — |
| `app/scene/app/canal.code-workspace` | Non-route artifact | EXEMPT | EXEMPT | Exact rationale: editor workspace file, not executable/reachable | N/A | — |

## State and interaction columns required for every reachable row

Each row's interaction/state proof must cover every applicable control plus loading, skeleton, empty, partial, success, disabled, pressed, selected, saving, retry, error, offline, reconnecting, stale/conflict, expired-auth, maintenance, keyboard, permission, alert/sheet/menu/popover/toast, destructive confirmation, account switch, logout, background/foreground, and cold-launch behavior. Accessibility proof includes light/dark, Reduce Motion, Reduce Transparency, Dynamic Type, VoiceOver/focus, contrast, safe area/orientation, and effective 48-point targets.

Legacy hard-coded colors, radii, typography, and control sizes remain unresolved until each touched route either migrates them to semantic tokens or records a reviewed exact exemption. No row may inherit PASS solely from shared primitives.
