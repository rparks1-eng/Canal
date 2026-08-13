import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import {
  Platform,
} from "react-native";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  AUTH_CALLBACK_URL,
  getAuthCallbackUrl,
  getPasswordResetRedirectUrl,
  PASSWORD_RESET_URL,
} from "./auth-redirect";

WebBrowser.maybeCompleteAuthSession();

export {
  AUTH_CALLBACK_URL,
  PASSWORD_RESET_URL,
};

export type CanalAccountSessionGuard = {
  userId: string;
  epoch: number;
  sessionGeneration: string;
};

export type CanalAccountSessionMutation = {
  guard:
    CanalAccountSessionGuard;
  assertCurrent:
    () => Promise<void>;
  readCurrentStatus:
    () => Promise<CanalAccountSessionStatus>;
  signOutLocal:
    () => Promise<void>;
};

export type CanalAccountSessionStatus =
  | "account-changed"
  | "same-account"
  | "signed-out"
  | "unknown";

export class CanalAccountSessionChangedError extends Error {
  constructor() {
    super(
      "The Canal account changed while this action was running. Try again with the current account.",
    );

    this.name =
      "CanalAccountSessionChangedError";
  }
}

export class CanalLocalSignOutError extends Error {
  status:
    CanalAccountSessionStatus;

  constructor(
    status:
      CanalAccountSessionStatus,
    message: string,
    options: {
      cause?: unknown;
    } = {},
  ) {
    super(
      message,
      options,
    );

    this.name =
      "CanalLocalSignOutError";

    this.status =
      status;
  }
}

let sessionMutationTail:
  Promise<void> =
    Promise.resolve();

let observedSessionUserId:
  | string
  | null
  | undefined;

let observedSessionGeneration:
  | string
  | null
  | undefined;

let sessionEpoch =
  0;

function readJwtSessionId(
  accessToken:
    string | null | undefined,
): string | null {
  const payloadSegment =
    accessToken
      ?.split(".")[1];

  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized =
      payloadSegment
        .replace(
          /-/g,
          "+",
        )
        .replace(
          /_/g,
          "/",
        )
        .padEnd(
          Math.ceil(
            payloadSegment.length /
              4,
          ) * 4,
          "=",
        );

    const payload =
      JSON.parse(
        globalThis.atob(
          normalized,
        ),
      ) as {
        session_id?: unknown;
      };

    return (
      typeof payload.session_id ===
        "string" &&
      payload.session_id.trim()
    )
      ? payload.session_id.trim()
      : null;
  } catch {
    return null;
  }
}

export function readCanalAccountSessionGeneration(
  session:
    Session | null,
): string | null {
  if (!session) {
    return null;
  }

  const sessionId =
    readJwtSessionId(
      session.access_token,
    );

  if (sessionId) {
    return `session:${sessionId}`;
  }

  const lastSignInAt =
    session.user
      .last_sign_in_at
      ?.trim();

  return lastSignInAt
    ? `signed-in:${lastSignInAt}`
    : null;
}

async function queueCanalSessionMutation<
  Result,
>(
  mutation:
    () => Promise<Result>,
): Promise<Result> {
  const previousMutation =
    sessionMutationTail;

  let releaseMutation:
    () => void =
      () => {};

  sessionMutationTail =
    new Promise<void>(
      (resolve) => {
        releaseMutation =
          resolve;
      },
    );

  await previousMutation;

  try {
    return await mutation();
  } finally {
    releaseMutation();
  }
}

export function recordCanalAccountSession(
  userId:
    string | null,
  stableSessionGeneration?:
    string | null,
): number {
  const normalizedUserId =
    userId?.trim() ||
    null;

  const normalizedGeneration =
    normalizedUserId
      ? (
          stableSessionGeneration
            ?.trim() ||
          (
            observedSessionUserId ===
              normalizedUserId
              ? observedSessionGeneration
              : null
          ) ||
          `process:${sessionEpoch + 1}`
        )
      : null;

  if (
    observedSessionUserId ===
    undefined ||
    observedSessionUserId !==
      normalizedUserId ||
    observedSessionGeneration !==
      normalizedGeneration
  ) {
    observedSessionUserId =
      normalizedUserId;

    observedSessionGeneration =
      normalizedGeneration;

    sessionEpoch +=
      1;
  }

  return sessionEpoch;
}

