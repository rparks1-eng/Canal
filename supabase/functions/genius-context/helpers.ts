import {
  GENIUS_ATTRIBUTION,
  GENIUS_PROVIDER,
  type GeniusAnnotationSummary,
  type GeniusContextErrorCode,
  type GeniusContextRequest,
  type GeniusContextResponse,
  type GeniusCreditGroup,
  type GeniusMediaLink,
// @ts-expect-error Deno Edge Functions require explicit TypeScript extensions.
} from "../../../lib/genius-context-contract.ts";

const MAX_TEXT_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1_200;
const MAX_ANNOTATION_LENGTH = 800;
const MAX_ANNOTATIONS = 8;
const MAX_MEDIA_LINKS = 8;
const MAX_CREDIT_GROUPS = 12;
const MAX_NAMES_PER_CREDIT = 20;
const MAX_GENRES = 12;

type UnknownRecord = Record<string, unknown>;

export class GeniusContextHttpError extends Error {
  public readonly status: number;
  public readonly code: GeniusContextErrorCode;
  public readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: GeniusContextErrorCode,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GeniusContextHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanInlineText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

export function sanitizePlainText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

export function sanitizeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeGeniusUrl(value: unknown): string | undefined {
  const url = sanitizeHttpsUrl(value);

  if (!url) {
    return undefined;
  }

  const host = new URL(url).hostname.toLowerCase();

  return host === "genius.com" || host.endsWith(".genius.com")
    ? url
    : undefined;
}

export function parseGeniusContextRequest(value: unknown): GeniusContextRequest {
  if (!isRecord(value)) {
    throw new GeniusContextHttpError(400, "bad_request", "A JSON object is required.");
  }

  const allowedKeys = new Set([
    "title",
    "artist",
    "album",
    "releaseDate",
    "geniusSongId",
  ]);

  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new GeniusContextHttpError(400, "bad_request", "The request contains unsupported fields.");
  }

  const title = cleanInlineText(value.title, MAX_TEXT_LENGTH);
  const artist = cleanInlineText(value.artist, MAX_TEXT_LENGTH);

  if (!title || !artist) {
    throw new GeniusContextHttpError(400, "bad_request", "Song title and artist are required.");
  }

  const album = cleanInlineText(value.album, MAX_TEXT_LENGTH);
  const releaseDate = cleanInlineText(value.releaseDate, 40);
  const geniusSongId = value.geniusSongId;

  if (
    geniusSongId !== undefined &&
    (!Number.isSafeInteger(geniusSongId) || Number(geniusSongId) <= 0)
  ) {
    throw new GeniusContextHttpError(400, "bad_request", "geniusSongId must be a positive integer.");
  }

  return {
    title,
    artist,
    ...(album ? { album } : {}),
    ...(releaseDate ? { releaseDate } : {}),
    ...(geniusSongId !== undefined ? { geniusSongId: Number(geniusSongId) } : {}),
  };
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getPrimaryArtistName(song: UnknownRecord): string {
  return isRecord(song.primary_artist)
    ? cleanInlineText(song.primary_artist.name, MAX_TEXT_LENGTH) ?? ""
    : "";
}

function searchScore(result: UnknownRecord, request: GeniusContextRequest): number {
  const title = cleanInlineText(result.title, MAX_TEXT_LENGTH) ?? "";
  const artist = getPrimaryArtistName(result);
  const requestedTitle = normalizeIdentity(request.title);
  const requestedArtist = normalizeIdentity(request.artist);
  const resultTitle = normalizeIdentity(title);
  const resultArtist = normalizeIdentity(artist);

  let score = 0;

  if (resultTitle === requestedTitle) {
    score += 100;
  } else if (resultTitle.includes(requestedTitle) || requestedTitle.includes(resultTitle)) {
    score += 45;
  }

  if (resultArtist === requestedArtist) {
    score += 80;
  } else if (resultArtist.includes(requestedArtist) || requestedArtist.includes(resultArtist)) {
    score += 35;
  }

  return score;
}

export function selectBestSearchSong(
  searchPayload: unknown,
  request: GeniusContextRequest,
): UnknownRecord | undefined {
  if (!isRecord(searchPayload) || !isRecord(searchPayload.response)) {
    return undefined;
  }

  const hits = Array.isArray(searchPayload.response.hits)
    ? searchPayload.response.hits.slice(0, 10)
    : [];

  const ranked = hits
    .map((hit, index) => {
      const result = isRecord(hit) && isRecord(hit.result) ? hit.result : undefined;
      return result
        ? { result, score: searchScore(result, request), index }
        : undefined;
    })
    .filter((entry): entry is { result: UnknownRecord; score: number; index: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return ranked[0]?.score && ranked[0].score >= 80 ? ranked[0].result : undefined;
}

function getArtistNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .slice(0, MAX_NAMES_PER_CREDIT)
        .map((artist) => isRecord(artist) ? cleanInlineText(artist.name, MAX_TEXT_LENGTH) : undefined)
        .filter((name): name is string => Boolean(name)),
    ),
  );
}

