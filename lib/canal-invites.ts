import {
    Platform,
    Share,
} from "react-native";

import {
  LiveStage,
  readLiveStage,
} from "./live-stages";

export type InviteShareResult = {
  method:
    | "share"
    | "clipboard"
    | "cancelled";
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

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STAGE_CODE_PATTERN =
  /^\d{6}$/;

const SHARE_CONFIGURATION_ERROR =
  "Canal sharing is temporarily unavailable. Please try again later.";

export async function shareCanalInvite(): Promise<InviteShareResult> {
  const baseUrl =
    getShareBaseUrl();

  const message = [
    "Join me on Canal.",
    "",
    "Canal helps people create music Scenes, collaborate in live Stages, and share their Soundscapes.",
    "",
    baseUrl
      ? baseUrl
      : "The Canal prototype is currently shared directly from the app.",
  ].join("\n");

  return shareInviteContent({
    title: "Join me on Canal",
    message,
    url: baseUrl,
  });
}

export async function shareStageInvite(
  stage: LiveStage,
): Promise<InviteShareResult> {
  const shareableStage =
    await validateShareableStage(
      stage,
    );

  const stageUrl =
    buildStageUrl(
      shareableStage.id,
      shareableStage.code,
    );

  const currentTrack =
    shareableStage.tracks[
      shareableStage
        .currentTrackIndex
    ];

  const message = [
    `Join my Canal Stage: ${shareableStage.name}`,
    "",
    `Stage code: ${shareableStage.code}`,
    `Hosted by ${shareableStage.hostName}`,
    shareableStage.activity,
    currentTrack
      ? `Now playing: ${currentTrack.title} by ${currentTrack.artist}`
      : "",
    "",
    "Open Canal and choose Join a Stage, then enter the code.",
  ]
    .filter(Boolean)
    .join("\n");

  return shareInviteContent({
    title:
      shareableStage.name,
    message,
    url: stageUrl,
  });
}

async function shareInviteContent({
  title,
  message,
  url,
}: {
  title: string;
  message: string;
  url?: string;
}): Promise<InviteShareResult> {
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
          method: "cancelled",
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
    "Sharing is not available in this browser.",
  );
}

function getShareBaseUrl(): string {
  const configuredBaseUrl = (
    process.env
      .EXPO_PUBLIC_CANAL_SHARE_BASE_URL ??
    ""
  ).trim();

  if (!configuredBaseUrl) {
    return "";
  }

  try {
    const parsedUrl =
      new URL(
        configuredBaseUrl,
      );

    if (
      parsedUrl.protocol !==
        "https:" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash ||
      configuredBaseUrl.includes(
        "?",
      ) ||
      configuredBaseUrl.includes(
        "#",
      )
    ) {
      throw new Error(
        SHARE_CONFIGURATION_ERROR,
      );
    }

    const normalizedPath =
      parsedUrl.pathname.replace(
        /\/+$/,
        "",
      );

    const normalizedOrigin =
      `${parsedUrl.protocol}//` +
      parsedUrl.host.toLowerCase();

    return (
      normalizedOrigin +
      (
        normalizedPath ===
        "/"
          ? ""
          : normalizedPath
      )
    );
  } catch {
    throw new Error(
      SHARE_CONFIGURATION_ERROR,
    );
  }
}

function buildStageUrl(
  stageId: string,
  stageCode: string,
): string | undefined {
  const baseUrl =
    getShareBaseUrl();

  if (!baseUrl) {
    return undefined;
  }

  return (
    `${baseUrl}/live-stage/` +
    `${encodeURIComponent(stageId)}` +
    `?code=${encodeURIComponent(stageCode)}`
  );
}

async function validateShareableStage(
  stage: LiveStage,
): Promise<LiveStage> {
  if (!stage.membershipRole) {
    throw new Error(
      "Join this Stage before sharing its invite.",
    );
  }

  if (
    stage.status !==
    "live"
  ) {
    throw new Error(
      "Only live Stages can be shared.",
    );
  }

  if (
    !CANONICAL_UUID_PATTERN.test(
      stage.id,
    ) ||
    !STAGE_CODE_PATTERN.test(
      stage.code,
    ) ||
    !STAGE_CODE_PATTERN.test(
      stage.stageCode,
    ) ||
    stage.code !==
      stage.stageCode
  ) {
    throw new Error(
      "This Stage invite is unavailable. Refresh the Stage and try again.",
    );
  }

  const currentStage =
    await readLiveStage(
      stage.id,
    );

  if (
    !currentStage ||
    currentStage.id !==
      stage.id ||
    currentStage.status !==
      "live" ||
    !currentStage
      .membershipRole ||
    currentStage.code !==
      stage.code ||
    currentStage.stageCode !==
      stage.stageCode
  ) {
    throw new Error(
      "Join this Stage before sharing its invite.",
    );
  }

  return currentStage;
}
