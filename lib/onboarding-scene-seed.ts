import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  supabase,
} from "./supabase";

export type OnboardingSceneSeed = {
  activity: string;
  moods: string[];
  genres: string[];
  familiarity: string;
  allowAdjacentGenres: boolean;
  allowExplicit: boolean;
  notes: string;
};

function storageKey(
  userId: string,
): string {
  return `@canal/onboarding/scene-seed/${userId}`;
}

async function assertCurrentUser(
  expectedUserId: string,
): Promise<void> {
  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (
    !user ||
    user.id !==
      expectedUserId
  ) {
    throw Object.assign(
      new Error(
        "The Canal account changed while the first Scene direction was being saved.",
      ),
      {
        code:
          "CANAL_ONBOARDING_SCENE_ACCOUNT_CHANGED",
      },
    );
  }
}

function normalizeStrings(
  values: unknown,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
        .map(
          (value) =>
            value.trim(),
        )
        .filter(
          (value) =>
            value.length >
              0 &&
            value.length <=
              maximumLength,
        ),
    ),
  ).slice(
    0,
    maximumItems,
  );
}

function normalizeSeed(
  value: unknown,
): OnboardingSceneSeed | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const candidate =
    value as Partial<OnboardingSceneSeed>;
  const activity =
    typeof candidate.activity ===
      "string"
      ? candidate.activity
          .trim()
          .slice(
            0,
            48,
          )
      : "";
  const moods =
    normalizeStrings(
      candidate.moods,
      5,
      48,
    );

  if (
    !activity ||
    moods.length ===
      0
  ) {
    return null;
  }

  return {
    activity,
    moods,
    genres:
      normalizeStrings(
        candidate.genres,
        5,
        80,
      ),
    familiarity:
      typeof candidate.familiarity ===
        "string"
        ? candidate.familiarity
            .trim()
            .slice(
              0,
              32,
            )
        : "Balanced",
    allowAdjacentGenres:
      candidate.allowAdjacentGenres !==
      false,
    allowExplicit:
      candidate.allowExplicit ===
      true,
    notes:
      typeof candidate.notes ===
        "string"
        ? candidate.notes
            .trim()
            .slice(
              0,
              300,
            )
        : "",
  };
}

export async function writeOnboardingSceneSeed(
  expectedUserId: string,
  seed: OnboardingSceneSeed,
): Promise<void> {
  const normalized =
    normalizeSeed(
      seed,
    );

  if (!normalized) {
    throw new Error(
      "Choose an activity and at least one mood before saving this Scene direction.",
    );
  }

  await assertCurrentUser(
    expectedUserId,
  );
  const key =
    storageKey(
      expectedUserId,
    );
  const serialized =
    JSON.stringify(
      normalized,
    );

  await AsyncStorage.setItem(
    key,
    serialized,
  );

  try {
    await assertCurrentUser(
      expectedUserId,
    );
  } catch (error) {
    const current =
      await AsyncStorage.getItem(
        key,
      ).catch(
        () => null,
      );

    if (
      current ===
      serialized
    ) {
      await AsyncStorage.removeItem(
        key,
      ).catch(
        () => undefined,
      );
    }

    throw error;
  }
}

export async function consumeOnboardingSceneSeed(
  expectedUserId: string,
): Promise<OnboardingSceneSeed | null> {
  await assertCurrentUser(
    expectedUserId,
  );

  const key =
    storageKey(
      expectedUserId,
    );
  const stored =
    await AsyncStorage.getItem(
      key,
    );

  await assertCurrentUser(
    expectedUserId,
  );
  await AsyncStorage.removeItem(
    key,
  );

  if (!stored) {
    return null;
  }

  try {
    return normalizeSeed(
      JSON.parse(
        stored,
      ),
    );
  } catch {
    return null;
  }
}