function getGenres(song: UnknownRecord): string[] {
  const candidates: unknown[] = [
    ...(Array.isArray(song.tags) ? song.tags : []),
    song.primary_tag,
    ...(isRecord(song.primary_artist) && Array.isArray(song.primary_artist.genres)
      ? song.primary_artist.genres
      : []),
  ];
  return Array.from(new Set(candidates
    .map((value) => isRecord(value) ? cleanInlineText(value.name, 80) : cleanInlineText(value, 80))
    .filter((value): value is string => Boolean(value))))
    .slice(0, MAX_GENRES);
}

function getCredits(song: UnknownRecord): GeniusCreditGroup[] {
  const credits: GeniusCreditGroup[] = [];
  const append = (label: string, names: string[]) => {
    if (names.length && credits.length < MAX_CREDIT_GROUPS) {
      credits.push({ label, names });
    }
  };

  append("Written by", getArtistNames(song.writer_artists));
  append("Produced by", getArtistNames(song.producer_artists));
  append("Featuring", getArtistNames(song.featured_artists));

  if (Array.isArray(song.custom_performances)) {
    for (const performance of song.custom_performances.slice(0, MAX_CREDIT_GROUPS)) {
      if (!isRecord(performance)) {
        continue;
      }

      const label = cleanInlineText(performance.label, 80);
      const names = getArtistNames(performance.artists);

      if (label) {
        append(label, names);
      }
    }
  }

  return credits;
}

function getAnnotations(referentsPayload: unknown): GeniusAnnotationSummary[] {
  if (!isRecord(referentsPayload) || !isRecord(referentsPayload.response)) {
    return [];
  }

  const referents = Array.isArray(referentsPayload.response.referents)
    ? referentsPayload.response.referents
    : [];
  const annotations: GeniusAnnotationSummary[] = [];
  const seen = new Set<number>();

  for (const referent of referents) {
    if (!isRecord(referent) || !Array.isArray(referent.annotations)) {
      continue;
    }

    for (const annotation of referent.annotations) {
      if (!isRecord(annotation) || annotations.length >= MAX_ANNOTATIONS) {
        break;
      }

      const id = Number(annotation.id);
      const body = isRecord(annotation.body)
        ? sanitizePlainText(annotation.body.plain, MAX_ANNOTATION_LENGTH)
        : undefined;

      if (!Number.isSafeInteger(id) || id <= 0 || !body || seen.has(id)) {
        continue;
      }

      seen.add(id);
      const votesTotal = Number(annotation.votes_total);
      const geniusUrl = sanitizeGeniusUrl(annotation.url);

      annotations.push({
        id,
        body,
        verified: annotation.verified === true,
        ...(Number.isSafeInteger(votesTotal) ? { votesTotal } : {}),
        ...(geniusUrl ? { geniusUrl } : {}),
      });
    }

    if (annotations.length >= MAX_ANNOTATIONS) {
      break;
    }
  }

  return annotations;
}