export function getCanalAccountSessionEpoch(): number {
  return sessionEpoch;
}

export function getCanalAccountSessionGeneration(): string {
  if (
    !observedSessionUserId ||
    !observedSessionGeneration
  ) {
    throw new Error(
      "Canal cannot identify the current account session generation.",
    );
  }

  return observedSessionGeneration;
}

async function readCurrentCanalSessionSnapshot(): Promise<{
  userId: string | null;
  epoch: number;
  sessionGeneration:
    string | null;
}> {
  const {
    data: {
      session,
    },
    error,
  } =
    await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const userId =
    session?.user.id?.trim();

  const normalizedUserId =
    userId ||
    null;

  recordCanalAccountSession(
    normalizedUserId,
    readCanalAccountSessionGeneration(
      session,
    ),
  );

  return {
    userId:
      normalizedUserId,
    epoch:
      sessionEpoch,
    sessionGeneration:
      observedSessionGeneration ??
      null,
  };
}

async function captureCanalAccountSessionGuardUnlocked(): Promise<
  CanalAccountSessionGuard
> {
  const snapshot =
    await readCurrentCanalSessionSnapshot();

  if (!snapshot.userId) {
    throw new Error(
      "Sign in to Canal before changing this account's connections.",
    );
  }

  return {
    userId:
      snapshot.userId,
    epoch:
      snapshot.epoch,
    sessionGeneration:
      snapshot.sessionGeneration!,
  };
}

async function assertCanalAccountSessionGuardCurrentUnlocked(
  expected:
    CanalAccountSessionGuard,
): Promise<void> {
  const snapshot =
    await readCurrentCanalSessionSnapshot();

  if (
    snapshot.userId !==
      expected.userId ||
    snapshot.epoch !==
      expected.epoch ||
    snapshot.sessionGeneration !==
      expected.sessionGeneration
  ) {
    throw new CanalAccountSessionChangedError();
  }
}

async function readCanalAccountSessionStatusUnlocked(
  expected:
    CanalAccountSessionGuard,
): Promise<CanalAccountSessionStatus> {
  try {
    const snapshot =
      await readCurrentCanalSessionSnapshot();

    if (!snapshot.userId) {
      return "signed-out";
    }

    if (
      snapshot.userId ===
        expected.userId &&
      snapshot.epoch ===
        expected.epoch &&
      snapshot.sessionGeneration ===
        expected.sessionGeneration
    ) {
      return "same-account";
    }

    return "account-changed";
  } catch {
    return "unknown";
  }
}

function assertObservedCanalAccountSessionGuardCurrent(
  expected:
    CanalAccountSessionGuard,
): void {
  if (
    observedSessionUserId !==
      expected.userId ||
    sessionEpoch !==
      expected.epoch ||
    observedSessionGeneration !==
      expected.sessionGeneration
  ) {
    throw new CanalAccountSessionChangedError();
  }
}

async function signOutCanalAccountUnlocked(
  expected:
    CanalAccountSessionGuard,
): Promise<void> {
  await assertCanalAccountSessionGuardCurrentUnlocked(
    expected,
  );

  /*
   * The SDK call is invoked in the same synchronous turn as this
   * epoch check. Auth events update the observed epoch immediately,
   * so a queued replacement session cannot cross this boundary.
   */
  assertObservedCanalAccountSessionGuardCurrent(
    expected,
  );

  let signOutError:
    unknown =
      null;

  try {
    const {
      error,
    } =
      await supabase.auth.signOut({
        scope:
          "local",
      });

    signOutError =
      error;
  } catch (error) {
    signOutError =
      error;
  }

  const status =
    await readCanalAccountSessionStatusUnlocked(
      expected,
    );

  if (
    status ===
      "signed-out"
  ) {
    return;
  }

  if (
    status ===
      "account-changed"
  ) {
    throw new CanalAccountSessionChangedError();
  }

  if (
    status ===
      "same-account"
  ) {
    throw new CanalLocalSignOutError(
      status,
      "Spotify is disconnected, but this device is still signed in to Canal. Retry Log Out.",
      {
        cause:
          signOutError,
      },
    );
  }

  throw new CanalLocalSignOutError(
    status,
    "Spotify is disconnected, but Canal could not verify whether this device finished logging out. Check the current account before retrying.",
    {
      cause:
        signOutError,
    },
  );
}

export async function runCanalAccountSessionMutation<
  Result,
