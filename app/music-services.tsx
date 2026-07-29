import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  disconnectSpotifyOnly,
  logoutAllMusicPlatforms,
  markAppSignedIn,
} from "../lib/app-session";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  getSpotifyClientId,
  getSpotifyRedirectUri,
  SPOTIFY_SCOPES,
  spotifyDiscovery,
} from "../lib/spotify-config";

import {
  getMissingSpotifyScopes,
  getValidSpotifySession,
  saveSpotifySession,
  SpotifyAccessError,
} from "../lib/spotify-auth";

import type {
  SpotifyProfile,
  SpotifySession,
} from "../lib/spotify-auth";

import {
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

WebBrowser.maybeCompleteAuthSession();

type ConnectionState =
  | "loading"
  | "disconnected"
  | "connecting"
  | "syncing"
  | "connected";

function safeBack(
  loginMode: boolean,
): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace(
    loginMode
      ? "/login"
      : "/settings",
  );
}

export default function MusicServicesScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams<{
      mode?: string;
    }>();

  const loginMode =
    params.mode === "login";

  const clientId =
    getSpotifyClientId();

  const redirectUri =
    getSpotifyRedirectUri();

  const [
    connectionState,
    setConnectionState,
  ] =
    useState<ConnectionState>(
      "loading",
    );

  const [
    session,
    setSession,
  ] =
    useState<SpotifySession | null>(
      null,
    );

  const [
    libraryReady,
    setLibraryReady,
  ] = useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    errorCause,
    setErrorCause,
  ] =
    useState<unknown>(
      null,
    );

  const processingCode =
    useRef<string | null>(
      null,
    );

  const [
    request,
    response,
    promptAsync,
  ] =
    AuthSession.useAuthRequest(
      {
        clientId,

        scopes:
          [
            ...SPOTIFY_SCOPES,
          ],

        redirectUri,

        responseType:
          AuthSession.ResponseType
            .Code,

        usePKCE: true,

        extraParams: {
          show_dialog:
            "true",
        },
      },

      spotifyDiscovery,
    );

  useEffect(() => {
    const loadExistingConnection =
      async (): Promise<void> => {
        setConnectionState(
          "loading",
        );

        setErrorMessage("");
        setErrorCause(null);

        const validSession =
          await getValidSpotifySession();

        if (!validSession) {
          setSession(null);

          setLibraryReady(false);

          setConnectionState(
            "disconnected",
          );

          return;
        }

        setSession(
          validSession,
        );

        await markAppSignedIn();

        let snapshot =
          await readSpotifyLibrarySnapshot();

        const missingScopes =
          getMissingSpotifyScopes(
            validSession.scope,
          );

        if (
          missingScopes.length >
          0
        ) {
          setLibraryReady(
            false,
          );

          setConnectionState(
            "connected",
          );

          setErrorMessage(
            "Spotify permission is required before Canal can refresh your library and export playlists.",
          );

          setErrorCause(
            new SpotifyAccessError(
              "permission",
              "Spotify permission is required before Canal can refresh your library and export playlists.",
              missingScopes,
            ),
          );

          setStatusMessage(
            snapshot
              ? "Your last Spotify snapshot is still available while you reconnect."
              : "Reconnect Spotify before creating a Scene.",
          );

          return;
        }

        if (!snapshot) {
          setConnectionState(
            "syncing",
          );

          setStatusMessage(
            "Spotify is connected. Canal is importing your library.",
          );

          try {
            snapshot =
              await syncSpotifyLibrary();
          } catch (error) {
            setErrorCause(
              () => error,
            );

            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Spotify connected, but the library could not be synced.",
            );
          }
        }

        setLibraryReady(
          Boolean(snapshot),
        );

        setConnectionState(
          "connected",
        );
      };

    void loadExistingConnection().catch(
      (error: unknown) => {
        setConnectionState(
          "disconnected",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not verify the Spotify connection.",
        );

        setErrorCause(
          () => error,
        );
      },
    );
  }, []);

  useEffect(() => {
    if (
      response?.type !==
      "success"
    ) {
      if (
        response?.type ===
        "error"
      ) {
        const responseError =
          new Error(
            response.params
              .error_description ||
              response.params.error ||
              "Spotify authorization failed.",
          );

        setConnectionState(
          session
            ? "connected"
            : "disconnected",
        );

        setErrorMessage(
          responseError.message,
        );

        setErrorCause(
          responseError,
        );
      }

      return;
    }

    const code =
      response.params.code;

    if (
      !code ||
      processingCode.current ===
        code
    ) {
      return;
    }

    processingCode.current =
      code;

    const completeConnection =
      async (): Promise<void> => {
        if (
          !request?.codeVerifier
        ) {
          throw new Error(
            "Spotify PKCE verification information is missing.",
          );
        }

        setConnectionState(
          "connecting",
        );

        setErrorMessage("");
        setErrorCause(null);

        setStatusMessage(
          "Completing Spotify connection.",
        );

        const tokenResponse =
          await AuthSession.exchangeCodeAsync(
            {
              clientId,
              code,
              redirectUri,

              extraParams: {
                code_verifier:
                  request.codeVerifier,
              },
            },

            spotifyDiscovery,
          );

        const profileResponse =
          await fetch(
            "https://api.spotify.com/v1/me",
            {
              headers: {
                Authorization:
                  `Bearer ${tokenResponse.accessToken}`,
              },
            },
          );

        const profilePayload =
          (await profileResponse.json()) as
            SpotifyProfile & {
              error?: {
                message?: string;
              };
            };

        if (
          !profileResponse.ok ||
          !profilePayload.id
        ) {
          throw new Error(
            profilePayload.error
              ?.message ||
              "Canal could not load your Spotify profile.",
          );
        }

        const expiresIn =
          typeof tokenResponse.expiresIn ===
            "number"
            ? tokenResponse.expiresIn
            : 3600;

        const newSession: SpotifySession = {
          accessToken:
            tokenResponse.accessToken,

          refreshToken:
            tokenResponse.refreshToken,

          tokenType:
            tokenResponse.tokenType ||
            "Bearer",

          scope:
            tokenResponse.scope ||
            SPOTIFY_SCOPES.join(
              " ",
            ),

          expiresIn,

          expiresAt:
            Date.now() +
            expiresIn *
              1000 -
            60_000,

          profile:
            profilePayload,
        };

        await saveSpotifySession(
          newSession,
          {
            syncLibrary: false,
          },
        );

        await markAppSignedIn();

        setSession(
          newSession,
        );

        setConnectionState(
          "syncing",
        );

        setStatusMessage(
          "Spotify connected. Canal is automatically importing your library.",
        );

        try {
          const snapshot =
            await syncSpotifyLibrary();

          setLibraryReady(
            Boolean(snapshot),
          );

          setStatusMessage(
            "Spotify is connected and your library is ready.",
          );
        } catch (error) {
          setLibraryReady(
            false,
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Spotify connected, but the library could not be synced.",
          );

          setErrorCause(
            () => error,
          );

          setStatusMessage(
            "Spotify is connected. Retry the library import when your connection is available.",
          );
        }

        setConnectionState(
          "connected",
        );

        try {
          WebBrowser.dismissAuthSession();
        } catch {
          // The browser may already be closed.
        }
      };

    completeConnection().catch(
      (error: unknown) => {
        setConnectionState(
          session
            ? "connected"
            : "disconnected",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Spotify connection failed.",
        );

        setErrorCause(
          () => error,
        );
      },
    );
  }, [
    clientId,
    redirectUri,
    request?.codeVerifier,
    response,
    session,
  ]);

  const accountName =
    useMemo(
      () =>
        session?.profile
          .display_name ||
        session?.profile.id ||
        "Spotify account",

      [session],
    );

  const connect =
    async (): Promise<void> => {
      if (!clientId) {
        const configurationError =
          new Error(
            "EXPO_PUBLIC_SPOTIFY_CLIENT_ID is missing.",
          );

        setErrorMessage(
          configurationError.message,
        );

        setErrorCause(
          configurationError,
        );

        return;
      }

      if (!request) {
        const requestError =
          new Error(
            "Spotify authorization is still loading.",
          );

        setErrorMessage(
          requestError.message,
        );

        setErrorCause(
          requestError,
        );

        return;
      }

      const previousErrorMessage =
        errorMessage;

      const previousErrorCause =
        errorCause;

      const previousStatusMessage =
        statusMessage;

      setConnectionState(
        "connecting",
      );

      setErrorMessage("");
      setErrorCause(null);

      setStatusMessage(
        "Opening Spotify authorization.",
      );

      try {
        const result =
          await promptAsync();

        if (
          result.type ===
          "cancel" ||
          result.type ===
          "dismiss"
        ) {
          setConnectionState(
            session
              ? "connected"
              : "disconnected",
          );

          setErrorMessage(
            previousErrorMessage,
          );

          setErrorCause(
            () =>
              previousErrorCause,
          );

          setStatusMessage(
            previousStatusMessage,
          );
        }
      } catch (error) {
        setConnectionState(
          session
            ? "connected"
            : "disconnected",
        );

        setErrorCause(
          () => error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not open Spotify authorization.",
        );
      }
    };

  const syncAgain =
    async (): Promise<void> => {
      setConnectionState(
        "syncing",
      );

      setErrorMessage("");
      setErrorCause(null);

      setStatusMessage(
        "Refreshing your Spotify library.",
      );

      try {
        const snapshot =
          await syncSpotifyLibrary();

        setLibraryReady(
          Boolean(snapshot),
        );

        setConnectionState(
          "connected",
        );

        setStatusMessage(
          "Your Spotify library is up to date.",
        );
      } catch (error) {
        setConnectionState(
          "connected",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Spotify library sync failed.",
        );

        setErrorCause(
          () => error,
        );
      }
    };

  useReconnectReload(
    async () => {
      if (session) {
        await syncAgain();
      }
    },
  );

  const disconnect =
    async (): Promise<void> => {
      await disconnectSpotifyOnly();

      setSession(null);

      setLibraryReady(false);
      setErrorMessage("");
      setErrorCause(null);

      setConnectionState(
        "disconnected",
      );

      setStatusMessage(
        "Spotify was disconnected.",
      );
    };

  const logout =
    async (): Promise<void> => {
      await logoutAllMusicPlatforms();

      router.replace(
        "/login",
      );
    };

  const continueToCanal =
    (): void => {
      router.replace(
        "/(tabs)",
      );
    };

  const recoveryIssue =
    useMemo(
      () => {
        if (
          !errorMessage &&
          connectivityStatus !==
            "offline"
        ) {
          return null;
        }

        return classifyRecoveryIssue(
          errorCause ??
            new Error(
              errorMessage ||
                "Canal is offline.",
            ),
          {
            service:
              "spotify",
            connectivityStatus,
          },
        );
      },
      [
        connectivityStatus,
        errorCause,
        errorMessage,
      ],
    );

  const recover =
    async (): Promise<void> => {
      if (
        recoveryIssue?.action ===
        "reconnect-spotify"
      ) {
        await connect();

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus ===
        "offline"
      ) {
        return;
      }

      if (session) {
        await syncAgain();
      } else {
        await connect();
      }
    };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() =>
            safeBack(
              loginMode,
            )
          }
          style={({ pressed }) => [
            styles.backButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.backText
            }
          >
            ‹
          </Text>
        </Pressable>

        <View
          style={
            styles.headerText
          }
        >
          <Text style={styles.title}>
            Music Services
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Connect once. Canal imports your
            taste before Scene creation.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.spotifyCard}>
          <View
            style={
              styles.spotifyMark
            }
          >
            <Text
              style={
                styles.spotifyMarkText
              }
            >
              S
            </Text>
          </View>

          <View
            style={
              styles.serviceText
            }
          >
            <Text
              style={
                styles.serviceName
              }
            >
              Spotify
            </Text>

            <Text
              style={
                styles.serviceStatus
              }
            >
              {connectionState ===
              "loading"
                ? "Checking connection"

                : connectionState ===
                    "connecting"
                  ? "Connecting"

                  : connectionState ===
                      "syncing"
                    ? "Syncing library"

                    : connectionState ===
                        "connected"
                      ? `Connected as ${accountName}`

                      : "Not connected"}
            </Text>
          </View>

          {connectionState ===
            "loading" ||
          connectionState ===
            "connecting" ||
          connectionState ===
            "syncing" ? (
            <ActivityIndicator />
          ) : (
            <View
              style={[
                styles.statusDot,

                connectionState ===
                  "connected" &&
                  styles.statusDotConnected,
              ]}
            />
          )}
        </View>

        {connectionState ===
        "connected" ? (
          <>
            <View
              style={
                styles.libraryStatus
              }
            >
              <Text
                style={
                  styles.libraryStatusTitle
                }
              >
                {libraryReady
                  ? "Spotify Library ready"
                  : recoveryIssue
                      ?.action ===
                    "reconnect-spotify"
                    ? "Spotify permission needed"
                    : "Spotify Library needs attention"}
              </Text>

              <Text
                style={
                  styles.libraryStatusText
                }
              >
                {libraryReady
                  ? "Scene Studio will use the saved Spotify snapshot. It will not request or sync account data during generation."
                  : recoveryIssue
                        ?.action ===
                      "reconnect-spotify"
                    ? "Your last snapshot stays available on this device. Reconnect Spotify to refresh it and export playlists."
                    : "Use Sync Spotify Library before creating a Scene."}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  connectivityStatus ===
                    "offline",
              }}
              disabled={
                connectivityStatus ===
                  "offline"
              }
              onPress={() =>
                void syncAgain()
              }
              style={({ pressed }) => [
                styles.primaryButton,

                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Sync Spotify Library
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={
                continueToCanal
              }
              style={({ pressed }) => [
                styles.continueButton,

                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.continueButtonText
                }
              >
                Continue to Canal
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void disconnect()
              }
              style={({ pressed }) => [
                styles.secondaryButton,

                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Disconnect Spotify
              </Text>
            </Pressable>
          </>
        ) : connectionState ===
          "disconnected" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                connectivityStatus ===
                  "offline",
            }}
            disabled={
              connectivityStatus ===
                "offline"
            }
            onPress={() =>
              void connect()
            }
            style={({ pressed }) => [
              styles.primaryButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Connect Spotify
            </Text>
          </Pressable>
        ) : null}

        {statusMessage ? (
          <View style={styles.infoBox}>
            <Text
              style={
                styles.infoText
              }
            >
              {statusMessage}
            </Text>
          </View>
        ) : null}

        {recoveryIssue ? (
          <RecoveryNotice
            busy={
              connectionState ===
                "connecting" ||
              connectionState ===
                "syncing"
            }
            issue={
              recoveryIssue
            }
            onAction={
              recover
            }
          />
        ) : null}

        <View style={styles.explanationCard}>
          <Text
            style={
              styles.explanationTitle
            }
          >
            Connection flow
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            1. Spotify authorizes Canal.
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            2. Canal imports the Spotify
            profile and library snapshot.
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            3. Scene Studio reads the saved
            snapshot without reconnecting or
            syncing.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void logout()
          }
          style={({ pressed }) => [
            styles.logoutButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.logoutButtonText
            }
          >
            Log Out of Canal
          </Text>
        </Pressable>

        <Text
          selectable
          style={
            styles.redirectText
          }
        >
          Redirect URI: {redirectUri}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 17,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      marginRight: 12,
    },

    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerText: {
      flex: 1,
    },

    title: {
      color: "#181818",
      fontSize: 28,
      fontWeight: "900",
    },

    subtitle: {
      color: "#6C655F",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
      gap: 13,
    },

    spotifyCard: {
      flexDirection: "row",
      alignItems:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 17,
    },

    spotifyMark: {
      width: 53,
      height: 53,
      borderRadius: 27,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      marginRight: 13,
    },

    spotifyMarkText: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
    },

    serviceText: {
      flex: 1,
    },

    serviceName: {
      color: "#181818",
      fontSize: 18,
      fontWeight: "900",
    },

    serviceStatus: {
      color: "#746D67",
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor:
        "#C7C0BA",
    },

    statusDotConnected: {
      backgroundColor:
        "#1DB954",
    },

    libraryStatus: {
      backgroundColor:
        "#ECFAF0",
      borderRadius: 18,
      padding: 15,
    },

    libraryStatusTitle: {
      color: "#176B35",
      fontSize: 14,
      fontWeight: "900",
    },

    libraryStatusText: {
      color: "#39704B",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    primaryButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      paddingHorizontal: 17,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    continueButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 17,
    },

    continueButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    secondaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#D8D0CA",
    },

    secondaryButtonText: {
      color: "#4D4743",
      fontSize: 14,
      fontWeight: "800",
    },

    infoBox: {
      backgroundColor:
        "#EFF5FF",
      borderRadius: 16,
      padding: 14,
    },

    infoText: {
      color: "#36567C",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor:
        "#FFF0EF",
      borderRadius: 16,
      padding: 14,
    },

    errorTitle: {
      color: "#A62E27",
      fontSize: 13,
      fontWeight: "900",
    },

    errorText: {
      color: "#7E3833",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    explanationCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 17,
    },

    explanationTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 8,
    },

    explanationText: {
      color: "#6C655F",
      fontSize: 12,
      lineHeight: 19,
      marginTop: 3,
    },

    logoutButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#D8AAA5",
      backgroundColor:
        "#FFF8F7",
    },

    logoutButtonText: {
      color: "#A62E27",
      fontSize: 14,
      fontWeight: "900",
    },

    redirectText: {
      color: "#968E87",
      fontSize: 9,
      lineHeight: 14,
      textAlign: "center",
      marginTop: 5,
    },

    pressed: {
      opacity: 0.7,
    },
  });
