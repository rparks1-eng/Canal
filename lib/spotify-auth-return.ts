import AsyncStorage from "@react-native-async-storage/async-storage";

const SPOTIFY_RETURN_ROUTE_KEY =
  "@canal/spotify-return-route";

export type SpotifyReturnRoute =
  | "/connect-music"
  | "/music-services";

export async function saveSpotifyReturnRoute(
  route: SpotifyReturnRoute,
): Promise<void> {
  await AsyncStorage.setItem(
    SPOTIFY_RETURN_ROUTE_KEY,
    route,
  );
}

export async function readSpotifyReturnRoute(): Promise<SpotifyReturnRoute> {
  const storedRoute =
    await AsyncStorage.getItem(
      SPOTIFY_RETURN_ROUTE_KEY,
    );

  if (
    storedRoute ===
      "/connect-music" ||
    storedRoute ===
      "/music-services"
  ) {
    return storedRoute;
  }

  return "/music-services";
}

export async function clearSpotifyReturnRoute(): Promise<void> {
  await AsyncStorage.removeItem(
    SPOTIFY_RETURN_ROUTE_KEY,
  );
}