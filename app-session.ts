import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_SESSION_KEY =
  "@canal/app-session";

type StoredAppSession = {
  signedIn: boolean;
  signedInAt?: string;
};

export async function markAppSignedIn(): Promise<void> {
  const session: StoredAppSession = {
    signedIn: true,

    signedInAt:
      new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    APP_SESSION_KEY,
    JSON.stringify(session),
  );
}

export async function readAppSignedIn(): Promise<boolean> {
  const serialized =
    await AsyncStorage.getItem(
      APP_SESSION_KEY,
    );

  if (!serialized) {
    return false;
  }

  try {
    const parsed =
      JSON.parse(
        serialized,
      ) as Partial<StoredAppSession>;

    return parsed.signedIn === true;
  } catch {
    return false;
  }
}

export async function resolveAppSignedIn(): Promise<boolean> {
  const appSignedIn =
    await readAppSignedIn();

  if (appSignedIn) {
    return true;
  }

  try {
    const {
      getValidSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    const spotifySession =
      await getValidSpotifySession();

    if (spotifySession) {
      await markAppSignedIn();

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function bootstrapConnectedMusic(): Promise<void> {
  try {
    const {
      getValidSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    const spotifySession =
      await getValidSpotifySession();

    if (!spotifySession) {
      return;
    }

    const {
      readSpotifyLibrarySnapshot,
      syncSpotifyLibrary,
    } = await import(
      "./spotify-library"
    );

    const snapshot =
      await readSpotifyLibrarySnapshot();

    if (!snapshot) {
      await syncSpotifyLibrary();
    }
  } catch (error) {
    console.warn(
      "Canal could not bootstrap the Spotify library:",
      error,
    );
  }
}

async function removeMusicStorageKeys(
  includeAppSession: boolean,
): Promise<void> {
  const keys =
    await AsyncStorage.getAllKeys();

  const matchingKeys =
    keys.filter(
      (key) => {
        const normalized =
          key.toLowerCase();

        const isMusicKey =
          normalized.includes(
            "spotify",
          ) ||
          normalized.includes(
            "apple-music",
          ) ||
          normalized.includes(
            "apple_music",
          ) ||
          normalized.includes(
            "youtube-music",
          ) ||
          normalized.includes(
            "youtube_music",
          ) ||
          normalized.includes(
            "music-service",
          ) ||
          normalized.includes(
            "music-platform",
          ) ||
          normalized.includes(
            "player-session",
          );

        const isAppSession =
          key ===
          APP_SESSION_KEY;

        return (
          isMusicKey ||
          (includeAppSession &&
            isAppSession)
        );
      },
    );

  if (
    includeAppSession &&
    !matchingKeys.includes(
      APP_SESSION_KEY,
    )
  ) {
    matchingKeys.push(
      APP_SESSION_KEY,
    );
  }

  if (matchingKeys.length > 0) {
    await AsyncStorage.multiRemove(
      matchingKeys,
    );
  }
}

export async function disconnectSpotifyOnly(): Promise<void> {
  try {
    const {
      clearSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    await clearSpotifySession();
  } finally {
    await removeMusicStorageKeys(
      false,
    );
  }
}

export async function logoutAllMusicPlatforms(): Promise<void> {
  const {
    signOutCanalAccount,
  } = await import(
    "./canal-auth"
  );

  /* End the Canal account session before clearing Spotify. */
  await signOutCanalAccount();

  const {
    supabase,
  } = await import(
    "./supabase"
  );

  const {
    data: {
      session,
    },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (session) {
    throw new Error(
      "Canal could not end the account session.",
    );
  }

  try {
    const {
      clearSpotifySession,
    } = await import(
      "./spotify-auth"
    );

    await clearSpotifySession();
  } catch {
    // The Canal account is already signed out.
  }

  try {
    const {
      clearPlayerSession,
    } = await import(
      "./canal-player"
    );

    await clearPlayerSession();
  } catch {
    // Player storage may not exist yet.
  }

  await removeMusicStorageKeys(
    true,
  );

  await AsyncStorage.multiRemove([
    APP_SESSION_KEY,
    "@canal/scene-studio-draft",
    "@canal/scene-studio-preview",
  ]);
}
