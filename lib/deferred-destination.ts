import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  parsePublicDestination,
} from "./public-linking";

import type {
  PublicDestination,
} from "./public-linking";

const DEFERRED_DESTINATION_KEY =
  "@canal/deferred-public-destination:v1";

let mutationTail: Promise<void> = Promise.resolve();

async function serialize<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = mutationTail;
  let release = (): void => {};

  mutationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}

export async function rememberDeferredDestination(
  input: string,
): Promise<boolean> {
  const destination = parsePublicDestination(input);

  return serialize(async () => {
    if (!destination) {
      return false;
    }

    await AsyncStorage.setItem(
      DEFERRED_DESTINATION_KEY,
      destination,
    );
    return true;
  });
}

export async function consumeDeferredDestination(): Promise<
  PublicDestination | null
> {
  return serialize(async () => {
    const stored = await AsyncStorage.getItem(
      DEFERRED_DESTINATION_KEY,
    );

    if (!stored) {
      return null;
    }

    const destination = parsePublicDestination(stored);
    await AsyncStorage.removeItem(DEFERRED_DESTINATION_KEY);
    return destination;
  });
}

export async function restoreDeferredDestination(
  destination: PublicDestination,
): Promise<void> {
  await rememberDeferredDestination(destination);
}
