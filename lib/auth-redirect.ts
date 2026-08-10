import {
  Platform,
} from "react-native";

import {
  canalPublicOrigin,
} from "./public-linking";

export const AUTH_CALLBACK_URL =
  "canal:///auth/callback";

export const PASSWORD_RESET_URL =
  "canal:///auth/reset-password";

export function getAuthCallbackUrl(
  platform: typeof Platform.OS | "web" = Platform.OS,
): string {
  if (platform !== "web") {
    return AUTH_CALLBACK_URL;
  }

  return new URL(
    "/auth/callback",
    `${canalPublicOrigin()}/`,
  ).toString();
}

export function getPasswordResetRedirectUrl(
  platform: typeof Platform.OS | "web" = Platform.OS,
): string {
  if (platform !== "web") {
    return PASSWORD_RESET_URL;
  }

  return new URL(
    "/auth/reset-password",
    `${canalPublicOrigin()}/`,
  ).toString();
}

export function rewriteIncomingCanalAuthPath(
  path: string,
): string {
  if (
    path.startsWith(
      "/auth/",
    )
  ) {
    return path;
  }

  try {
    const url =
      new URL(path);

    if (
      url.protocol !==
        "canal:"
    ) {
      return path;
    }

    const route =
      [
        url.hostname,
        ...url.pathname
          .split("/")
          .filter(Boolean),
      ]
        .filter(Boolean)
        .join("/");

    if (
      route ===
        "auth/reset-password" ||
      route ===
        "auth/callback"
    ) {
      return `/${route}${url.search}${url.hash}`;
    }

    return path;
  } catch {
    return path;
  }
}
