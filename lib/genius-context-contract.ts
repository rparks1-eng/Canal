export const GENIUS_CONTEXT_FUNCTION_NAME = "genius-context" as const;

export const GENIUS_PROVIDER = "genius" as const;

export const GENIUS_ATTRIBUTION = {
  label: "Song context from Genius",
  commercialUseRequiresLicense: true,
} as const;

export type GeniusContextRequest = {
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  geniusSongId?: number;
};

export type GeniusCreditGroup = {
  label: string;
  names: string[];
};

export type GeniusAnnotationSummary = {
  id: number;
  body: string;
  verified: boolean;
  votesTotal?: number;
  geniusUrl?: string;
};

export type GeniusMediaLink = {
  provider: string;
  url: string;
};

export type GeniusContextLink = {
  label: string;
  url: string;
};

export type GeniusSongContext = {
  id: number;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  artworkUrl?: string;
  geniusUrl: string;
  description?: string;
  matchConfidence: "exact" | "likely" | "provider-id";
  credits: GeniusCreditGroup[];
  annotations: GeniusAnnotationSummary[];
  popularity?: {
    pageviews: number;
  };
  media: GeniusMediaLink[];
  links: GeniusContextLink[];
};

export type GeniusContextResponse = {
  provider: typeof GENIUS_PROVIDER;
  attribution: typeof GENIUS_ATTRIBUTION;
  song: GeniusSongContext;
  fetchedAt: string;
};

export type GeniusContextErrorCode =
  | "bad_request"
  | "method_not_allowed"
  | "not_authenticated"
  | "not_found"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "server_misconfigured";

export type GeniusContextErrorResponse = {
  error: {
    code: GeniusContextErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
};

export function isGeniusContextResponse(
  value: unknown,
): value is GeniusContextResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GeniusContextResponse>;
  const song = candidate.song as Partial<GeniusSongContext> | undefined;

  return (
    candidate.provider === GENIUS_PROVIDER &&
    candidate.attribution?.label === GENIUS_ATTRIBUTION.label &&
    typeof candidate.fetchedAt === "string" &&
    typeof song?.id === "number" &&
    typeof song.title === "string" &&
    typeof song.artist === "string" &&
    typeof song.geniusUrl === "string" &&
    Array.isArray(song.credits) &&
    Array.isArray(song.annotations) &&
    Array.isArray(song.media) &&
    Array.isArray(song.links)
  );
}
