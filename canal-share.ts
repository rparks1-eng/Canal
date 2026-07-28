import {
  Platform,
  Share,
} from "react-native";

type ShareMethod =
  | "share"
  | "clipboard"
  | "cancelled";

export type CanalShareResult = {
  method: ShareMethod;
};

export type ShareSceneInput = {
  id: string;
  name: string;
  activity?: string;
  duration?: string;
  emotions?: string;
  genres?: string;
  energy?: string;
  artists?: string;
  visibility?:
    | "public"
    | "private";

  tracks?: {
    title: string;
    artist: string;
    spotifyUrl?: string;
  }[];
};

export type ShareSoundscapeInput = {
  username: string;
  displayName: string;
  bio?: string;
  genres?: string[];
  favoriteArtists?: string[];
  visibility?:
    | "public"
    | "private";
};

export type ShareSnapshotInput = {
  id: string;
  sceneName: string;
  trackTitle?: string;
  trackArtist?: string;
  note?: string;
  mood?: string;
  visibility?:
    | "public"
    | "private";
  spotifyUrl?: string;
};

type WebNavigator = {
  share?: (data: {
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<void>;

  clipboard?: {
    writeText: (
      value: string,
    ) => Promise<void>;
  };
};

export async function shareScene(
  scene: ShareSceneInput,
): Promise<CanalShareResult> {
  const url =
    buildCanalUrl(
      `/scene/${scene.id}`,
    );

  const trackLines =
    (scene.tracks ?? [])
      .slice(0, 5)
      .map(
        (track, index) =>
          `${index + 1}. ${track.title} - ${track.artist}`,
      );

  const message = [
    `${scene.name} on Canal`,
    "",
    scene.activity
      ? `Moment: ${scene.activity}`
      : "",

    scene.duration
      ? `Duration: ${scene.duration}`
      : "",

    scene.emotions
      ? `Feel: ${scene.emotions}`
      : "",

    scene.genres
      ? `Genres: ${scene.genres}`
      : "",

    scene.artists
      ? `Artists: ${scene.artists}`
      : "",

    scene.visibility
      ? `Visibility: ${capitalize(
          scene.visibility,
        )}`
      : "",

    trackLines.length > 0
      ? ""
      : "",

    ...trackLines,
  ]
    .filter(
      (line) =>
        line !== undefined,
    )
    .join("\n")
    .trim();

  return shareContent({
    title: scene.name,
    message,
    url,
  });
}

export async function shareSoundscape(
  profile: ShareSoundscapeInput,
): Promise<CanalShareResult> {
  const url =
    buildCanalUrl(
      `/soundscape/${profile.username}`,
    );

  const message = [
    `${profile.displayName}'s Soundscape on Canal`,
    `@${profile.username}`,
    "",

    profile.bio ?? "",

    profile.genres?.length
      ? `Genres: ${profile.genres.join(
          ", ",
        )}`
      : "",

    profile.favoriteArtists
      ?.length
      ? `Favorite artists: ${profile.favoriteArtists.join(
          ", ",
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return shareContent({
    title:
      `${profile.displayName}'s Soundscape`,
    message,
    url,
  });
}

export async function shareSnapshot(
  snapshot: ShareSnapshotInput,
): Promise<CanalShareResult> {
  const url =
    buildCanalUrl(
      `/snapshot/${snapshot.id}`,
    );

  const message = [
    `Snapshot from ${snapshot.sceneName}`,
    "",

    snapshot.trackTitle
      ? `${snapshot.trackTitle}${
          snapshot.trackArtist
            ? ` - ${snapshot.trackArtist}`
            : ""
        }`
      : "Scene moment",

    snapshot.mood
      ? `Mood: ${snapshot.mood}`
      : "",

    snapshot.note
      ? `Note: ${snapshot.note}`
      : "",

    snapshot.spotifyUrl
      ? `Spotify: ${snapshot.spotifyUrl}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return shareContent({
    title:
      `Snapshot from ${snapshot.sceneName}`,
    message,
    url,
  });
}

async function shareContent({
  title,
  message,
  url,
}: {
  title: string;
  message: string;
  url?: string;
}): Promise<CanalShareResult> {
  const completeMessage =
    url
      ? `${message}\n\n${url}`
      : message;

  if (Platform.OS !== "web") {
    const result =
      await Share.share({
        title,
        message:
          completeMessage,
        url,
      });

    return {
      method:
        result.action ===
        Share.dismissedAction
          ? "cancelled"
          : "share",
    };
  }

  const webNavigator = (
    globalThis as unknown as {
      navigator?: WebNavigator;
    }
  ).navigator;

  if (webNavigator?.share) {
    try {
      await webNavigator.share({
        title,
        text: message,
        url,
      });

      return {
        method: "share",
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        return {
          method:
            "cancelled",
        };
      }
    }
  }

  if (
    webNavigator?.clipboard
  ) {
    await webNavigator.clipboard.writeText(
      completeMessage,
    );

    return {
      method: "clipboard",
    };
  }

  throw new Error(
    "Sharing is not available on this device.",
  );
}

function buildCanalUrl(
  path: string,
): string | undefined {
  const baseUrl =
    process.env
      .EXPO_PUBLIC_CANAL_SHARE_BASE_URL?.replace(
        /\/+$/,
        "",
      );

  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl}${path}`;
}

function capitalize(
  value: string,
): string {
  if (!value) {
    return value;
  }

  return (
    value
      .charAt(0)
      .toUpperCase() +
    value.slice(1)
  );
}