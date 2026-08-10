# Canal public links and deferred onboarding

Canal's canonical public origin is configured with `EXPO_PUBLIC_CANAL_WEB_URL` and
`EXPO_PUBLIC_CANAL_SHARE_BASE_URL`. Production should set both to the same HTTPS
origin. Until Canal controls a permanent domain, preview deployments must use the
exact EAS Hosting URL shown in the deployment receipt.

## Canonical routes

- `/scenes/{sceneId}`
- `/snapshots/{snapshotId}`
- `/stages/{stageId}/join?invite={opaqueToken}`
- `/spotify-callback`
- `/auth/callback`

Only the three content routes are public previews. Public previews return a
bounded, allowlisted projection. Private or inaccessible content must be
indistinguishable from missing content unless the signed-in viewer is authorized.

The incoming destination is parsed against this route allowlist, stored without
credentials, bound to the Canal account that resumes it, and consumed once after
authentication, onboarding, and (when chosen) Spotify connection. Arbitrary URL
origins, nested URLs, fragments, credentials, and non-canonical paths are rejected.

## Local and preview validation

```sh
npm run typecheck
npm run lint
npm test -- --ci
npm run web:export
npx eas-cli@latest deploy
```

Record the source commit, EAS deployment URL, public environment names (never
values), and test results. Test the preview URL in a private browser window before
using it in a native associated-domain build.

## Production gates

The following are deliberately not inferred from repository configuration:

1. The user controls the selected domain and points it at the reviewed hosting
   deployment.
2. The domain serves `/.well-known/apple-app-site-association` and
   `/.well-known/assetlinks.json` over HTTPS without redirects or authentication.
3. Apple Associated Domains is enabled for team `6UBGGFVD92` and bundle
   `com.raishawnparks.canal`; the Android signing certificate fingerprints in
   `assetlinks.json` are replaced with the release-key fingerprints before release.
4. Supabase Auth Site URL and redirect allowlist include the exact production
   `/auth/callback` URL.
5. Spotify registers the exact HTTPS `/spotify-callback` URI. Redirect matching is
   exact; do not add query parameters or a trailing slash unless the registered URI
   has them.
6. While Spotify remains in Development Mode, each beta Spotify account is added
   to the application's allowlist. Public availability waits for Spotify Extended
   Quota approval.
7. Reviewed migrations are applied through the normal dry-run, lint, advisor, and
   two-account acceptance sequence. Never apply only part of the invitation-token
   dependency chain.

## Acceptance matrix

Run each content type in a browser and installed development build with:

- a recipient without a Canal account;
- a Canal account without Spotify connected;
- a Canal account with Spotify connected;
- an account switch during authentication or Spotify authorization;
- public, private, missing, expired, and revoked content/invitations;
- listener, member, and collaborator Stage invitations.

Every successful path must return to the exact original content. No failed or
stale path may fall through to a different account, disclose private metadata, or
redeem an invitation twice.

## Rollback

Disable sharing of new Stage invitation URLs, revoke affected invitation tokens,
and redeploy the last recorded web artifact. Native custom-scheme routes remain as
an internal fallback, but public shares must not downgrade to six-digit Stage codes.
Database rollback is forward-only: ship a reviewed corrective migration rather
than editing or deleting applied migration history.
