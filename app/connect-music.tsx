import { canalDynamicColors } from "../theme/canal-dynamic-colors";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useSpotifyConnection,
} from "../hooks/useSpotifyConnection";

import {
  announceSpotifyAuthStatusEvent,
} from "../lib/spotify-auth-return";

import {
  isOnboardingRequired,
  ONBOARDING_METADATA_KEY,
} from "../lib/onboarding";

import {
  useAuth,
} from "../providers/auth-provider";

export default function ConnectMusicScreen() {
  const params =
    useLocalSearchParams<{
      mode?: string;
    }>();

  const {
    accountEpoch,
    user,
  } =
    useAuth();

  const accountIdentity =
    `${user?.id ?? "signed-out"}:${accountEpoch}`;

  const announcedAccountIdentity =
    useRef(
      accountIdentity,
    );

  const announcedStatusEventId =
    useRef<string | null>(
      null,
    );

  const [
    onboardingFlow,
    setOnboardingFlow,
  ] = useState(
    params.mode ===
      "onboarding",
  );

  const {
    profile,
    isLoading,
    isConnecting,
    isDisconnecting,
    message,
    cleanupRecoveryRequired,
    requestReady,
    statusEvent,
    connect,
    changeAccount,
    retryCleanup,
  } = useSpotifyConnection(
    "/connect-music",
  );

  const spotifyImage =
    profile?.images?.[0]?.url;

  useEffect(() => {
    if (
      announcedAccountIdentity.current !==
      accountIdentity
    ) {
      announcedAccountIdentity.current =
        accountIdentity;
      announcedStatusEventId.current =
        null;
    }

    announcedStatusEventId.current =
      announceSpotifyAuthStatusEvent(
        statusEvent,
        accountIdentity,
        announcedStatusEventId.current,
        (statusMessage) => {
          AccessibilityInfo.announceForAccessibility(
            statusMessage,
          );
        },
      );
  }, [
    accountIdentity,
    statusEvent,
  ]);

  useEffect(() => {
    if (
      params.mode ===
      "onboarding"
    ) {
      setOnboardingFlow(
        true,
      );

      return;
    }

    if (!user) {
      return;
    }

    let active =
      true;

    isOnboardingRequired(
      user.id,
      user.email,
      user.created_at,
      user.user_metadata?.[
        ONBOARDING_METADATA_KEY
      ],
    )
      .then(
        (required) => {
          if (active) {
            setOnboardingFlow(
              required,
            );
          }
        },
      )
      .catch(
        (error: unknown) => {
          console.warn(
            "Canal could not read the onboarding state on the music connection screen:",
            error,
          );
        },
      );

    return () => {
      active =
        false;
    };
  }, [
    params.mode,
    user,
  ]);

  function continueToCanal() {
    if (
      onboardingFlow
    ) {
      router.replace({
        pathname:
          "/onboarding",

        params: {
          step:
            "shape",
          spotify:
            profile
              ? "connected"
              : "skipped",
        },
      } as never);

      return;
    }

    router.replace(
      "/(tabs)" as never,
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <View style={styles.layout}>
        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View style={styles.brand}>
            <Text style={styles.logo}>
              canal
            </Text>

            <Text style={styles.tagline}>
              YOUR MUSIC, SHAPED TO THE
              MOMENT
            </Text>
          </View>

          <View
            style={styles.introduction}
          >
            <Text style={styles.heading}>
              Connect your music.
            </Text>

            <Text
              style={styles.description}
            >
              Connect Spotify so Canal can
              search artists, personalize
              Scenes, and export the music
              you create.
            </Text>
          </View>

          {message ? (
            <View
              style={styles.messageCard}
            >
              <Text
                style={styles.messageText}
              >
                {message}
              </Text>
            </View>
          ) : null}

          {isLoading ? (
            <View
              style={styles.loadingCard}
            >
              <ActivityIndicator
                size="large"
                color="#4C46C8"
              />

              <Text
                style={styles.loadingText}
              >
                Checking Spotify...
              </Text>
            </View>
          ) : profile ? (
            <View
              style={styles.connectedCard}
            >
              <View
                style={styles.serviceHeader}
              >
                <View
                  style={styles.spotifyLogo}
                >
                  <Text
                    style={
                      styles.spotifyLogoText
                    }
                  >
                    SP
                  </Text>
                </View>

                <View style={styles.headerCopy}>
                  <Text
                    style={
                      styles.connectedEyebrow
                    }
                  >
                    SPOTIFY CONNECTED
                  </Text>

                  <Text
                    style={
                      styles.connectedHeading
                    }
                  >
                    Your music is ready.
                  </Text>
                </View>
              </View>

              <View
                style={styles.profileCard}
              >
                {spotifyImage ? (
                  <Image
                    source={{
                      uri: spotifyImage,
                    }}
                    style={
                      styles.profileImage
                    }
                  />
                ) : (
                  <View
                    style={
                      styles.profilePlaceholder
                    }
                  >
                    <Text
                      style={
                        styles.profilePlaceholderText
                      }
                    >
                      {getInitials(
                        profile.display_name ??
                          "Spotify",
                      )}
                    </Text>
                  </View>
                )}

                <View
                  style={styles.profileCopy}
                >
                  <Text
                    style={styles.profileName}
                  >
                    {profile.display_name ??
                      "Spotify user"}
                  </Text>

                  {profile.email ? (
                    <Text
                      numberOfLines={1}
                      style={
                        styles.profileDetail
                      }
                    >
                      {profile.email}
                    </Text>
                  ) : null}
                </View>
              </View>

              <Pressable
                accessibilityLabel="Change Spotify Account"
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    isConnecting ||
                    isDisconnecting,
                  disabled:
                    isConnecting ||
                    isDisconnecting,
                }}
                disabled={
                  isConnecting ||
                  isDisconnecting
                }
                onPress={() => {
                  void changeAccount();
                }}
                style={({ pressed }) => [
                  styles.changeButton,
                  (isConnecting ||
                    isDisconnecting) &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                {isConnecting ||
                isDisconnecting ? (
                  <ActivityIndicator
                    color="#9fd9ae"
                  />
                ) : (
                  <Text
                    style={
                      styles.changeButtonText
                    }
                  >
                    Change Spotify Account
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View
              style={styles.connectCard}
            >
              <View
                style={
                  styles.spotifyLogoLarge
                }
              >
                <Text
                  style={
                    styles.spotifyLogoLargeText
                  }
                >
                  SP
                </Text>
              </View>

              <Text
                style={
                  styles.connectCardTitle
                }
              >
                Spotify
              </Text>

              <Text
                style={
                  styles.connectCardText
                }
              >
                Sign in securely with your
                Spotify account.
              </Text>

              {cleanupRecoveryRequired ? (
                <Pressable
                  accessibilityLabel="Retry Spotify cleanup"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy:
                      isConnecting,
                    disabled:
                      isConnecting,
                  }}
                  disabled={
                    isConnecting
                  }
                  onPress={() => {
                    void retryCleanup();
                  }}
                  style={({ pressed }) => [
                    styles.spotifyButton,
                    isConnecting &&
                      styles.disabled,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  {isConnecting ? (
                    <ActivityIndicator
                      color="#191A18"
                    />
                  ) : (
                    <Text
                      style={
                        styles.spotifyButtonText
                      }
                    >
                      Retry Spotify cleanup
                    </Text>
                  )}
                </Pressable>
              ) : (
              <Pressable
                accessibilityLabel="Connect Spotify"
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    isConnecting ||
                    !requestReady,
                  disabled:
                    isConnecting ||
                    !requestReady,
                }}
                disabled={
                  isConnecting ||
                  !requestReady
                }
                onPress={() => {
                  void connect();
                }}
                style={({ pressed }) => [
                  styles.spotifyButton,
                  (isConnecting ||
                    !requestReady) &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                {isConnecting ? (
                  <ActivityIndicator
                    color="#191A18"
                  />
                ) : (
                  <Text
                    style={
                      styles.spotifyButtonText
                    }
                    >
                    Connect Spotify
                  </Text>
                )}
              </Pressable>
              )}
            </View>
          )}

          <View style={styles.explanationCard}>
            <Text
              style={
                styles.explanationTitle
              }
            >
              What Spotify enables
            </Text>

            <Benefit
              number="01"
              text="Search real Spotify artists while creating Scenes."
            />

            <Benefit
              number="02"
              text="Export Scene tracks into Spotify playlists."
            />

            <Benefit
              number="03"
              text="Use your connected account across Canal."
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
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
              {onboardingFlow
                ? profile
                  ? "Continue: Shape"
                  : "Continue without Spotify"
                : "Continue to Canal"}
            </Text>
          </Pressable>

          <Text style={styles.footerText}>
            {onboardingFlow
              ? "You can connect or change Spotify later from You → Music Services."
              : "You can manage Spotify later from You → Music Services."}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Benefit({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <View style={styles.benefitRow}>
      <View
        style={styles.benefitNumber}
      >
        <Text
          style={
            styles.benefitNumberText
          }
        >
          {number}
        </Text>
      </View>

      <Text style={styles.benefitText}>
        {text}
      </Text>
    </View>
  );
}

function getInitials(
  value: string,
): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "SP";
  }

  return words
    .slice(0, 2)
    .map((word) =>
      word
        .charAt(0)
        .toUpperCase(),
    )
    .join("");
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },

  layout: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 24,
  },

  brand: {
    alignItems: "center",
  },

  logo: {
    color: canalDynamicColors.lavender,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -2,
  },

  tagline: {
    marginTop: 7,
    color: "#6D6B64",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },

  introduction: {
    alignItems: "center",
  },

  heading: {
      fontFamily: "Georgia",
    color: canalDynamicColors.text,
    fontSize: 33,
    fontWeight: "700",
    textAlign: "center",
  },

  description: {
    maxWidth: 360,
    marginTop: 11,
    color: canalDynamicColors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  messageCard: {
    padding: 13,
    borderWidth: 1,
    borderColor: "#31483a",
    borderRadius: 15,
    backgroundColor: "#16231a",
  },

  messageText: {
    color: "#9fd9ae",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },

  loadingCard: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D9D3C8",
    borderRadius: 23,
    backgroundColor: canalDynamicColors.surface,
  },

  loadingText: {
    marginTop: 12,
    color: canalDynamicColors.muted,
    fontSize: 14,
  },

  connectedCard: {
    gap: 17,
    padding: 20,
    borderWidth: 1,
    borderColor: "#245c37",
    borderRadius: 24,
    backgroundColor: canalDynamicColors.surface,
  },

  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  spotifyLogo: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    borderRadius: 27,
    backgroundColor: "#1ed760",
  },

  spotifyLogoText: {
    color: "#191A18",
    fontSize: 15,
    fontWeight: "900",
  },

  headerCopy: {
    flex: 1,
  },

  connectedEyebrow: {
    color: "#65db87",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  connectedHeading: {
    marginTop: 5,
    color: canalDynamicColors.text,
    fontSize: 18,
    fontWeight: "700",
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 17,
    backgroundColor: "#182a1e",
  },

  profileImage: {
    width: 53,
    height: 53,
    marginRight: 13,
    borderRadius: 27,
  },

  profilePlaceholder: {
    width: 53,
    height: 53,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    borderRadius: 27,
    backgroundColor: "#1ed760",
  },

  profilePlaceholderText: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "900",
  },

  profileCopy: {
    flex: 1,
  },

  profileName: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  profileDetail: {
    marginTop: 4,
    color: canalDynamicColors.muted,
    fontSize: 12,
  },

  changeButton: {
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#34583f",
    borderRadius: 15,
  },

  changeButtonText: {
    color: "#365F46",
    fontSize: 13,
    fontWeight: "700",
  },

  connectCard: {
    alignItems: "center",
    gap: 11,
    padding: 23,
    borderWidth: 1,
    borderColor: "#245c37",
    borderRadius: 24,
    backgroundColor: canalDynamicColors.surface,
  },

  spotifyLogoLarge: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 38,
    backgroundColor: "#1ed760",
  },

  spotifyLogoLargeText: {
    color: "#191A18",
    fontSize: 20,
    fontWeight: "900",
  },

  connectCardTitle: {
    color: canalDynamicColors.text,
    fontSize: 21,
    fontWeight: "700",
  },

  connectCardText: {
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  spotifyButton: {
    minHeight: 55,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
    borderRadius: 17,
    backgroundColor: "#1ed760",
  },

  spotifyButtonText: {
    color: "#191A18",
    fontSize: 16,
    fontWeight: "800",
  },

  explanationCard: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D9D3C8",
    borderRadius: 21,
    backgroundColor: canalDynamicColors.surface,
  },

  explanationTitle: {
    color: canalDynamicColors.text,
    fontSize: 17,
    fontWeight: "700",
  },

  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  benefitNumber: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderRadius: 12,
    backgroundColor: canalDynamicColors.surface,
  },

  benefitNumberText: {
    color: canalDynamicColors.lavender,
    fontSize: 10,
    fontWeight: "800",
  },

  benefitText: {
    flex: 1,
    color: canalDynamicColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  footer: {
    gap: 9,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#262d29",
    backgroundColor: canalDynamicColors.baseCanvas,
  },

  continueButton: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#4C46C8",
  },

  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  footerText: {
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.99,
      },
    ],
  },
});
