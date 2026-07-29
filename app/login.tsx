import {
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
} from "expo-router";

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
  isOnboardingRequired,
  markOnboardingRequired,
  ONBOARDING_METADATA_KEY,
  rememberPendingSignup,
} from "../lib/onboarding";

import {
  useAuth,
} from "../providers/auth-provider";

type LoginMode =
  | "sign-in"
  | "create-account";

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
  const {
    configured,
  } =
    useAuth();

  const [
    mode,
    setMode,
  ] =
    useState<LoginMode>(
      "sign-in",
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
      if (loading) {
        return;
      }

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
        setLoading(false);
      }
    };

  const submitSocial =
    async (
      provider:
        | "google"
        | "apple",
    ): Promise<void> => {
      if (loading) {
        return;
      }

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
        setLoading(false);
      }
    };

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
              accessibilityRole="button"
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
              accessibilityRole="button"
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
                value={
                  displayName
                }
                onChangeText={
                  setDisplayName
                }
                placeholder="Your name"
                placeholderTextColor="#9A938C"
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
                value={
                  handle
                }
                onChangeText={
                  setHandle
                }
                placeholder="@yourhandle"
                placeholderTextColor="#9A938C"
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
            value={
              email
            }
            onChangeText={
              setEmail
            }
            placeholder="you@example.com"
            placeholderTextColor="#9A938C"
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
            value={
              password
            }
            onChangeText={
              setPassword
            }
            placeholder="At least 8 characters"
            placeholderTextColor="#9A938C"
            secureTextEntry
            textContentType={
              mode ===
              "sign-in"
                ? "password"
                : "newPassword"
            }
            style={
              styles.input
            }
          />

          {mode ===
          "sign-in" ? (
            <Pressable
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
            accessibilityRole="button"
            disabled={
              loading ||
              !configured
            }
            onPress={() =>
              void submitEmail()
            }
            style={({
              pressed,
            }) => [
              styles.primaryButton,

              (loading ||
                !configured) &&
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
            accessibilityRole="button"
            disabled={
              loading ||
              !configured
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
                !configured) &&
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
            accessibilityRole="button"
            disabled={
              loading ||
              !configured
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
                !configured) &&
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
      backgroundColor:
        "#FFF9F4",
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
        "#F47A24",
    },

    logoText: {
      color: "#FFFFFF",
      fontSize: 39,
      fontWeight: "900",
      marginTop: -5,
    },

    brand: {
      color: "#F47A24",
      fontSize: 21,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 10,
    },

    title: {
      color: "#181818",
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 19,
    },

    subtitle: {
      color: "#6C655F",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 7,
      marginBottom: 20,
    },

    configurationBox: {
      backgroundColor:
        "#FFF0E5",
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
      minHeight: 41,
      borderRadius: 11,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    modeButtonSelected: {
      backgroundColor:
        "#FFFFFF",
    },

    modeText: {
      color: "#77706A",
      fontSize: 13,
      fontWeight: "800",
    },

    modeTextSelected: {
      color: "#F47A24",
    },

    inputLabel: {
      color: "#5E5752",
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
      backgroundColor:
        "#FFFFFF",
      color: "#1B1B1B",
      fontSize: 15,
      paddingHorizontal: 14,
    },

    forgotButton: {
      alignSelf:
        "flex-end",
      paddingVertical: 10,
    },

    forgotText: {
      color: "#F47A24",
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
        "#F47A24",
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
      color: "#918981",
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
      backgroundColor:
        "#FFFFFF",
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

    messageBox: {
      backgroundColor:
        "#EAF9EF",
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
      backgroundColor:
        "#FFF0EF",
      borderRadius: 15,
      padding: 13,
      marginTop: 15,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

    musicNotice: {
      color: "#918981",
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
