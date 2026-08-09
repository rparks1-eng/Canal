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
      `http://i.scdn.co/image/${imageId}`,
      `https://image-cdn-ak.spotifycdn.com.evil.example/image/${imageId}`,
      `https://image-cdn-ak.spotifycdn.com/image/${imageId}?token=unsafe`,
      `https://mosaic.scdn.co/image/${imageId}`,
      "not-a-url",
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
