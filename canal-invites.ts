import {
    Platform,
    Share,
} from "react-native";

import {
    LiveStage,
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
  const stageUrl =
    buildStageUrl(stage.id);

  const currentTrack =
    stage.tracks[
      stage.currentTrackIndex
    ];

  const message = [
    `Join my Canal Stage: ${stage.name}`,
    "",
    `Stage code: ${stage.code}`,
    `Hosted by ${stage.hostName}`,
    stage.activity,
    currentTrack
      ? `Now playing: ${currentTrack.title} by ${currentTrack.artist}`
      : "",
    "",
    "Open Canal and choose Join a Stage, then enter the code.",
  ]
    .filter(Boolean)
    .join("\n");

  return shareInviteContent({
    title: stage.name,
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
  return (
    process.env
      .EXPO_PUBLIC_CANAL_SHARE_BASE_URL ??
    ""
  ).replace(/\/+$/, "");
}

function buildStageUrl(
  stageId: string,
): string | undefined {
  const baseUrl =
    getShareBaseUrl();

  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl}/live-stage/${stageId}`;
}