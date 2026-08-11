import type { SoundscapePeriod } from "./soundscape-types";

import {
  Platform,
  Share,
} from "react-native";

export function parsePublicSoundscapePeriod(kind: string, key: string): SoundscapePeriod | null {
  if (kind === "year" && /^\d{4}$/u.test(key)) {
    const year = Number(key);
    if (year < 2000 || year > 2200) return null;
    return { kind, key, startsAt: new Date(Date.UTC(year, 0, 1)).toISOString(), endsAt: new Date(Date.UTC(year + 1, 0, 1)).toISOString() };
  }
  const match = /^(\d{4})-(winter|spring|summer|fall)$/u.exec(key);
  if (kind !== "season" || !match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2200) return null;
  const seasonIndex = ["winter", "spring", "summer", "fall"].indexOf(match[2]);
  return { kind, key, startsAt: new Date(Date.UTC(year, seasonIndex * 3, 1)).toISOString(), endsAt: new Date(Date.UTC(year, (seasonIndex + 1) * 3, 1)).toISOString() };
}

export function publicSoundscapeShareUrl(ownerId: string, period: SoundscapePeriod): string | null {
  const base = process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL?.replace(/\/+$/u, "");
  const owner = ownerId.trim();
  if (!base || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(owner)) return null;
  return `${base}/public-soundscape?ownerId=${encodeURIComponent(owner)}&periodKind=${encodeURIComponent(period.kind)}&periodKey=${encodeURIComponent(period.key)}`;
}

export async function shareSoundscapeProjection(input: {
  ownerId: string;
  displayName: string;
  period: SoundscapePeriod;
}): Promise<void> {
  const url = publicSoundscapeShareUrl(input.ownerId, input.period);
  if (!url) {
    throw new Error("Canal needs its public web address before this Soundscape can be shared.");
  }
  const message = `${input.displayName}'s ${input.period.key} Soundscape on Canal`;
  if (Platform.OS === "web") {
    const browserNavigator = globalThis.navigator as Navigator & {
      share?: (value: { title: string; text: string; url: string }) => Promise<void>;
      clipboard?: { writeText: (value: string) => Promise<void> };
    };
    if (browserNavigator.share) {
      await browserNavigator.share({ title: `${input.displayName}'s Soundscape`, text: message, url });
      return;
    }
    if (browserNavigator.clipboard) {
      await browserNavigator.clipboard.writeText(`${message}\n${url}`);
      return;
    }
    throw new Error("Sharing is not available in this browser.");
  }
  await Share.share({ title: `${input.displayName}'s Soundscape`, message: `${message}\n${url}`, url });
}
