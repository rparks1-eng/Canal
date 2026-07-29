# Canal release evidence

Create one copy of this template for each release candidate. Run the authoritative
[closed-beta device smoke test](./DEVICE_SMOKE_TEST.md) without copying its test
steps here. Link durable evidence for each section and every failure.

Record only whether public configuration is present and verified. Never include
configuration values, credentials, tokens, passwords, reset links, private Scene
payloads, or private provider responses in this record.

## Candidate

| Field | Value |
| --- | --- |
| Full candidate commit SHA | |
| Branch and pull request | |
| Build identifier | |
| App version | |
| Native build/version code | |
| Artifact or install source | |
| Validation run link | |
| Evidence owner | |

- [ ] The installed artifact was rebuilt from the exact full commit SHA above.
- [ ] The candidate did not change after the build was created.
- [ ] `npm run validate` passed for the exact candidate, or an exception is linked below.

## Configuration and service attestations

Use `Present`, `Absent`, or `Not applicable`. Do not paste any value.

| Requirement | Status | Verified by | Date | Evidence or note |
| --- | --- | --- | --- | --- |
| Public Supabase project URL is present in the build | | | | |
| Public Supabase publishable key is present in the build | | | | |
| Supabase authentication and password-reset redirects are allowed | | | | |
| All authorized committed Supabase migrations are applied in filename order | | | | |
| Local and remote Supabase migration histories are reconciled | | | | |
| Supabase security-advisor warnings are resolved or have linked dispositions | | | | |
| Public Spotify client ID is present in the build | | | | |
| Spotify dashboard allows the production redirect URI | | | | |
| Public Canal share base URL is present when required | | | | |
| Public Canal web URL is present when HTTPS recovery fallback is required | | | | |
| Signing and distribution configuration is available for this build | | | | |
| Realtime and Live Stages dashboard settings are verified when applicable | | | | |

## Test sessions

Add a row for every device or simulator used. Use the same build identifier recorded
above, or explain the difference.

| Platform | Device or simulator model | OS version | Build identifier | Tester | Date | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Smoke-test section results

Use `Pass`, `Fail`, `Blocked`, or `Not applicable`. A section passes only when every
applicable step in that section of the authoritative smoke test passes.

| Smoke-test section | Result | Device/session | Evidence link | Failure or exception links |
| --- | --- | --- | --- | --- |
| Account and recovery | | | | |
| Spotify and Scene loop | | | | |
| Snapshot and sharing | | | | |
| Live Stages | | | | |
| Account isolation | | | | |
| Platform and recovery states | | | | |

## Failures and exceptions

Every failed, blocked, skipped, or disputed step must have an issue or pull request.
Do not record sensitive user or provider data in the description or linked evidence.

| Smoke-test section and step | Observed result | Issue or pull request | Owner | Resolution SHA/build |
| --- | --- | --- | --- | --- |
| | | | | |

## Retest evidence

Retest the affected smoke-test step and any dependent flow against a rebuilt artifact.

| Failure link | Retest commit SHA | Retest build | Device/OS | Tester/date | Result | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Final sign-off

- [ ] Every applicable step in `docs/DEVICE_SMOKE_TEST.md` passed on the candidate.
- [ ] Every failure, block, skipped step, and exception is linked and resolved or
      explicitly accepted by the release owner.
- [ ] Retests used the recorded resolution SHA and rebuilt artifact.
- [ ] Account isolation and Supabase row-level security evidence is attached.
- [ ] Tested devices, operating systems, Supabase environment, and Spotify
      integration are accurately represented without exposing secret values.
- [ ] The release record and pull request link to this completed evidence.

| Decision | Value |
| --- | --- |
| Release decision (`Pass` or `Do not release`) | |
| Remaining exceptions and rationale | |
| QA sign-off, date | |
| Product/release-owner sign-off, date | |
