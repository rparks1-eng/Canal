import {
  APPLE_MUSIC_ACCOUNT_SETUP_MESSAGE,
  AppleMusicAccountSetupRequiredError,
  isAppleMusicAccountSetupRequiredError,
  normalizeAppleMusicConnectionError,
} from "../lib/apple-music-errors";

describe("Apple Music account recovery", () => {
  it.each([
    "MusicSubscription.Error.privacyAcknowledgementRequired",
    "Privacy acknowledgement required",
    "MusicTokenRequestError.userNotSignedIn",
    "User not signed in",
  ])("turns Apple account setup failures into an actionable error: %s", (message) => {
    const normalized =
      normalizeAppleMusicConnectionError(new Error(message));

    expect(normalized).toBeInstanceOf(AppleMusicAccountSetupRequiredError);
    expect(isAppleMusicAccountSetupRequiredError(normalized)).toBe(true);
    expect((normalized as Error).message).toBe(
      APPLE_MUSIC_ACCOUNT_SETUP_MESSAGE,
    );
  });

  it("does not rewrite unrelated provider or account-fencing failures", () => {
    const original = new Error("Canal account changed during sync");

    expect(normalizeAppleMusicConnectionError(original)).toBe(original);
    expect(isAppleMusicAccountSetupRequiredError(original)).toBe(false);
  });
});
