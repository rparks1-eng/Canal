## Outcome

Describe the user problem solved and link the roadmap item or issue.

## Product and UX

- [ ] The change preserves Canal's Connect, Shape, Export product loop.
- [ ] Loading, empty, error, offline, and permission states were considered.
- [ ] Navigation, labels, touch targets, and screen-reader behavior were reviewed.
- [ ] No music-service connection is required before Canal account activation.

## Validation

- [ ] `npm ci`
- [ ] `npm run validate`
- [ ] New or changed behavior has focused tests.
- [ ] No credentials, tokens, reset links, or private Scene payloads were committed or logged.
- [ ] Supabase row-level security remains account-isolated.

## Device and external gates

- [ ] iOS device or simulator smoke test
- [ ] Android device or emulator smoke test
- [ ] Supabase migrations and redirect URLs verified
- [ ] Spotify production redirect verified

List anything not tested and why. Do not mark a release gate complete without evidence.
