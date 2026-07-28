import * as WebBrowser from "expo-web-browser";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

import {
  AUTH_CALLBACK_URL,
  getPasswordResetRedirectUrl,
  PASSWORD_RESET_URL,
} from "./auth-redirect";

WebBrowser.maybeCompleteAuthSession();

export {
  AUTH_CALLBACK_URL,
  PASSWORD_RESET_URL,
};

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
      await supabase.auth.exchangeCodeForSession(
        code,
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
      await supabase.auth.verifyOtp({
        token_hash:
          tokenHash,

        type:
          "recovery",
      });

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
      await supabase.auth.setSession({
        access_token:
          accessToken,

        refresh_token:
          refreshToken,
      });

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
    await supabase.auth.signUp({
      email,

      password:
        input.password,

      options: {
        emailRedirectTo:
          AUTH_CALLBACK_URL,

        data: {
          display_name:
            displayName,

          handle,
        },
      },
    });

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
    await supabase.auth.signInWithPassword({
      email:
        normalizedEmail,

      password,
    });

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
): Promise<Session> {
  requireSupabaseConfiguration();

  const {
    data,
    error,
  } =
    await supabase.auth.signInWithOAuth({
      provider,

      options: {
        redirectTo:
          AUTH_CALLBACK_URL,

        skipBrowserRedirect:
          true,
      },
    });

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
      AUTH_CALLBACK_URL,
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

export async function signOutCanalAccount(): Promise<void> {
  const {
    error,
  } =
    await supabase.auth.signOut({
      scope:
        "local",
    });

  if (error) {
    throw error;
  }
}
