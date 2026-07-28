import AsyncStorage from "@react-native-async-storage/async-storage";

type StringArrayBatchEntry = {
  key: string;
  values: string[];
};

export async function readStringArray(
  key: string,
): Promise<string[]> {
  try {
    const storedValue =
      await AsyncStorage.getItem(key);

    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (item): item is string =>
        typeof item === "string",
    );
  } catch (error) {
    console.error(
      `Unable to read string array from ${key}:`,
      error,
    );

    return [];
  }
}

export async function writeStringArray(
  key: string,
  values: string[],
): Promise<void> {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(values),
  );
}

export async function writeStringArrayBatch(
  entries: StringArrayBatchEntry[],
): Promise<void> {
  await AsyncStorage.multiSet(
    entries.map((entry) => [
      entry.key,
      JSON.stringify(entry.values),
    ]),
  );
}

export async function readJson<T>(
  key: string,
  fallbackValue: T,
): Promise<T> {
  try {
    const storedValue =
      await AsyncStorage.getItem(key);

    if (!storedValue) {
      return fallbackValue;
    }

    return JSON.parse(storedValue) as T;
  } catch (error) {
    console.error(
      `Unable to read JSON from ${key}:`,
      error,
    );

    return fallbackValue;
  }
}

export async function writeJson<T>(
  key: string,
  value: T,
): Promise<void> {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(value),
  );
}