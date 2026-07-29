import {
  getSpotifyCachedJson,
} from "./spotify-cache";

export type SpotifyArtistSelection = {
  id: string;
  name: string;
  uri?: string;
  spotifyUrl?: string;
  imageUrl?: string;
  genres?: string[];
  source: "spotify" | "manual";
};

type SpotifyImage = {
  url?: string;
  height?: number;
  width?: number;
};

type SpotifyArtist = {
  id?: string;
  name?: string;
  uri?: string;

  external_urls?: {
    spotify?: string;
  };

  images?: SpotifyImage[];
  genres?: string[];
};

type SpotifyArtistSearchResponse = {
  artists?: {
    items?: SpotifyArtist[];
  };
};

const ARTIST_SEARCH_LIMIT = 8;

export async function searchSpotifyArtists(
  query: string,
): Promise<SpotifyArtistSelection[]> {
  const cleanedQuery =
    query.trim();

  if (cleanedQuery.length < 1) {
    return [];
  }

  const path =
    `/search?q=${encodeURIComponent(
      cleanedQuery,
    )}&type=artist&limit=${ARTIST_SEARCH_LIMIT}`;

  const response =
    await getSpotifyCachedJson<SpotifyArtistSearchResponse>(
      path,
      {
        fallbackTtlMs:
          15 * 60 * 1000,
      },
    );

  return (
    response.artists?.items ?? []
  )
    .map(normalizeSpotifyArtist)
    .filter(
      (
        artist,
      ): artist is SpotifyArtistSelection =>
        artist !== null,
    );
}

export function createManualArtist(
  name: string,
): SpotifyArtistSelection {
  const cleanedName =
    name.trim();

  return {
    id: `manual-${cleanedName
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )}-${Date.now()}`,

    name: cleanedName,
    source: "manual",
  };
}

export function serializeArtistSelections(
  selections:
    SpotifyArtistSelection[],
): string {
  return JSON.stringify(
    selections.map((selection) => ({
      id: selection.id,
      name: selection.name,
      uri: selection.uri,
      spotifyUrl:
        selection.spotifyUrl,
      imageUrl:
        selection.imageUrl,
      genres:
        selection.genres ?? [],
      source:
        selection.source,
    })),
  );
}

export function parseArtistSelections(
  value:
    | string
    | undefined,
): SpotifyArtistSelection[] {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsedValue: unknown =
      JSON.parse(value);

    if (!Array.isArray(parsedValue)) {
      return parseManualArtistNames(
        value,
      );
    }

    return parsedValue
      .map(normalizeArtistSelection)
      .filter(
        (
          artist,
        ): artist is SpotifyArtistSelection =>
          artist !== null,
      );
  } catch {
    return parseManualArtistNames(
      value,
    );
  }
}

export function getArtistNames(
  selections:
    SpotifyArtistSelection[],
): string {
  return selections
    .map(
      (selection) =>
        selection.name,
    )
    .filter(Boolean)
    .join(", ");
}

export function mergeArtistSelections(
  selections:
    SpotifyArtistSelection[],
): SpotifyArtistSelection[] {
  const uniqueArtists =
    new Map<
      string,
      SpotifyArtistSelection
    >();

  for (const selection of selections) {
    const key =
      selection.source ===
        "spotify" &&
      selection.id
        ? `spotify:${selection.id}`
        : `manual:${selection.name
            .trim()
            .toLowerCase()}`;

    if (!uniqueArtists.has(key)) {
      uniqueArtists.set(
        key,
        selection,
      );
    }
  }

  return Array.from(
    uniqueArtists.values(),
  );
}

function normalizeSpotifyArtist(
  value: SpotifyArtist,
): SpotifyArtistSelection | null {
  const id =
    value.id?.trim();

  const name =
    value.name?.trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    uri: value.uri,
    spotifyUrl:
      value.external_urls
        ?.spotify,
    imageUrl:
      value.images?.[0]?.url,
    genres:
      value.genres ?? [],
    source: "spotify",
  };
}

function normalizeArtistSelection(
  value: unknown,
): SpotifyArtistSelection | null {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return null;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const name =
    readString(record.name);

  if (!name) {
    return null;
  }

  const source =
    record.source === "spotify"
      ? "spotify"
      : "manual";

  return {
    id:
      readString(record.id) ||
      `manual-${name
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-",
        )}`,

    name,

    uri:
      readOptionalString(
        record.uri,
      ),

    spotifyUrl:
      readOptionalString(
        record.spotifyUrl,
      ),

    imageUrl:
      readOptionalString(
        record.imageUrl,
      ),

    genres:
      readStringArray(
        record.genres,
      ),

    source,
  };
}

function parseManualArtistNames(
  value: string,
): SpotifyArtistSelection[] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map(createManualArtist);
}

function readStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is string =>
      typeof item ===
      "string",
  );
}

function readString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function readOptionalString(
  value: unknown,
): string | undefined {
  const cleanedValue =
    readString(value);

  return cleanedValue ||
    undefined;
}
