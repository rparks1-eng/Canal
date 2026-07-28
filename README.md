# Canal

Canal is an Expo SDK 54 app for building, refining, saving, exporting, and
sharing mood and activity Soundscapes.

The primary product loop is Connect, Shape, Export:

1. Connect an existing music service after signing into Canal.
2. Shape a Scene with activity, mood, energy, familiarity, duration, and
   artists.
3. Refine and save the generated track list.
4. Export it to the connected service.
5. Share a Snapshot that links listeners back to Canal.

## Local setup

1. Copy `.env.example` to `.env.local` and add the public development values.
   Do not add provider secrets or private keys.
2. Install the exact locked dependencies with `npm ci`.
3. Start the project with `npm start`.

Useful commands:

```bash
npm run ios
npm run android
npm run web
npm run validate
```

`npm run validate` checks Expo dependency compatibility, lint, TypeScript,
unit tests, public Expo configuration, and a complete static web export.

## Delivery and release

- [Product roadmap](docs/ROADMAP.md)
- [Combined delivery workflow](docs/DELIVERY_WORKFLOW.md)
- [Native closed-beta smoke test](docs/DEVICE_SMOKE_TEST.md)

Automated source checks do not prove that provider dashboards, native deep
links, signing, or physical-device behavior work. A rebuilt app must pass the
device smoke test before Phase 1 is considered complete.

## Environment variables

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
- `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI`
- `EXPO_PUBLIC_CANAL_SHARE_BASE_URL`

Only public client configuration belongs in Expo client variables. Apple
private keys, MusicKit signing material, Supabase service-role keys, and other
server credentials do not belong in this repository or client bundle.
