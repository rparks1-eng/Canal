import type {
  GeniusContextResponse,
} from "../../../lib/genius-context-contract";

export const GENIUS_CONTEXT_FIXTURE: GeniusContextResponse = {
  attribution: {
    commercialUseRequiresLicense: true,
    label: "Song context from Genius",
  },
  fetchedAt: "2026-08-07T12:00:00.000Z",
  provider: "genius",
  song: {
    album: "The Quiet Current",
    annotations: [
      {
        body: "The arrangement opens into a wider final passage.",
        geniusUrl: "https://genius.com/Canal-artist-first-light-lyrics#note-707",
        id: 707,
        verified: true,
        votesTotal: 14,
      },
    ],
    artist: "Canal Artist",
    artworkUrl: "https://images.genius.com/fixture.jpg",
    credits: [
      {
        label: "Written By",
        names: ["Canal Artist"],
      },
    ],
    description: "A concise, provider-authored note about the recording.",
    geniusUrl: "https://genius.com/Canal-artist-first-light-lyrics",
    id: 4242,
    links: [
      {
        label: "Open on Genius",
        url: "https://genius.com/Canal-artist-first-light-lyrics",
      },
    ],
    matchConfidence: "exact",
    media: [],
    popularity: {
      pageviews: 18,
    },
    releaseDate: "2026-01-16",
    title: "First Light",
  },
};
