export const DEFAULT_CANAL_PUBLIC_ORIGIN =
  "https://canal.app";

const PUBLIC_RESOURCE_PATTERN =
  /^\/(scenes|snapshots)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/iu;

const PUBLIC_STAGE_PATTERN =
  /^\/stages\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/join\/?$/iu;

const OPAQUE_INVITE_PATTERN =
  /^[A-Za-z0-9_-]{43}$/u;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const SOUNDSCAPE_PERIOD_KEY_PATTERN =
  /^(?:\d{4}|\d{4}-(?:winter|spring|summer|fall))$/u;

export type PublicDestination =
  | `/scenes/${string}`
  | `/snapshots/${string}`
  | `/stages/${string}/join?invite=${string}`
  | `/public-soundscape?ownerId=${string}&periodKind=${"year" | "season"}&periodKey=${string}`;

export type PublicRouteParams = Readonly<{
  invite?: string;
  sceneId?: string;
  snapshotId?: string;
  stageId?: string;
  ownerId?: string;
  periodKind?: string;
  periodKey?: string;
}>;

export function canalPublicOrigin(): string {
  const configured =
    process.env.EXPO_PUBLIC_CANAL_WEB_URL?.trim();

  if (!configured) {
    return DEFAULT_CANAL_PUBLIC_ORIGIN;
  }

  try {
    const url = new URL(configured);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return DEFAULT_CANAL_PUBLIC_ORIGIN;
    }

    return url.origin;
  } catch {
    return DEFAULT_CANAL_PUBLIC_ORIGIN;
  }
}

function publicPathFromInput(input: string): string | null {
  const value = input.trim();

  if (!value || value.length > 2048) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "https:") {
      if (
        url.origin !== canalPublicOrigin() ||
        url.hash
      ) {
        return null;
      }

      return `${url.pathname}${url.search}`;
    }

    if (url.protocol === "canal:") {
      if (url.hash) {
        return null;
      }

      const route = [
        url.hostname,
        ...url.pathname.split("/").filter(Boolean),
      ].filter(Boolean).join("/");

      return `/${route}${url.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function parsePublicDestination(
  input: string,
): PublicDestination | null {
  const path = publicPathFromInput(input);

  if (!path) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(path, DEFAULT_CANAL_PUBLIC_ORIGIN);
  } catch {
    return null;
  }

  const resourceMatch = url.pathname.match(
    PUBLIC_RESOURCE_PATTERN,
  );

  if (resourceMatch) {
    if (url.search || url.hash) {
      return null;
    }

    const [, resource, id] = resourceMatch;
    return `/${resource.toLowerCase()}/${id.toLowerCase()}` as PublicDestination;
  }

  const stageMatch = url.pathname.match(
    PUBLIC_STAGE_PATTERN,
  );

  if (url.pathname === "/public-soundscape" && !url.hash) {
    const ownerId = url.searchParams.get("ownerId") ?? "";
    const periodKind = url.searchParams.get("periodKind") ?? "";
    const periodKey = url.searchParams.get("periodKey") ?? "";
    const keys = Array.from(url.searchParams.keys());
    const kindMatchesKey = periodKind === "year"
      ? /^\d{4}$/u.test(periodKey)
      : periodKind === "season" && /^\d{4}-(?:winter|spring|summer|fall)$/u.test(periodKey);
    if (
      UUID_PATTERN.test(ownerId) &&
      SOUNDSCAPE_PERIOD_KEY_PATTERN.test(periodKey) &&
      kindMatchesKey &&
      keys.length === 3 &&
      keys.every((key) => ["ownerId", "periodKind", "periodKey"].includes(key))
    ) {
      return `/public-soundscape?ownerId=${ownerId.toLowerCase()}&periodKind=${periodKind}&periodKey=${periodKey}` as PublicDestination;
    }
    return null;
  }

  if (!stageMatch || url.hash) {
    return null;
  }

  const invite = url.searchParams.get("invite");

  if (
    !invite ||
    !OPAQUE_INVITE_PATTERN.test(invite) ||
    Array.from(url.searchParams.keys()).some(
      (key) => key !== "invite",
    )
  ) {
    return null;
  }

  return `/stages/${stageMatch[1].toLowerCase()}/join?invite=${encodeURIComponent(invite)}`;
}

export function publicDestinationFromRoute(
  rootSegment: string | undefined,
  params: PublicRouteParams,
): PublicDestination | null {
  if (
    rootSegment === "scenes" &&
    typeof params.sceneId === "string"
  ) {
    return parsePublicDestination(
      `/scenes/${params.sceneId}`,
    );
  }

  if (
    rootSegment === "snapshots" &&
    typeof params.snapshotId === "string"
  ) {
    return parsePublicDestination(
      `/snapshots/${params.snapshotId}`,
    );
  }

  if (
    rootSegment === "stages" &&
    typeof params.stageId === "string" &&
    typeof params.invite === "string"
  ) {
    return parsePublicDestination(
      `/stages/${params.stageId}/join?invite=${encodeURIComponent(params.invite)}`,
    );
  }

  if (
    rootSegment === "public-soundscape" &&
    typeof params.ownerId === "string" &&
    typeof params.periodKind === "string" &&
    typeof params.periodKey === "string"
  ) {
    return parsePublicDestination(
      `/public-soundscape?ownerId=${encodeURIComponent(params.ownerId)}&periodKind=${encodeURIComponent(params.periodKind)}&periodKey=${encodeURIComponent(params.periodKey)}`,
    );
  }

  return null;
}

export function publicDestinationUrl(
  destination: PublicDestination,
): string {
  const safeDestination = parsePublicDestination(destination);

  if (!safeDestination) {
    throw new Error("Canal refused an unsafe public destination.");
  }

  return new URL(
    safeDestination,
    `${canalPublicOrigin()}/`,
  ).toString();
}
