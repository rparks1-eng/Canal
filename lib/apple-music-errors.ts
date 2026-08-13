export const APPLE_MUSIC_ACCOUNT_SETUP_MESSAGE =
  "Apple Music needs you to accept Apple’s current Music privacy terms. Open Apple Music, sign in under Media & Purchases, accept the prompt, then return to Canal and connect again.";

export class AppleMusicAccountSetupRequiredError extends Error {
  readonly recoveryAction = "open-apple-music" as const;

  constructor() {
    super(APPLE_MUSIC_ACCOUNT_SETUP_MESSAGE);
    this.name = "AppleMusicAccountSetupRequiredError";
  }
}

export function isAppleMusicAccountSetupRequiredError(
  error: unknown,
): error is AppleMusicAccountSetupRequiredError {
  return (
    error instanceof AppleMusicAccountSetupRequiredError ||
    (error instanceof Error &&
      (error as Error & { recoveryAction?: unknown }).recoveryAction ===
        "open-apple-music")
  );
}

export function normalizeAppleMusicConnectionError(
  error: unknown,
): unknown {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes("privacyacknowledgementrequired") ||
    message.includes("privacy acknowledgement required") ||
    message.includes("privacy acknowledgment required") ||
    message.includes("usernotsignedin") ||
    message.includes("user not signed in")
  ) {
    return new AppleMusicAccountSetupRequiredError();
  }

  return error;
}
