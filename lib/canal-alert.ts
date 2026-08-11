import {
  Alert as NativeAlert,
  Platform,
} from "react-native";

export type CanalAlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
  isPreferred?: boolean;
};

export type CanalAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

export type CanalAlertRequest = {
  id: number;
  title: string;
  message: string;
  buttons: CanalAlertButton[];
  options: CanalAlertOptions;
};

type CanalAlertListener = (
  request: CanalAlertRequest,
) => void;

const listeners =
  new Set<CanalAlertListener>();

let nextRequestId = 1;

export function subscribeToCanalAlerts(
  listener: CanalAlertListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function fallbackWebAlert(
  request: CanalAlertRequest,
): void {
  const webWindow =
    globalThis as unknown as {
      alert?: (message?: string) => void;
      confirm?: (message?: string) => boolean;
    };
  const copy = [
    request.title,
    request.message,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (
    request.buttons.length <= 1 ||
    !webWindow.confirm
  ) {
    webWindow.alert?.(copy);
    request.buttons[0]?.onPress?.();
    return;
  }

  const cancelButton =
    request.buttons.find(
      (button) =>
        button.style === "cancel",
    );
  const confirmButton =
    [...request.buttons]
      .reverse()
      .find(
        (button) =>
          button.style !== "cancel",
      );

  if (webWindow.confirm(copy)) {
    confirmButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
    request.options.onDismiss?.();
  }
}

export const CanalAlert = {
  alert(
    title: string,
    message = "",
    buttons: CanalAlertButton[] = [
      {
        text: "OK",
      },
    ],
    options: CanalAlertOptions = {},
  ): void {
    if (Platform.OS !== "web") {
      NativeAlert.alert(
        title,
        message,
        buttons,
        options,
      );
      return;
    }

    const request: CanalAlertRequest = {
      id: nextRequestId,
      title,
      message,
      buttons:
        buttons.length > 0
          ? buttons
          : [
              {
                text: "OK",
              },
            ],
      options,
    };

    nextRequestId += 1;

    if (listeners.size === 0) {
      fallbackWebAlert(request);
      return;
    }

    listeners.forEach(
      (listener) => {
        listener(request);
      },
    );
  },
};