>(
  mutation:
    (
      context:
        CanalAccountSessionMutation,
    ) => Promise<Result>,
): Promise<Result> {
  return queueCanalSessionMutation(
    async () => {
      const guard =
        await captureCanalAccountSessionGuardUnlocked();

      let signOutStarted =
        false;

      return mutation({
        guard,
        assertCurrent:
          () =>
            assertCanalAccountSessionGuardCurrentUnlocked(
              guard,
            ),
        readCurrentStatus:
          () =>
            readCanalAccountSessionStatusUnlocked(
              guard,
            ),
        signOutLocal:
          async () => {
            if (signOutStarted) {
              throw new Error(
                "Canal already started this local sign-out.",
              );
            }

            signOutStarted =
              true;

            await signOutCanalAccountUnlocked(
              guard,
            );
          },
      });
    },
  );
}

export async function captureCanalAccountSessionGuard(): Promise<
  CanalAccountSessionGuard
> {
  return queueCanalSessionMutation(
    captureCanalAccountSessionGuardUnlocked,
  );
}

export async function assertCanalAccountSessionGuardCurrent(
  expected:
    CanalAccountSessionGuard,
): Promise<void> {
  return queueCanalSessionMutation(
    () =>
      assertCanalAccountSessionGuardCurrentUnlocked(
        expected,
      ),
  );
}

function safeDecode(
  value: string,
): string {
  try {
    return decodeURIComponent(
      value.replace(
        /\+/g,
        " ",
      ),
    );
  } catch {
    return value;
  }
}

function readUrlValue(
  url: URL,
  key: string,
): string | null {
  const queryValue =
    url.searchParams.get(
      key,
    );

  if (queryValue) {
    return queryValue;
  }

  const fragmentParameters =
    new URLSearchParams(
      url.hash.replace(
        /^#/,
        "",
      ),
    );

  return fragmentParameters.get(
    key,
  );
}

function readAuthError(
  url: URL,
): string | null {
  const description =
    readUrlValue(
      url,
      "error_description",
    );

  const code =
    readUrlValue(
      url,
      "error_code",
    );

  const error =
    readUrlValue(
      url,
      "error",
    );

  if (
    description ||
    error
  ) {
    const message =
      safeDecode(
        description ||
          error ||
          "Authentication failed.",
      );

    return code
      ? `${message} (${code})`
      : message;
  }

  return null;
}

export function isPasswordRecoveryUrl(
  callbackUrl: string,
): boolean {
  try {
    const url =
      new URL(
        callbackUrl,
      );

    return Boolean(
      readUrlValue(
        url,
        "code",
      ) ||
      readUrlValue(
        url,
        "access_token",
      ) ||
      readUrlValue(
        url,
        "token_hash",
      ) ||
      readUrlValue(
        url,
        "error",
      ) ||
      readUrlValue(
        url,
        "error_description",
      ),
    );
  } catch {
    return false;
  }
}

export async function completeSupabaseAuthUrl(
  callbackUrl: string,
): Promise<Session> {
  requireSupabaseConfiguration();

  let url: URL;

  try {
    url =
      new URL(
        callbackUrl,
      );
  } catch {
    throw new Error(
      "The authentication link is not a valid URL.",
    );
  }

  const authError =
    readAuthError(
      url,
    );

  if (authError) {
    throw new Error(
      authError,
    );
  }

  const code =
    readUrlValue(
      url,
      "code",
    );

  if (code) {
    const {
      data,
      error,
    } =
      await queueCanalSessionMutation(
        () =>
          supabase.auth.exchangeCodeForSession(
            code,
          ),
      );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        "Canal could not create the temporary password-recovery session.",
      );
    }

    return data.session;
  }

  const tokenHash =
    readUrlValue(
      url,
      "token_hash",
    );

  const type =
    readUrlValue(
      url,
      "type",
    );

  if (
    tokenHash &&
    type === "recovery"
  ) {
    const {
      data,
      error,
    } =
      await queueCanalSessionMutation(
        () =>
          supabase.auth.verifyOtp({
            token_hash:
              tokenHash,

            type:
              "recovery",
          }),
      );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        "Canal could not verify the password-recovery link.",
      );
    }

    return data.session;
  }

  const accessToken =
    readUrlValue(
      url,
      "access_token",
    );

  const refreshToken =
    readUrlValue(
      url,
      "refresh_token",
    );

  if (
    accessToken &&
    refreshToken
  ) {
    const {
      data,
      error,
    } =
      await queueCanalSessionMutation(
        () =>
          supabase.auth.setSession({
            access_token:
              accessToken,

            refresh_token:
              refreshToken,
          }),
      );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error(
        "Canal could not restore the temporary password-recovery session.",
      );
    }

    return data.session;
  }

  const {
    data: {
      session,
    },
  } =
    await supabase.auth.getSession();

  if (session) {
    return session;
  }

  throw new Error(
    "The password-recovery link did not contain a usable session. Request a new reset email and use the newest link.",
  );
}

