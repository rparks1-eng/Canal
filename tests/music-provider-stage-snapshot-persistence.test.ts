import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  getLiveStageTrackProviderUrl,
  normalizeLiveStageRows,
} from "../lib/live-stages";

import type {
  LiveStageRow,
} from "../lib/live-stages";

const appleArtwork =
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ab/cd/ef/example/640x640bb.jpg";
const appleTrackUrl =
  "https://music.apple.com/us/song/example/123456789?i=123456789";

function stageRow(
  tracks: unknown,
): LiveStageRow {
  const now =
    "2026-08-12T12:00:00.000Z";

  return {
    id: "stage-id",
    host_id: "host-id",
    host_display_name: "Host",
    host_handle: "host",
    stage_kind: "community",
    host_is_verified: false,
    host_is_canal: false,
    scene_id: null,
    stage_code: "123456",
    name: "Apple Stage",
    activity: "Listening",
    visibility: "public",
    status: "live",
    tracks,
    current_track_index: 0,
    created_at: now,
    updated_at: now,
    ended_at: null,
  };
}

describe(
  "music provider Stage and Snapshot persistence",
  () => {
    it(
      "round-trips Apple Music identity, link, and artwork through a Stage row",
      () => {
        const [stage] =
          normalizeLiveStageRows(
            [
              stageRow([
                {
                  id: "apple-music:123456789",
                  title: "Example",
                  artist: "Artist",
                  source: "Apple Music",
                  imageUrl: appleArtwork,
                  providerId: "apple-music",
                  providerTrackId: "123456789",
                  providerUrl: appleTrackUrl,
                  explicit: true,
                  genreEvidence: [
                    { provider: "spotify", genres: [" Alternative ", "Indie Pop"] },
                    { provider: "apple-music", genres: ["Alternative", "Indie Pop"] },
                    { provider: "genius", genres: ["Story song"] },
                  ],
                },
              ]),
            ],
            [],
            null,
          );

        expect(stage?.tracks[0]).toMatchObject({
          imageUrl: appleArtwork,
          providerId: "apple-music",
          providerTrackId: "123456789",
          providerUrl: appleTrackUrl,
          explicit: true,
          genreEvidence: [
            { provider: "apple-music", genres: ["Alternative", "Indie Pop"] },
            { provider: "spotify", genres: ["Alternative", "Indie Pop"] },
          ],
        });
        expect(
          getLiveStageTrackProviderUrl(
            stage?.tracks[0],
          ),
        ).toBe(appleTrackUrl);
      },
    );

    it(
      "persists explicit status and renders the shared Apple-style E beside artwork",
      () => {
        const migration = readFileSync(
          resolve(process.cwd(), "supabase/migrations/20260813041458_add_snapshot_explicit_status.sql"),
          "utf8",
        );
        const badge = readFileSync(resolve(process.cwd(), "components/explicit-badge.tsx"), "utf8");
        const artworkSurfaces = [
          "app/(tabs)/index.tsx",
          "app/scene-preview.tsx",
          "app/scenes/[sceneId].tsx",
          "app/now-playing.tsx",
          "app/public-scene.tsx",
          "app/song-context.tsx",
          "app/live-stage/[stageId].tsx",
          "app/stage-lobby/[stageId].tsx",
          "components/snapshot-composition.tsx",
        ];

        expect(migration).toContain("add column if not exists track_explicit boolean");
        expect(migration).toContain("'durationMs', 'explicit', 'imageUrl'");
        expect(migration).toContain("jsonb_typeof(track -> 'explicit') <> 'boolean'");
        expect(badge).toContain('accessibilityLabel="Explicit content"');
        expect(badge).toContain(">E</Text>");
        for (const path of artworkSurfaces) {
          expect(readFileSync(resolve(process.cwd(), path), "utf8")).toContain("<ExplicitBadge");
        }
      },
    );

    it(
      "drops forged Apple Music links and artwork",
      () => {
        const [stage] =
          normalizeLiveStageRows(
            [
              stageRow([
                {
                  id: "apple-music:123456789",
                  title: "Example",
                  artist: "Artist",
                  source: "Apple Music",
                  imageUrl: "https://is1-ssl.mzstatic.com.evil.example/image/thumb/example.jpg",
                  providerId: "apple-music",
                  providerTrackId: "123456789",
                  providerUrl: "https://music.apple.com.evil.example/us/song/example/123456789",
                },
              ]),
            ],
            [],
            null,
          );

        expect(stage?.tracks[0]?.imageUrl).toBeUndefined();
        expect(stage?.tracks[0]?.providerUrl).toBeUndefined();
        expect(
          getLiveStageTrackProviderUrl(
            stage?.tracks[0],
          ),
        ).toBeNull();
      },
    );

    it(
      "adds constrained provider columns and Apple-safe Stage validation",
      () => {
        const migration =
          readFileSync(
            resolve(
              process.cwd(),
              "supabase/migrations/20260813030859_preserve_snapshot_music_provider.sql",
            ),
            "utf8",
          );

        expect(migration).toContain(
          "add column if not exists provider_id text",
        );
        expect(migration).toContain(
          "snapshots_provider_metadata_complete",
        );
        expect(migration).toContain(
          "snapshots_track_image_url_safe",
        );
        expect(migration).toContain(
          "create or replace function private.live_stage_tracks_are_safe",
        );
        expect(migration).toContain(
          "'providerId', 'providerTrackId', 'providerUrl'",
        );
        expect(migration).toContain(
          "[.]mzstatic[.]com",
        );
        expect(migration).toContain(
          "(images|t2)[.]genius[.]com",
        );
        expect(migration).toContain(
          "security invoker",
        );
        expect(migration).toContain(
          "revoke all",
        );
        expect(migration.trimStart()).toMatch(
          /^begin;/u,
        );
        expect(migration.trimEnd()).toMatch(
          /commit;$/u,
        );
        expect(migration).toMatch(
          /provider_id = 'spotify'\s+and provider_url !~/u,
        );
        expect(migration).not.toMatch(
          /provider_id = 'spotify'\s+provider_id/u,
        );
      },
    );

    it(
      "threads provider metadata through every Snapshot route and cloud field",
      () => {
        const sources = [
          "app/snapshot-camera.tsx",
          "app/scene-snapshot.tsx",
          "app/live-stage/[stageId].tsx",
          "app/scenes/[sceneId].tsx",
          "lib/snapshots.ts",
          "lib/snapshot-cloud.ts",
          "lib/public-snapshots.ts",
        ].map((path) =>
          readFileSync(
            resolve(process.cwd(), path),
            "utf8",
          ),
        );

        for (const source of sources) {
          expect(source).toContain(
            "providerTrackId",
          );
          expect(source).toContain(
            "providerUrl",
          );
        }

        expect(sources[5]).toContain(
          "provider_track_id",
        );
        expect(sources[5]).toContain(
          "provider_url",
        );
        expect(sources[6]).toContain(
          '"provider_id"',
        );
        expect(sources[6]).toContain(
          "normalizePublicSnapshotProviderUrl",
        );
        for (const source of sources) {
          expect(source).toContain(
            "genreEvidence",
          );
        }
      },
    );

    it(
      "uses a separate bounded forward migration for provider genre evidence",
      () => {
        const migration = readFileSync(
          resolve(
            process.cwd(),
            "supabase/migrations/20260813033029_preserve_snapshot_stage_genre_evidence.sql",
          ),
          "utf8",
        );

        expect(migration.trimStart()).toMatch(/^begin;/u);
        expect(migration.trimEnd()).toMatch(/commit;$/u);
        expect(migration).toContain("add column if not exists genre_evidence jsonb");
        expect(migration).toContain("jsonb_array_length(evidence) > 2");
        expect(migration).toContain("jsonb_array_length(provider_entry -> 'genres') not between 1 and 12");
        expect(migration).toContain("char_length(genre_text) not between 1 and 80");
        expect(migration).toContain("provider_value not in ('apple-music', 'spotify')");
        expect(migration).toContain("next_provider_order <= provider_order");
        expect(migration).toContain("lower(genre_text) = any(genre_seen)");
        expect(migration).toContain("regexp_replace(genre_text, '[[:space:]]+', ' ', 'g')");
        expect(migration).toContain("'providerId', 'providerTrackId', 'providerUrl', 'genreEvidence'");
        expect(migration).toContain("private.music_provider_genre_evidence_is_safe(track -> 'genreEvidence')");
        expect(migration).not.toContain("'genius'");
      },
    );
  },
);
