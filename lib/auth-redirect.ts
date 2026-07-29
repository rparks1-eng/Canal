export const AUTH_CALLBACK_URL =
  "canal:///auth/callback";

export const PASSWORD_RESET_URL =
  "canal:///auth/reset-password";

export function getPasswordResetRedirectUrl(): string {
  const webOrigin =
    process.env
      .EXPO_PUBLIC_CANAL_WEB_URL
      ?.trim();

  if (webOrigin) {
    try {
      const url =
        new URL(
          "/auth/reset-password",
          webOrigin,
        );

      if (
        url.protocol ===
        "https:"
      ) {
        return url.toString();
      }
    } catch {
      // Fall through to the installed app URL.
    }
  }

  return PASSWORD_RESET_URL;
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