export async function completePasswordRecoveryFromLink(
  recoveryLink: string,
): Promise<Session> {
  requireSupabaseConfiguration();

  const trimmedLink =
    recoveryLink.trim();

  if (!trimmedLink) {
    throw new Error(
      "Paste the complete password-reset link from the email.",
    );
  }

  if (
    trimmedLink.startsWith(
      "canal://",
    )
  ) {
    return completeSupabaseAuthUrl(
      trimmedLink,
    );
  }

  if (
    !trimmedLink.startsWith(
      "https://",
    )
  ) {
    throw new Error(
      "Paste the complete HTTPS link from the latest Supabase password-reset email.",
    );
  }

  const result =
    await WebBrowser.openAuthSessionAsync(
      trimmedLink,
      PASSWORD_RESET_URL,
    );

  if (
    result.type !==
    "success"
  ) {
    throw new Error(
      "The password-reset browser was closed before Supabase returned to Canal.",
    );
  }

  return completeSupabaseAuthUrl(
    result.url,
  );
}

export async function signUpWithEmail(
  input: {
    email: string;
    password: string;
    displayName: string;
    handle: string;
  },
): Promise<{
  session: Session | null;
  needsEmailConfirmation: boolean;
}> {
  requireSupabaseConfiguration();

  const email =
    input.email
      .trim()
      .toLowerCase();

  const displayName =
    input.displayName
      .trim()
      .slice(
        0,
        60,
      );

  const handle =
    input.handle
      .trim()
      .toLowerCase()
      .replace(
        /^@+/,
        "",
      )
      .replace(
        /[^a-z0-9_]/g,
        "",
      )
      .slice(
        0,
        24,
      );

  if (
    !email.includes(
      "@",
    )
  ) {
    throw new Error(
      "Enter a valid email address.",
    );
  }

  if (
    input.password.length <
    8
  ) {
    throw new Error(
      "Your password must contain at least eight characters.",
    );
  }

  if (!displayName) {
    throw new Error(
      "Enter a display name.",
    );
  }

  if (
    handle.length <
    3
  ) {
    throw new Error(
      "Your handle must contain at least three letters, numbers, or underscores.",
    );
  }

  const {
    data,
    error,
  } =
    await queueCanalSessionMutation(
      () =>
        supabase.auth.signUp({
          email,

          password:
            input.password,

          options: {
            emailRedirectTo:
              getAuthCallbackUrl(),

            data: {
              display_name:
                displayName,

              handle,
            },
          },
        }),
    );

  if (error) {
    throw error;
  }

  return {
    session:
      data.session,

    needsEmailConfirmation:
      !data.session,
  };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<Session> {
  requireSupabaseConfiguration();

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  if (
    !normalizedEmail.includes(
      "@",
    )
  ) {
    throw new Error(
      "Enter a valid email address.",
    );
  }

  if (!password) {
    throw new Error(
      "Enter your password.",
    );
  }

  const {
    data,
    error,
  } =
    await queueCanalSessionMutation(
      () =>
        supabase.auth.signInWithPassword({
          email:
            normalizedEmail,

          password,
        }),
    );

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error(
      "Canal could not create a session.",
    );
  }

  return data.session;
}

