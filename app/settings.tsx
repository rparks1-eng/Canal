import { canalDynamicColors } from "../theme/canal-dynamic-colors";

import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";
import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";

import Animated, {
  FadeInUp,
} from "react-native-reanimated";

import {
  isCanalAccountChangedError,
  isCanalLogoutIncompleteError,
  logoutAllMusicPlatforms,
  retryIncompleteAccountCleanup,
} from "../lib/app-session";

import {
  getValidSpotifySession,
} from "../lib/spotify-auth";

import {
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import {
  useAuth,
} from "../providers/auth-provider";

function safeBack(): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/profile",
  );
}

export default function SettingsScreen() {
  const {
    accountEpoch,
    user,
  } =
    useAuth();

  const accountIdentity =
    `${user?.id ?? "signed-out"}:${accountEpoch}`;

  const accountIdentityRef =
    useRef(
      accountIdentity,
    );

  accountIdentityRef.current =
    accountIdentity;

  const loadEpoch =
    useRef(0);

  const [
    spotifyConnected,
    setSpotifyConnected,
  ] = useState(false);

  const [
    libraryReady,
    setLibraryReady,
  ] = useState(false);

  const [
    checking,
    setChecking,
  ] = useState(true);

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const load =
    useCallback(() => {
      const expectedIdentity =
        accountIdentity;

      const expectedEpoch =
        loadEpoch.current +
        1;

      loadEpoch.current =
        expectedEpoch;

      const canCommit =
        (): boolean =>
          accountIdentityRef.current ===
            expectedIdentity &&
          loadEpoch.current ===
            expectedEpoch;

      const run =
        async (): Promise<void> => {
          setChecking(true);
          setSpotifyConnected(
            false,
          );
          setLibraryReady(false);
          setMessage("");

          const cleanup =
            await retryIncompleteAccountCleanup({
              allowSignOut:
                false,
            });

          if (!canCommit()) {
            return;
          }

          if (
            cleanup
              ?.cleanupIncomplete
          ) {
            const recoveryMessage =
              cleanup.recovery ===
              "signout"
                ? "Spotify cleanup finished. Retry Log Out to finish the local Canal sign-out."
                : "Spotify is disconnected, but account-scoped device cleanup still needs attention.";

            setMessage(
              recoveryMessage,
            );
            AccessibilityInfo
              .announceForAccessibility(
                recoveryMessage,
              );
            setChecking(false);

            return;
          }

          const session =
            await getValidSpotifySession();

          if (!canCommit()) {
            return;
          }

          setSpotifyConnected(
            Boolean(session),
          );

          if (session) {
            const snapshot =
              await readSpotifyLibrarySnapshot();

            if (!canCommit()) {
              return;
            }

            if (!snapshot) {
              setSyncing(true);

              try {
                const syncedSnapshot =
                  await syncSpotifyLibrary();

                if (!canCommit()) {
                  return;
                }

                setLibraryReady(
                  Boolean(
                    syncedSnapshot,
                  ),
                );

                setMessage(
                  "Spotify was already connected, so Canal automatically imported the missing library snapshot.",
                );
              } catch (error) {
                if (!canCommit()) {
                  return;
                }

                const syncErrorMessage =
                  error instanceof Error
                    ? error.message
                    : "Spotify library sync failed.";

                setMessage(
                  syncErrorMessage,
                );
                AccessibilityInfo
                  .announceForAccessibility(
                    syncErrorMessage,
                  );
              } finally {
                setSyncing(false);
              }
            } else {
              setLibraryReady(
                true,
              );
            }
          } else {
            setLibraryReady(
              false,
            );
          }

          setChecking(false);
        };

      void run().catch(
        (error: unknown) => {
          if (!canCommit()) {
            return;
          }

          const loadErrorMessage =
            isCanalAccountChangedError(
              error,
            )
              ? "The Canal account changed. Settings are loading only for the current account."
              : error instanceof Error
                ? error.message
                : "Canal could not load account settings.";

          setChecking(false);
          setMessage(
            loadErrorMessage,
          );
          AccessibilityInfo
            .announceForAccessibility(
              loadErrorMessage,
            );
        },
      );

      return () => {
        loadEpoch.current +=
          1;
      };
    }, [
      accountIdentity,
    ]);

  useFocusEffect(load);

  const sync =
    async (): Promise<void> => {
      const expectedIdentity =
        accountIdentity;

      setSyncing(true);

      setMessage("");
      AccessibilityInfo
        .announceForAccessibility(
          "Syncing Spotify Library.",
        );

      try {
        const snapshot =
          await syncSpotifyLibrary();

        if (
          accountIdentityRef.current !==
          expectedIdentity
        ) {
          return;
        }

        setLibraryReady(
          Boolean(snapshot),
        );

        const successMessage =
          "Spotify Library synced successfully.";

        setMessage(
          successMessage,
        );
        AccessibilityInfo
          .announceForAccessibility(
            successMessage,
          );
      } catch (error) {
        if (
          accountIdentityRef.current !==
          expectedIdentity
        ) {
          return;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Spotify library sync failed.";

        setMessage(
          errorMessage,
        );
        AccessibilityInfo
          .announceForAccessibility(
            errorMessage,
          );
      } finally {
        setSyncing(false);
      }
    };

  const confirmLogout =
    (): void => {
      if (loggingOut) {
        return;
      }

      Alert.alert(
        "Log Out of Canal?",
        "This ends only this device's current Canal session and disconnects Spotify for this account. Your Canal account, cloud data, and saved Scenes are not deleted.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },

          {
            text: "Log Out",
            style:
              "destructive",

            onPress: () => {
              const run =
                async (): Promise<void> => {
                  setLoggingOut(
                    true,
                  );

                  setMessage("");
                  AccessibilityInfo
                    .announceForAccessibility(
                      "Logging out of Canal on this device.",
                    );

                  try {
                    const pending =
                      await retryIncompleteAccountCleanup({
                        allowSignOut:
                          true,
                      });

                    let result =
                      pending ??
                      (await logoutAllMusicPlatforms());

                    if (
                      pending &&
                      !result.signedOut &&
                      !result.cleanupIncomplete &&
                      result.recovery ===
                        "none"
                    ) {
                      result =
                        await logoutAllMusicPlatforms();
                    }

                    if (
                      result.signedOut
                    ) {
                      AccessibilityInfo
                        .announceForAccessibility(
                          "Logged out of Canal on this device.",
                        );
                      router.replace(
                        "/login",
                      );

                      return;
                    }

                    const resultMessage =
                      result.recovery ===
                      "signout"
                        ? "Spotify cleanup finished. Retry only the local Canal sign-out."
                        : "Spotify is disconnected, but account-scoped device cleanup still needs attention.";

                    setMessage(
                      resultMessage,
                    );
                    AccessibilityInfo
                      .announceForAccessibility(
                        resultMessage,
                      );
                  } catch (error) {
                    const errorMessage =
                      isCanalLogoutIncompleteError(
                        error,
                      )
                        ? error.message
                        : isCanalAccountChangedError(
                              error,
                            )
                          ? "The Canal account changed. The replacement account was not logged out."
                          : error instanceof Error
                            ? error.message
                            : "Canal could not log out safely. Try again.";

                    setMessage(
                      errorMessage,
                    );
                    AccessibilityInfo
                      .announceForAccessibility(
                        errorMessage,
                      );
                  } finally {
                    setLoggingOut(
                      false,
                    );
                  }
                };

              void run();
            },
          },
        ],
      );
    };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <CanalAmbientBackground />
      <Animated.View entering={FadeInUp.duration(240)} style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityState={{
            disabled:
              loggingOut,
          }}
          disabled={
            loggingOut
          }
          onPress={safeBack}
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
            Settings
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Shape how Canal looks, connects, and remembers.
          </Text>
        </View>
      </Animated.View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={[styles.sectionCard, styles.appearanceCard]}
        >
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.appearancePreview}
          >
            <View style={styles.previewOrbOne} />
            <View style={styles.previewOrbTwo} />
            <View style={styles.previewGlass}>
              <View style={styles.previewLineWide} />
              <View style={styles.previewLineShort} />
            </View>
          </View>
          <Pressable
            accessibilityLabel="Open Appearance settings"
            accessibilityRole="button"
            onPress={() => router.push("/appearance")}
            style={({ pressed }) => [styles.serviceRow, pressed && styles.pressed]}
          >
            <View style={styles.appearanceMark}>
              <Text style={styles.appearanceMarkText}>Aa</Text>
            </View>
            <View style={styles.serviceText}>
              <Text style={styles.serviceName}>Light, Dark or System</Text>
              <Text style={styles.serviceStatus}>Choose how Canal looks on this device.</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>

        <View
          style={styles.sectionCard}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Music platforms
          </Text>

          <Pressable
            accessibilityLabel="Open Spotify settings"
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/music-services",
              )
            }
            style={({ pressed }) => [
              styles.serviceRow,

              pressed &&
                styles.pressed,
            ]}
          >
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
                {checking
                  ? "Checking connection"

                  : spotifyConnected
                    ? libraryReady
                      ? "Connected and synced"
                      : "Connected, library not ready"

                    : "Not connected"}
              </Text>
            </View>

            {checking ? (
              <ActivityIndicator />
            ) : (
              <Text
                style={
                  styles.arrow
                }
              >
                ›
              </Text>
            )}
          </Pressable>

          {spotifyConnected ? (
            <Pressable
              accessibilityLabel="Sync Spotify Library"
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  syncing,
                disabled:
                  syncing,
              }}
              disabled={syncing}
              onPress={() =>
                void sync()
              }
              style={({ pressed }) => [
                styles.syncButton,

                syncing &&
                  styles.disabled,

                pressed &&
                  styles.pressed,
              ]}
            >
              {syncing ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.syncButtonText
                  }
                >
                  Sync Spotify Library
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {message ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.messageBox}
          >
            <Text
              style={
                styles.messageText
              }
            >
              {message}
            </Text>
          </View>
        ) : null}

        <View
          style={styles.sectionCard}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Scene generation
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            Spotify account authorization
            and library syncing happen here
            or immediately after connection.
            Scene Studio only reads the saved
            snapshot.
          </Text>
        </View>

        <View
          style={styles.sectionCard}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Data and privacy
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Data Controls"
            accessibilityHint="Manage limited usage analytics, export local data, and clear data stored on this device."
            onPress={() =>
              router.push(
                "/data-controls",
              )
            }
            style={({ pressed }) => [
              styles.serviceRow,

              pressed &&
                styles.pressed,
            ]}
          >
            <View
              style={
                styles.privacyMark
              }
            >
              <Text
                style={
                  styles.privacyMarkText
                }
              >
                ◉
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
                Data Controls
              </Text>

              <Text
                style={
                  styles.serviceStatus
                }
              >
                Analytics, local export,
                and device data
              </Text>
            </View>

            <Text
              style={
                styles.arrow
              }
            >
              ›
            </Text>
          </Pressable>
        </View>

        <View style={styles.logoutCard}>
          <Text
            style={
              styles.logoutTitle
            }
          >
            Log out
          </Text>

          <Text
            style={
              styles.logoutDescription
            }
          >
            End this device&apos;s current
            session and disconnect Spotify
            for this account. Account and
            cloud data stay intact.
          </Text>

          <Pressable
            accessibilityLabel="Log Out of Canal"
            accessibilityRole="button"
            accessibilityState={{
              busy:
                loggingOut,
              disabled:
                loggingOut,
            }}
            disabled={
              loggingOut
            }
            onPress={
              confirmLogout
            }
            style={({ pressed }) => [
              styles.logoutButton,

              loggingOut &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            {loggingOut ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.logoutButtonText
                }
              >
                Log Out of Canal
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "transparent",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
    },

    backButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        canalDynamicColors.elevated,
      marginRight: 12,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerText: {
      flex: 1,
      alignItems: "center",
      paddingRight: 60,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 27,
      fontWeight: "500",
      letterSpacing: -0.7,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
      textAlign: "center",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 110,
      gap: 14,
    },

    sectionCard: {
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      padding: 18,
      boxShadow: "0 16px 38px rgba(8, 18, 47, 0.18)",
    },

    appearanceCard: {
      padding: 16,
    },

    appearancePreview: {
      height: 88,
      overflow: "hidden",
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor: "#526DAA",
      marginBottom: 13,
    },

    previewOrbOne: {
      position: "absolute",
      width: "115%",
      height: 42,
      top: 4,
      left: -18,
      transform: [{ rotate: "-7deg" }],
      backgroundColor: canalDynamicColors.elevated,
    },

    previewOrbTwo: {
      position: "absolute",
      width: "115%",
      height: 38,
      right: -20,
      bottom: 2,
      transform: [{ rotate: "8deg" }],
      backgroundColor: "rgba(177, 157, 237, 0.38)",
    },

    previewGlass: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 14,
      height: 42,
      justifyContent: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 15,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 13,
    },

    previewLineWide: {
      width: "58%",
      height: 5,
      borderRadius: 3,
      backgroundColor: canalDynamicColors.elevated,
    },

    previewLineShort: {
      width: "34%",
      height: 4,
      borderRadius: 2,
      backgroundColor: canalDynamicColors.elevated,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 12,
    },

    serviceRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        canalDynamicColors.line,
      paddingVertical: 13,
    },

    spotifyMark: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      marginRight: 12,
    },

    appearanceMark: {
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: "#A991E8",
    },

    appearanceMarkText: {
      color: "#10201C",
      fontFamily: "Georgia",
      fontSize: 19,
      fontWeight: "900",
    },

    spotifyMarkText: {
      color: "#FFFFFF",
      fontSize: 19,
      fontWeight: "900",
    },

    privacyMark: {
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 14,
      backgroundColor:
        canalDynamicColors.elevated,
    },

    privacyMarkText: {
      color: "#D85E0D",
      fontSize: 20,
      fontWeight: "900",
    },

    serviceText: {
      flex: 1,
    },

    serviceName: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    serviceStatus: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    arrow: {
      color: canalDynamicColors.muted,
      fontSize: 26,
      marginLeft: 8,
    },

    syncButton: {
      minHeight: 49,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      marginTop: 12,
    },

    syncButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    messageBox: {
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 16,
      padding: 14,
    },

    messageText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      lineHeight: 18,
    },

    explanationText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
    },

    logoutCard: {
      backgroundColor:
        canalDynamicColors.dangerSurface,
      borderWidth: 1,
      borderColor: "rgba(255, 171, 176, 0.42)",
      borderRadius: 22,
      padding: 18,
    },

    logoutTitle: {
      color: "#FFD8DB",
      fontSize: 18,
      fontWeight: "900",
    },

    logoutDescription: {
      color: "#F5C3C7",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
      marginBottom: 14,
    },

    logoutButton: {
      minHeight: 49,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#A62E27",
    },

    logoutButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
