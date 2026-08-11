import {
  requireSupabaseConfiguration,
  supabase,
} from "./supabase";

type DeleteAccountResponse = {
  deleted?: boolean;
  error?: string;
  code?: string;
};

async function accountDeletionErrorMessage(
  error: unknown,
): Promise<string> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error
  ) {
    const context = (
      error as {
        context?: {
          clone?: () => {
            json?: () => Promise<unknown>;
          };
        };
      }
    ).context;

    try {
      const payload =
        await context
          ?.clone?.()
          .json?.() as DeleteAccountResponse | undefined;

      if (payload?.code === "ACCOUNT_DELETE_FAILED") {
        return "Canal reached the account service, but permanent deletion could not finish. Your account remains active; retry once or contact Canal support.";
      }

      if (payload?.error) {
        return payload.error;
      }
    } catch {
      // Fall through to the typed transport error below.
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : "";

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("offline")
  ) {
    return "Canal could not reach the account service. Check your connection and retry; your account remains active.";
  }

  return "Canal could not permanently delete this account. Your account remains active; retry or contact Canal support.";
}

export async function deleteCanalAccount(
  expectedUserId: string,
  confirmation: string,
): Promise<void> {
  requireSupabaseConfiguration();

  const normalizedUserId =
    expectedUserId.trim();
  const normalizedConfirmation =
    confirmation.trim();

  if (
    !normalizedUserId ||
    !normalizedConfirmation
  ) {
    throw new Error(
      "Enter the required confirmation before deleting your account.",
    );
  }

  const {
    data: {
      user,
    },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user ||
    user.id !== normalizedUserId
  ) {
    throw new Error(
      "Your Canal session changed. Sign in again before deleting this account.",
    );
  }

  const {
    data,
    error,
  } = await supabase.functions.invoke<DeleteAccountResponse>(
    "delete-account",
    {
      body: {
        expectedUserId:
          normalizedUserId,
        confirmation:
          normalizedConfirmation,
      },
    },
  );

  if (
    error ||
    data?.deleted !== true
  ) {
    throw new Error(
      await accountDeletionErrorMessage(
        error,
      ),
    );
  }
}