export async function signInWithSocial(
  provider:
    | "google"
    | "apple",
): Promise<Session | null> {
  requireSupabaseConfiguration();

  if (
    provider === "apple" &&
    Platform.OS === "ios"
  ) {
    return signInWithNativeApple();
  }

  const callbackUrl =
    getAuthCallbackUrl();

  if (Platform.OS === "web") {
    const {
      error,
    } =
      await queueCanalSessionMutation(
        () =>
          supabase.auth.signInWithOAuth({
            provider,

            options: {
              redirectTo:
                callbackUrl,
            },
          }),
      );

    if (error) {
      throw error;
    }

    // On web Supabase owns the full-page redirect. Returning null keeps the
    // caller from treating the in-progress navigation as an authenticated
    // session while avoiding popup/auth-session failures on mobile browsers.
    return null;
  }

  const {
    data,
    error,
  } =
    await queueCanalSessionMutation(
      () =>
        supabase.auth.signInWithOAuth({
          provider,

          options: {
            redirectTo:
              callbackUrl,

            skipBrowserRedirect:
              true,
          },
        }),
    );

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error(
      `${provider} sign-in did not return an authorization address.`,
    );
  }

  const result =
    await WebBrowser.openAuthSessionAsync(
      data.url,
      callbackUrl,
    );

  if (
    result.type !==
    "success"
  ) {
    throw new Error(
      `${provider} sign-in was cancelled.`,
    );
  }

  return completeSupabaseAuthUrl(
    result.url,
  );
}

async function signInWithNativeApple(): Promise<Session> {
  const available =
    await AppleAuthentication.isAvailableAsync();

  if (!available) {
    throw new Error(
      "Sign in with Apple is unavailable on this device.",
    );
  }

  const rawNonce =
    Crypto.randomUUID();
  const hashedNonce =
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

  let credential:
    AppleAuthentication.AppleAuthenticationCredential;

  try {
    credential =
      await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_REQUEST_CANCELED"
    ) {
      throw new Error(
        "Apple sign-in was cancelled.",
      );
    }

    throw error;
  }

  if (!credential.identityToken) {
    throw new Error(
      "Apple did not return a usable identity token.",
    );
  }

  const {
    data,
    error,
  } =
    await queueCanalSessionMutation(
      () =>
        supabase.auth.signInWithIdToken({
          provider: "apple",
          token:
            credential.identityToken!,
          nonce:
            rawNonce,
        }),
    );

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error(
      "Canal could not create an Apple session.",
    );
  }

  const givenName =
    credential.fullName?.givenName?.trim() ?? "";
  const familyName =
    credential.fullName?.familyName?.trim() ?? "";
  const fullName =
    [
      givenName,
      familyName,
    ]
      .filter(Boolean)
      .join(" ");

  if (fullName) {
    const {
      error:
        updateError,
    } =
      await queueCanalSessionMutation(
        () =>
          supabase.auth.updateUser({
            data: {
              full_name:
                fullName,
              ...(givenName
                ? {
                    given_name:
                      givenName,
                  }
                : {}),
              ...(familyName
                ? {
                    family_name:
                      familyName,
                  }
                : {}),
            },
          }),
      );

    if (updateError) {
      console.warn(
        "Canal signed in with Apple but could not retain the one-time Apple name:",
        updateError,
      );
    }
  }

  return data.session;
}

export async function requestPasswordReset(
  email: string,
): Promise<void> {
  requireSupabaseConfiguration();

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  if (
    !normalizedEmail.includes(
      "@",
    )
  ) {
    throw new Error(
      "Enter a valid email address.",
    );
  }

  const {
    error,
  } =
    await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo:
          getPasswordResetRedirectUrl(),
      },
    );

  if (error) {
    throw error;
  }
}

export async function updateCanalPassword(
  password: string,
): Promise<void> {
  requireSupabaseConfiguration();

  if (
    password.length <
    8
  ) {
    throw new Error(
      "Your password must contain at least eight characters.",
    );
  }

  const {
    data: {
      session,
    },
    error: sessionError,
  } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session) {
    throw new Error(
      "The temporary password-recovery session is missing. Request a new reset email and open its link before choosing a new password.",
    );
  }

  const {
    error,
  } =
    await supabase.auth.updateUser({
      password,
    });

  if (error) {
    throw error;
  }
}

export async function signOutCanalAccount(
  expected?:
    CanalAccountSessionGuard,
): Promise<void> {
  return queueCanalSessionMutation(
    async () => {
      const currentGuard =
        await captureCanalAccountSessionGuardUnlocked();

      if (
        expected &&
        (
          expected.userId !==
            currentGuard.userId ||
          expected.epoch !==
            currentGuard.epoch
        )
      ) {
        throw new CanalAccountSessionChangedError();
      }

      await signOutCanalAccountUnlocked(
        expected ??
          currentGuard,
      );
    },
  );
}
