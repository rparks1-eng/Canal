import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  supabase,
} from "./supabase";

const ONBOARDING_VERSION =
  "connect-shape-export-v1";

const ONBOARDING_RELEASED_AT =
  Date.parse(
    "2026-07-27T00:00:00.000Z",
  );

export const ONBOARDING_METADATA_KEY =
  "canal_onboarding_version";

const PENDING_SIGNUP_EMAIL_KEY =
  `@canal/onboarding/${ONBOARDING_VERSION}/pending-email`;

type OnboardingRecord =
  | "required"
  | "complete";

type OnboardingListener = (
  required: boolean,
) => void;

const listenersByUser =
  new Map<
    string,
    Set<OnboardingListener>
  >();

function userOnboardingKey(
  userId: string,
): string {
  return `@canal/onboarding/${ONBOARDING_VERSION}/user/${userId}`;
}

function normalizeEmail(
  email: string | null | undefined,
): string {
  return (
    email
      ?.trim()
      .toLowerCase() ??
    ""
  );
}

function notifyUser(
  userId: string,
  required: boolean,
): void {
  const listeners =
    listenersByUser.get(
      userId,
    );

  listeners?.forEach(
    (listener) => {
      listener(
        required,
      );
    },
  );
}

export async function rememberPendingSignup(
  email: string,
): Promise<void> {
  const normalizedEmail =
    normalizeEmail(
      email,
    );

  if (!normalizedEmail) {
    return;
  }

  await AsyncStorage.setItem(
    PENDING_SIGNUP_EMAIL_KEY,
    normalizedEmail,
  );
}

export async function markOnboardingRequired(
  userId: string,
): Promise<void> {
  await AsyncStorage.setItem(
    userOnboardingKey(
      userId,
    ),
    "required",
  );

  notifyUser(
    userId,
    true,
  );
}

export async function completeOnboarding(
  userId: string,
): Promise<void> {
  await AsyncStorage.setItem(
    userOnboardingKey(
      userId,
    ),
    "complete",
  );

  notifyUser(
    userId,
    false,
  );

  /*
   * Keep completion on the auth profile too, so a
   * user who changes devices does not repeat the
   * first-run flow. Local completion remains valid
   * if this best-effort sync is unavailable.
   */
  try {
    const {
      error,
    } =
      await supabase.auth.updateUser({
        data: {
          [ONBOARDING_METADATA_KEY]:
            ONBOARDING_VERSION,
        },
      });

    if (error) {
      console.warn(
        "Canal could not sync onboarding completion to the account:",
        error.message,
      );
    }
  } catch (error) {
    console.warn(
      "Canal could not sync onboarding completion to the account:",
      error,
    );
  }
}

export async function isOnboardingRequired(
  userId: string,
  email?: string | null,
  createdAt?: string | null,
  completedVersion?: unknown,
): Promise<boolean> {
  const storedRecord =
    await AsyncStorage.getItem(
      userOnboardingKey(
        userId,
      ),
    ) as
      | OnboardingRecord
      | null;

  if (
    storedRecord ===
    "complete"
  ) {
    return false;
  }

  if (
    completedVersion ===
    ONBOARDING_VERSION
  ) {
    await AsyncStorage.setItem(
      userOnboardingKey(
        userId,
      ),
      "complete",
    );

    return false;
  }

  if (
    storedRecord ===
    "required"
  ) {
    return true;
  }

  /*
   * A missing per-user record means this is an
   * existing Canal account from before onboarding
   * shipped unless the account creation timestamp
   * proves otherwise. Existing users must not be
   * forced through a first-run flow. A pending
   * email signup also identifies a new account
   * before its confirmation callback returns.
   */
  const pendingEmail =
    await AsyncStorage.getItem(
      PENDING_SIGNUP_EMAIL_KEY,
    );

  if (
    pendingEmail &&
    pendingEmail ===
      normalizeEmail(
        email,
      )
  ) {
    await Promise.all([
      AsyncStorage.setItem(
        userOnboardingKey(
          userId,
        ),
        "required",
      ),

      AsyncStorage.removeItem(
        PENDING_SIGNUP_EMAIL_KEY,
      ),
    ]);

    notifyUser(
      userId,
      true,
    );

    return true;
  }

  const accountCreatedAt =
    Date.parse(
      createdAt ??
        "",
    );

  if (
    Number.isFinite(
      accountCreatedAt,
    ) &&
    accountCreatedAt >=
      ONBOARDING_RELEASED_AT
  ) {
    await markOnboardingRequired(
      userId,
    );

    return true;
  }

  return false;
}

export function subscribeToOnboarding(
  userId: string,
  listener: OnboardingListener,
): () => void {
  const listeners =
    listenersByUser.get(
      userId,
    ) ??
    new Set<OnboardingListener>();

  listeners.add(
    listener,
  );

  listenersByUser.set(
    userId,
    listeners,
  );

  return () => {
    listeners.delete(
      listener,
    );

    if (
      listeners.size ===
      0
    ) {
      listenersByUser.delete(
        userId,
      );
    }
  };
}
