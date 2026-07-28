import * as AuthSession from "expo-auth-session";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { Alert } from "react-native";

import {
    clearSpotifyReturnRoute,
    saveSpotifyReturnRoute,
    SpotifyReturnRoute,
} from "../lib/spotify-auth-return";
import {
    clearSpotifyApiCache,
} from "../lib/spotify-cache";
import {
    clearSpotifySession,
    fetchSpotifyProfile,
    getSpotifyErrorMessage,
    loadSpotifyProfile,
    saveSpotifySession,
    SPOTIFY_SCOPES,
    spotifyClientId,
    spotifyDiscovery,
    SpotifyProfile,
    spotifyRedirectUri,
    StoredSpotifySession,
} from "../lib/spotify-session";

WebBrowser.maybeCompleteAuthSession();

type SpotifyConnectionState = {
  profile: SpotifyProfile | null;
  isLoading: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  message: string;
  requestReady: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  changeAccount: () => Promise<void>;
  reload: () => Promise<void>;
};

export function useSpotifyConnection(
  returnRoute: SpotifyReturnRoute,
): SpotifyConnectionState {
  const [
    profile,
    setProfile,
  ] =
    useState<SpotifyProfile | null>(
      null,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    isConnecting,
    setIsConnecting,
  ] = useState(false);

  const [
    isDisconnecting,
    setIsDisconnecting,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const processedCode =
    useRef<string | null>(null);

  const [
    request,
    response,
    promptAsync,
  ] = AuthSession.useAuthRequest(
    {
      clientId:
        spotifyClientId ||
        "missing-client-id",
      responseType:
        AuthSession.ResponseType.Code,
      redirectUri:
        spotifyRedirectUri,
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
      extraParams: {
        show_dialog: "true",
      },
    },
    spotifyDiscovery,
  );

  const reload =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const storedProfile =
          await loadSpotifyProfile();

        setProfile(storedProfile);
      } catch (error) {
        console.error(
          "Unable to load Spotify connection:",
          error,
        );

        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    async function handleResponse() {
      if (!response) {
        return;
      }

      if (
        response.type === "cancel" ||
        response.type === "dismiss"
      ) {
        setIsConnecting(false);
        return;
      }

      if (response.type === "error") {
        setIsConnecting(false);

        Alert.alert(
          "Spotify connection failed",
          response.error?.message ??
            response.params
              ?.error_description ??
            "Spotify did not complete the connection.",
        );

        return;
      }

      if (
        response.type !== "success"
      ) {
        return;
      }

      const authorizationCode =
        response.params.code;

      if (!authorizationCode) {
        setIsConnecting(false);

        Alert.alert(
          "Spotify connection failed",
          "Spotify did not return an authorization code.",
        );

        return;
      }

      if (
        processedCode.current ===
        authorizationCode
      ) {
        return;
      }

      processedCode.current =
        authorizationCode;

      if (!request?.codeVerifier) {
        setIsConnecting(false);

        Alert.alert(
          "Spotify connection failed",
          "Canal could not find the Spotify security verifier.",
        );

        return;
      }

      try {
        setIsConnecting(true);
        setMessage("");

        const tokenResponse =
          await AuthSession.exchangeCodeAsync(
            {
              clientId:
                spotifyClientId,
              code:
                authorizationCode,
              redirectUri:
                spotifyRedirectUri,
              extraParams: {
                code_verifier:
                  request.codeVerifier,
              },
            },
            spotifyDiscovery,
          );

        const session:
          StoredSpotifySession = {
            accessToken:
              tokenResponse.accessToken,
            refreshToken:
              tokenResponse.refreshToken,
            expiresIn:
              tokenResponse.expiresIn,
            issuedAt: Math.floor(
              Date.now() / 1000,
            ),
            scope:
              tokenResponse.scope,
            tokenType:
              tokenResponse.tokenType,
          };

        await saveSpotifySession(
          session,
        );

        await clearSpotifyApiCache();

        const connectedProfile =
          await fetchSpotifyProfile(
            session.accessToken,
          );

        setProfile(
          connectedProfile,
        );

        setMessage(
          "Spotify connected successfully.",
        );

        await clearSpotifyReturnRoute();
      } catch (error) {
        console.error(
          "Spotify authorization failed:",
          error,
        );

        await Promise.all([
          clearSpotifySession(),
          clearSpotifyApiCache(),
          clearSpotifyReturnRoute(),
        ]);

        setProfile(null);

        Alert.alert(
          "Spotify connection failed",
          getSpotifyErrorMessage(
            error,
          ),
        );
      } finally {
        setIsConnecting(false);
      }
    }

    void handleResponse();
  }, [request, response]);

  const connect =
    useCallback(async () => {
      if (!spotifyClientId) {
        Alert.alert(
          "Spotify Client ID missing",
          "Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID to the .env file and restart Expo.",
        );

        return;
      }

      if (!request) {
        Alert.alert(
          "Spotify is still loading",
          "Try the connection button again.",
        );

        return;
      }

      try {
        setMessage("");
        setIsConnecting(true);

        await saveSpotifyReturnRoute(
          returnRoute,
        );

        await promptAsync();
      } catch (error) {
        console.error(
          "Unable to open Spotify:",
          error,
        );

        await clearSpotifyReturnRoute();

        setIsConnecting(false);

        Alert.alert(
          "Unable to open Spotify",
          getSpotifyErrorMessage(
            error,
          ),
        );
      }
    }, [
      promptAsync,
      request,
      returnRoute,
    ]);

  const disconnect =
    useCallback(async () => {
      if (isDisconnecting) {
        return;
      }

      try {
        setIsDisconnecting(true);

        await Promise.all([
          clearSpotifySession(),
          clearSpotifyApiCache(),
          clearSpotifyReturnRoute(),
        ]);

        processedCode.current =
          null;

        setProfile(null);

        setMessage(
          "Spotify disconnected.",
        );
      } catch (error) {
        console.error(
          "Unable to disconnect Spotify:",
          error,
        );

        Alert.alert(
          "Unable to disconnect",
          "Canal could not remove the Spotify connection.",
        );
      } finally {
        setIsDisconnecting(false);
      }
    }, [isDisconnecting]);

  const changeAccount =
    useCallback(async () => {
      try {
        setIsDisconnecting(true);
        setMessage("");

        await Promise.all([
          clearSpotifySession(),
          clearSpotifyApiCache(),
          clearSpotifyReturnRoute(),
        ]);

        processedCode.current =
          null;

        setProfile(null);
      } catch (error) {
        console.error(
          "Unable to clear Spotify account:",
          error,
        );

        Alert.alert(
          "Unable to change account",
          "Canal could not remove the current Spotify account.",
        );

        return;
      } finally {
        setIsDisconnecting(false);
      }

      await connect();
    }, [connect]);

  return {
    profile,
    isLoading,
    isConnecting,
    isDisconnecting,
    message,
    requestReady: Boolean(request),
    connect,
    disconnect,
    changeAccount,
    reload,
  };
}