import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  rememberDeferredDestination,
} from "../lib/deferred-destination";

import {
  loginModeFromParam,
} from "../lib/login-route";

import type {
  LoginMode,
} from "../lib/login-route";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  signInWithEmail,
  signInWithSocial,
  signUpWithEmail,
} from "../lib/canal-auth";

import {
  readCanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

import type {
  CanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

import {
  isOnboardingRequired,
  markOnboardingRequired,
  ONBOARDING_METADATA_KEY,
  rememberPendingSignup,
} from "../lib/onboarding";

import {
  useAuth,
} from "../providers/auth-provider";

async function continueAfterAccountLogin(
  session: Session,
): Promise<void> {
  await isOnboardingRequired(
    session.user.id,
    session.user.email,
    session.user.created_at,
    session.user.user_metadata?.[
      ONBOARDING_METADATA_KEY
    ],
  );
}

function isFirstSocialSignIn(
  session: Session,
): boolean {
  const createdAt =
    Date.parse(
      session.user.created_at,
    );

  const lastSignInAt =
    Date.parse(
      session.user.last_sign_in_at ??
        "",
    );

  return (
    Number.isFinite(
      createdAt,
    ) &&
    Number.isFinite(
      lastSignInAt,
    ) &&
    Math.abs(
      lastSignInAt -
        createdAt,
    ) <
      120_000
  );
}

export default function LoginScreen() {
  const params = useLocalSearchParams<{
    destination?: string;
    mode?: string | string[];
  }>();

  const requestedMode =
    loginModeFromParam(
      params.mode,
    );

  const {
    configured,
  } =
    useAuth();

  const [
    mode,
    setMode,
  ] =
    useState<LoginMode>(
      requestedMode,
    );

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [
    handle,
    setHandle,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    socialProviders,
    setSocialProviders,
  ] = useState<CanalSocialAuthProviderAvailability | null>(null);

  useEffect(() => {
    let active = true;

    if (!configured) {
      setSocialProviders({ google: false, apple: false });
      return () => { active = false; };
    }

    void readCanalSocialAuthProviderAvailability()
      .then((availability) => {
        if (active) setSocialProviders(availability);
      })
      .catch(() => {
        if (active) setSocialProviders({ google: false, apple: false });
      });

    return () => { active = false; };
  }, [configured]);

  const submissionInFlight =
    useRef(false);

  useEffect(() => {
    if (typeof params.destination === "string") {
      void rememberDeferredDestination(
        params.destination,
      );
    }
  }, [params.destination]);

  useEffect(() => {
    setMode(requestedMode);
    setMessage("");
    setErrorMessage("");
  }, [requestedMode]);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const changeMode = (
    nextMode: LoginMode,
  ): void => {
    setMode(
      nextMode,
    );

    setMessage("");
    setErrorMessage("");
  };

  const submitEmail =
    async (): Promise<void> => {
      if (submissionInFlight.current) {
        return;
      }

      submissionInFlight.current = true;
      setLoading(true);
      setMessage("");
      setErrorMessage("");

      try {
        if (
          mode ===
          "sign-in"
        ) {
          const session =
            await signInWithEmail(
              email,
              password,
            );

          await continueAfterAccountLogin(
            session,
          );

          return;
        }

        const result =
          await signUpWithEmail({
            email,
            password,
            displayName,
            handle,
          });

        if (
          result.needsEmailConfirmation
        ) {
          await rememberPendingSignup(
            email,
          );

          setMessage(
            "Your Canal account was created. Open the confirmation email, confirm the account, then return here and sign in.",
          );

          setMode(
            "sign-in",
          );

          return;
        }

        if (!result.session) {
          throw new Error(
            "Canal created the account but did not return a usable session.",
          );
        }

        await markOnboardingRequired(
          result.session.user.id,
        );

        await continueAfterAccountLogin(
          result.session,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not authenticate your account.",
        );
      } finally {
        submissionInFlight.current = false;
        setLoading(false);
      }
    };

  const submitSocial =
    async (
      provider:
        | "google"
        | "apple",
    ): Promise<void> => {
      if (submissionInFlight.current) {
        return;
      }

      submissionInFlight.current = true;
      setLoading(true);
      setMessage("");
      setErrorMessage("");

      try {
        const session =
          await signInWithSocial(
            provider,
          );

        if (
          isFirstSocialSignIn(
            session,
          )
        ) {
          await markOnboardingRequired(
            session.user.id,
          );
        }

        await continueAfterAccountLogin(
          session,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : `${provider} sign-in failed.`,
        );
      } finally {
        submissionInFlight.current = false;
        setLoading(false);
      }
    };

  const emailSubmissionDisabled =
    loading ||
    !configured;

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "bottom",
      ]}
    >
      <KeyboardAvoidingView
        style={
          styles.flex
        }
        behavior={
          Platform.OS ===
          "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View
            style={
              styles.logo
            }
          >
            <Text
              style={
                styles.logoText
              }
            >
              c
            </Text>
          </View>

          <Text
            style={
              styles.brand
            }
          >
            canal
          </Text>

          <Text
            style={
              styles.title
            }
          >
            {mode ===
            "sign-in"
              ? "Welcome back."
              : "Create your Canal account."}
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Sign in to Canal first. Music
            platforms are connected after
            your Canal account is active.
          </Text>

          {!configured ? (
            <View
              style={
                styles.configurationBox
              }
            >
              <Text
                style={
                  styles.configurationTitle
                }
              >
                Supabase setup required
              </Text>

              <Text
                style={
                  styles.configurationText
                }
              >
                Your Supabase URL or
                publishable key is missing
                from Canal&apos;s
                .env.local file.
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.modeContainer
            }
          >
            <Pressable
              accessibilityLabel="Sign in mode"
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "sign-in" }}
              onPress={() =>
                changeMode(
                  "sign-in",
                )
              }
              style={[
                styles.modeButton,

                mode ===
                  "sign-in" &&
                  styles.modeButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.modeText,

                  mode ===
                    "sign-in" &&
                    styles.modeTextSelected,
                ]}
              >
                Sign In
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Create account mode"
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "create-account" }}
              onPress={() =>
                changeMode(
                  "create-account",
                )
              }
              style={[
                styles.modeButton,

                mode ===
                  "create-account" &&
                  styles.modeButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.modeText,

                  mode ===
                    "create-account" &&
                    styles.modeTextSelected,
                ]}
              >
                Create Account
              </Text>
            </Pressable>
          </View>

          {mode ===
          "create-account" ? (
            <>
              <Text
                style={
                  styles.inputLabel
                }
              >
                Display name
              </Text>

              <TextInput
                accessibilityLabel="Display name"
                value={
                  displayName
                }
                onChangeText={
                  setDisplayName
                }
                placeholder="Your name"
                placeholderTextColor={canalDynamicColors.muted}
                autoCapitalize="words"
                maxLength={60}
                style={
                  styles.input
                }
              />

              <Text
                style={
                  styles.inputLabel
                }
              >
                Handle
              </Text>

              <TextInput
                accessibilityLabel="Handle"
                value={
                  handle
                }
                onChangeText={
                  setHandle
                }
                placeholder="@yourhandle"
                placeholderTextColor={canalDynamicColors.muted}
                autoCapitalize="none"
                autoCorrect={
                  false
                }
                maxLength={24}
                style={
                  styles.input
                }
              />
            </>
          ) : null}

          <Text
            style={
              styles.inputLabel
            }
          >
            Email
          </Text>

          <TextInput
            accessibilityLabel="Email"
            value={
              email
            }
            onChangeText={
              setEmail
            }
            placeholder="you@example.com"
            placeholderTextColor={canalDynamicColors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={
              false
            }
            textContentType="emailAddress"
            style={
              styles.input
            }
          />

          <Text
            style={
              styles.inputLabel
            }
          >
            Password
          </Text>

          <TextInput
            accessibilityLabel="Password"
            value={
              password
            }
            onChangeText={
              setPassword
            }
            placeholder="At least 8 characters"
            placeholderTextColor={canalDynamicColors.muted}
            secureTextEntry
            textContentType={
              mode ===
              "sign-in"
                ? "password"
                : "newPassword"
            }
            returnKeyType="go"
            onSubmitEditing={() => {
              if (!emailSubmissionDisabled) {
                void submitEmail();
              }
            }}
            style={
              styles.input
            }
          />

          {mode ===
          "sign-in" ? (
            <Pressable
              accessibilityLabel="Forgot password"
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  "/auth/forgot-password" as never,
                )
              }
              style={
                styles.forgotButton
              }
            >
              <Text
                style={
                  styles.forgotText
                }
              >
                Forgot password?
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel={
              mode === "sign-in"
                ? "Sign In to Canal"
                : "Create Canal Account"
            }
            accessibilityRole="button"
            accessibilityState={{
              busy: loading,
              disabled: emailSubmissionDisabled,
            }}
            disabled={emailSubmissionDisabled}
            onPress={() =>
              void submitEmail()
            }
            style={({
              pressed,
            }) => [
              styles.primaryButton,

              emailSubmissionDisabled &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {mode ===
                "sign-in"
                  ? "Sign In to Canal"
                  : "Create Canal Account"}
              </Text>
            )}
          </Pressable>

          <View
            style={
              styles.dividerRow
            }
          >
            <View
              style={
                styles.divider
              }
            />

            <Text
              style={
                styles.dividerText
              }
            >
              OR
            </Text>

            <View
              style={
                styles.divider
              }
            />
          </View>

          <Pressable
            accessibilityLabel="Continue with Google"
            accessibilityRole="button"
            accessibilityState={{
              busy: loading,
              disabled:
                loading ||
                !configured ||
                socialProviders?.google !== true,
            }}
            disabled={
              loading ||
              !configured ||
              socialProviders?.google !== true
            }
            onPress={() =>
              void submitSocial(
                "google",
              )
            }
            style={({
              pressed,
            }) => [
              styles.socialButton,

              (loading ||
                !configured ||
                socialProviders?.google !== true) &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.socialButtonText
              }
            >
              Continue with Google
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Continue with Apple"
            accessibilityRole="button"
            accessibilityState={{
              busy: loading,
              disabled:
                loading ||
                !configured ||
                socialProviders?.apple !== true,
            }}
            disabled={
              loading ||
              !configured ||
              socialProviders?.apple !== true
            }
            onPress={() =>
              void submitSocial(
                "apple",
              )
            }
            style={({
              pressed,
            }) => [
              styles.appleButton,

              (loading ||
                !configured ||
                socialProviders?.apple !== true) &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.appleButtonText
              }
            >
              Continue with Apple
            </Text>
          </Pressable>

          {configured && socialProviders && (!socialProviders.google || !socialProviders.apple) ? (
            <Text accessibilityLiveRegion="polite" style={styles.socialAvailabilityText}>
              {!socialProviders.google && !socialProviders.apple
                ? "Google and Apple sign-in are not enabled for this Canal environment yet."
                : `${socialProviders.google ? "Apple" : "Google"} sign-in is not enabled for this Canal environment yet.`}
            </Text>
          ) : null}

          {message ? (
            <View
              style={
                styles.messageBox
              }
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

          {errorMessage ? (
            <View
              style={
                styles.errorBox
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <Text
            style={
              styles.musicNotice
            }
          >
            Spotify is not used to create
            your Canal account. It is linked
            only after account authentication.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex: 1,
    },

    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 45,
    },

    logo: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems:
        "center",
      justifyContent:
        "center",
      alignSelf:
        "center",
      backgroundColor:
        "#4C46C8",
    },

    logoText: {
      color: "#FFFFFF",
      fontSize: 39,
      fontWeight: "900",
      marginTop: -5,
    },

    brand: {
      color: canalDynamicColors.lavender,
      fontSize: 21,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 10,
    },

    title: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 19,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 7,
      marginBottom: 20,
    },

    configurationBox: {
      backgroundColor: canalDynamicColors.warningSurface,
      borderRadius: 17,
      padding: 14,
      marginBottom: 15,
    },

    configurationTitle: {
      color: "#A64B0C",
      fontSize: 14,
      fontWeight: "900",
    },

    configurationText: {
      color: "#7B5234",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    modeContainer: {
      flexDirection: "row",
      backgroundColor:
        "#EEE7E1",
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
    },

    modeButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 11,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    modeButtonSelected: {
      backgroundColor: canalDynamicColors.surface,
    },

    modeText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      fontWeight: "800",
    },

    modeTextSelected: {
      color: canalDynamicColors.lavender,
    },

    inputLabel: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 6,
      marginTop: 10,
    },

    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 15,
      paddingHorizontal: 14,
    },

    forgotButton: {
      alignSelf:
        "flex-end",
      minHeight: 48,
      justifyContent: "center",
      paddingVertical: 10,
    },

    forgotText: {
      color: canalDynamicColors.lavender,
      fontSize: 12,
      fontWeight: "800",
    },

    primaryButton: {
      minHeight: 54,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
      marginTop: 12,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    dividerRow: {
      flexDirection: "row",
      alignItems:
        "center",
      marginVertical: 17,
    },

    divider: {
      flex: 1,
      height: 1,
      backgroundColor:
        "#DED6D0",
    },

    dividerText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "800",
      marginHorizontal: 11,
    },

    socialButton: {
      minHeight: 52,
      borderWidth: 1,
      borderColor:
        "#DAD2CC",
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
    },

    socialButtonText: {
      color: "#2A2724",
      fontSize: 14,
      fontWeight: "900",
    },

    appleButton: {
      minHeight: 52,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#111111",
      marginTop: 10,
    },

    appleButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    socialAvailabilityText: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 10,
      textAlign: "center",
    },

    messageBox: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 15,
      padding: 13,
      marginTop: 15,
    },

    messageText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 13,
      marginTop: 15,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

    musicNotice: {
      color: "#6D6B64",
      fontSize: 10,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 17,
      paddingHorizontal: 12,
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
