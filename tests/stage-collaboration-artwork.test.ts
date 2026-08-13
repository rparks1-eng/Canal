import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  normalizeStageArtworkUrl,
} from "../lib/stage-collaboration";

const imageId =
  "AbCdEf0123456789AbCdEf0123456789";

describe(
  "Stage contribution artwork",
  () => {
    it.each([
      "i.scdn.co",
      "image-cdn-ak.spotifycdn.com",
      "image-cdn-fa.spotifycdn.com",
    ])(
      "retains canonical Spotify artwork from %s",
      (host) => {
        const url =
          `https://${host}/image/${imageId}`;

        expect(
          normalizeStageArtworkUrl(
            url,
          ),
        ).toBe(url);
      },
    );

    it.each([
      "https://images.genius.com/0123456789abcdef.1000x1000x1.jpg",
      "https://t2.genius.com/unsafe/600x600/example.jpg",
    ])(
      "retains bounded Genius fallback artwork from %s",
      (url) => {
        expect(
          normalizeStageArtworkUrl(
            url,
          ),
        ).toBe(url);
      },
    );

    it(
      "retains bounded Apple Music artwork",
      () => {
        const url =
          "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ab/cd/ef/example/640x640bb.jpg";

        expect(
          normalizeStageArtworkUrl(
            url,
          ),
        ).toBe(url);
      },
    );

    it.each([
      `http://i.scdn.co/image/${imageId}`,
      `https://image-cdn-ak.spotifycdn.com.evil.example/image/${imageId}`,
      `https://image-cdn-ak.spotifycdn.com/image/${imageId}?token=unsafe`,
      `https://mosaic.scdn.co/image/${imageId}`,
      "not-a-url",
      "https://is1-ssl.mzstatic.com.evil.example/image/thumb/example.jpg",
      "https://images.genius.com.evil.example/example.jpg",
      "https://images.genius.com/example.jpg?token=unsafe",
    ])(
      "drops unsupported artwork without rejecting the Stage contribution",
      (url) => {
        expect(
          normalizeStageArtworkUrl(
            url,
          ),
        ).toBeUndefined();
      },
    );
  },
);
