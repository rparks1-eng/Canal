import { readFileSync } from "node:fs";
import path from "node:path";

import {
  GeniusContextHttpError,
  normalizeGeniusContext,
  parseGeniusContextRequest,
} from "../supabase/functions/genius-context/helpers";

const request = {
  album: "The Quiet Current",
  artist: "Canal Artist",
  releaseDate: "2026-01-16",
  title: "First Light",
};

const songPayload = {
  response: {
    song: {
      album: { name: "The Quiet Current" },
      api_path: "/songs/4242",
      description: { plain: "A concise provider-authored note." },
      header_image_url: "https://images.genius.com/header.jpg",
      id: 4242,
      lyrics: "This field must never cross the function boundary.",
      media: [
        { provider: "youtube", url: "https://www.youtube.com/watch?v=fixture" },
        { provider: "unsafe", url: "http://example.com/insecure" },
      ],
      primary_artist: {
        name: "Canal Artist",
        url: "https://genius.com/artists/Canal-artist",
      },
      producer_artists: [{ name: "Fixture Producer" }],
      release_date_for_display: "January 16, 2026",
      song_art_image_url: "https://images.genius.com/art.jpg",
      stats: { pageviews: 18 },
      tags: [
        { name: "Alternative R&B" },
        { name: "Dream Pop" },
        { name: "Alternative R&B" },
        { name: "" },
      ],
      title: "First Light",
      url: "https://genius.com/Canal-artist-first-light-lyrics",
      writer_artists: [{ name: "Canal Artist" }],
    },
  },
};

const referentsPayload = {
  response: {
    referents: [
      {
        fragment: "Provider lyric fragment must not cross the boundary.",
        annotations: [
          {
            body: { plain: "The arrangement opens into a wider final passage." },
            id: 707,
            url: "https://genius.com/Canal-artist-first-light-lyrics#note-707",
            verified: true,
            votes_total: 14,
          },
        ],
      },
    ],
  },
};

describe("Genius Edge helper contract", () => {
  it("allows only bounded identity fields and rejects unsafe provider IDs", () => {
    expect(parseGeniusContextRequest({
      ...request,
      title: `  ${"A".repeat(260)}  `,
    }).title).toHaveLength(200);

    expect(() => parseGeniusContextRequest({
      ...request,
      unexpected: true,
    })).toThrow(GeniusContextHttpError);

    expect(() => parseGeniusContextRequest({
      ...request,
      geniusSongId: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow("geniusSongId must be a positive integer");
  });

  it("normalizes an exact allowlist with attribution and canonical Genius links", () => {
    const result = normalizeGeniusContext(
      songPayload,
      referentsPayload,
      request,
      "2026-08-07T12:00:00.000Z",
    );

    expect(Object.keys(result).sort()).toEqual([
      "attribution",
      "fetchedAt",
      "provider",
      "song",
    ]);
    expect(Object.keys(result.song).sort()).toEqual([
      "album",
      "annotations",
      "artist",
      "artworkUrl",
      "credits",
      "description",
      "geniusUrl",
      "genres",
      "id",
      "links",
      "matchConfidence",
      "media",
      "popularity",
      "releaseDate",
      "title",
    ]);
    expect(result.attribution).toEqual({
      commercialUseRequiresLicense: true,
      label: "Song context from Genius",
    });
    expect(result.song.links[0]).toEqual({
      label: "Open song on Genius",
      url: "https://genius.com/Canal-artist-first-light-lyrics",
    });
    expect(result.song.annotations[0]).toMatchObject({
      body: "The arrangement opens into a wider final passage.",
      id: 707,
      verified: true,
    });
    expect(result.song.genres).toEqual([
      "Alternative R&B",
      "Dream Pop",
    ]);
  });

  it("does not return provider lyrics, referent fragments, tokens, or insecure URLs", () => {
    const result = normalizeGeniusContext(
      songPayload,
      referentsPayload,
      request,
      "2026-08-07T12:00:00.000Z",
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("Provider lyric fragment");
    expect(serialized).not.toContain("This field must never cross");
    expect(serialized).not.toMatch(/access[_-]?token|client[_-]?secret|authorization/iu);
    expect(serialized).not.toContain("http://example.com/insecure");
  });

  it("accepts genres only as a bounded string array at the client boundary", () => {
    const contract = readFileSync(
      path.join(process.cwd(), "lib/genius-context-contract.ts"),
      "utf8",
    );
    expect(contract).toContain("song.genres.every");
    expect(contract).toContain('typeof genre === "string"');
  });
});