function getMedia(song: UnknownRecord): GeniusMediaLink[] {
  if (!Array.isArray(song.media)) {
    return [];
  }

  const media: GeniusMediaLink[] = [];
  const seen = new Set<string>();

  for (const item of song.media.slice(0, MAX_MEDIA_LINKS * 2)) {
    if (!isRecord(item)) {
      continue;
    }

    const provider = cleanInlineText(item.provider, 60);
    const url = sanitizeHttpsUrl(item.url);

    if (provider && url && !seen.has(url)) {
      seen.add(url);
      media.push({ provider, url });
    }

    if (media.length >= MAX_MEDIA_LINKS) {
      break;
    }
  }

  return media;
}

function getSongFromPayload(songPayload: unknown): UnknownRecord | undefined {
  return isRecord(songPayload) && isRecord(songPayload.response) && isRecord(songPayload.response.song)
    ? songPayload.response.song
    : undefined;
}

export function normalizeGeniusContext(
  songPayload: unknown,
  referentsPayload: unknown,
  request: GeniusContextRequest,
  fetchedAt: string,
): GeniusContextResponse {
  const song = getSongFromPayload(songPayload);

  if (!song) {
    throw new GeniusContextHttpError(502, "provider_unavailable", "Genius returned an invalid song response.");
  }

  const id = Number(song.id);
  const title = cleanInlineText(song.title, MAX_TEXT_LENGTH);
  const artist = getPrimaryArtistName(song);
  const geniusUrl = sanitizeGeniusUrl(song.url);

  if (!Number.isSafeInteger(id) || id <= 0 || !title || !artist || !geniusUrl) {
    throw new GeniusContextHttpError(502, "provider_unavailable", "Genius returned incomplete song identity data.");
  }

  const resultTitle = normalizeIdentity(title);
  const resultArtist = normalizeIdentity(artist);
  const exact = resultTitle === normalizeIdentity(request.title) && resultArtist === normalizeIdentity(request.artist);
  const album = isRecord(song.album)
    ? cleanInlineText(song.album.name, MAX_TEXT_LENGTH)
    : undefined;
  const releaseDate = cleanInlineText(
    song.release_date_for_display ?? song.release_date,
    40,
  );
  const artworkUrl = sanitizeHttpsUrl(
    song.song_art_image_url ?? song.header_image_url,
  );
  const description = isRecord(song.description)
    ? sanitizePlainText(song.description.plain, MAX_DESCRIPTION_LENGTH)
    : undefined;
  const pageviews = isRecord(song.stats) ? Number(song.stats.pageviews) : Number.NaN;
  const artistUrl = isRecord(song.primary_artist)
    ? sanitizeGeniusUrl(song.primary_artist.url)
    : undefined;
  const media = getMedia(song);
  const genres = getGenres(song);

  return {
    provider: GENIUS_PROVIDER,
    attribution: GENIUS_ATTRIBUTION,
    song: {
      id,
      title,
      artist,
      ...(album ? { album } : {}),
      ...(releaseDate ? { releaseDate } : {}),
      ...(artworkUrl ? { artworkUrl } : {}),
      geniusUrl,
      ...(description ? { description } : {}),
      ...(genres.length ? { genres } : {}),
      matchConfidence: request.geniusSongId ? "provider-id" : exact ? "exact" : "likely",
      credits: getCredits(song),
      annotations: getAnnotations(referentsPayload),
      ...(Number.isSafeInteger(pageviews) && pageviews >= 0
        ? { popularity: { pageviews } }
        : {}),
      media,
      links: [
        { label: "Open song on Genius", url: geniusUrl },
        ...(artistUrl ? [{ label: "Open artist on Genius", url: artistUrl }] : []),
      ],
    },
    fetchedAt,
  };
}
