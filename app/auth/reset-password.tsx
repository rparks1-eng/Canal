import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
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

import { CanalAlert } from "../../lib/canal-alert";

import * as Linking from "expo-linking";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  completeSupabaseAuthUrl,
  isPasswordRecoveryUrl,
  updateCanalPassword,
} from "../../lib/canal-auth";

import {
  supabase,
} from "../../lib/supabase";

type RecoveryState =
  | "checking"
  | "ready"
  | "saving"
  | "error";

export default function ResetPasswordScreen() {
  const params =
    useLocalSearchParams<{
      verified?: string;
    }>();

  const incomingUrl =
    Linking.useURL();

  const processedUrl =
    useRef<string | null>(
      null,
    );

  const saveInFlight = useRef(false);

  const [
    recoveryState,
    setRecoveryState,
  ] =
    useState<RecoveryState>(
      "checking",
    );

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmation,
    setConfirmation,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    let active =
      true;

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          session,
        ) => {
          if (
            active &&
            event ===
              "PASSWORD_RECOVERY" &&
            session
          ) {
            setErrorMessage(
              "",
            );

            setRecoveryState(
              "ready",
            );
          }
        },
      );

    const prepare =
      async (): Promise<void> => {
        try {
          if (
            params.verified ===
            "1"
          ) {
            const {
              data: {
                session,
              },
            } =
              await supabase.auth.getSession();

            if (!session) {
              throw new Error(
                "The verified recovery session is missing. Request a new reset email.",
              );
            }

            if (active) {
              setRecoveryState(
                "ready",
              );
            }

            return;
          }

          const url =
            incomingUrl ||
            (await Linking.getInitialURL());

          if (
            !url ||
            !isPasswordRecoveryUrl(
              url,
            )
          ) {
            throw new Error(
              "Open the newest password-reset email link first. In the iOS Simulator, return to Forgot Password and paste the complete link.",
            );
          }

          if (
            processedUrl.current ===
            url
          ) {
            return;
          }

          processedUrl.current =
            url;

          await completeSupabaseAuthUrl(
            url,
          );

          if (active) {
            setErrorMessage(
              "",
            );

            setRecoveryState(
              "ready",
            );
          }
        } catch (error) {
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Canal could not verify the password-reset link.",
            );

            setRecoveryState(
              "error",
            );
          }
        }
      };

    void prepare();

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, [
    incomingUrl,
    params.verified,
  ]);

  const savePassword =
    async (): Promise<void> => {
      if (saveInFlight.current || recoveryState !== "ready") {
        return;
      }

      if (
        password !==
        confirmation
      ) {
        setErrorMessage(
          "The passwords do not match.",
        );

        return;
      }

      saveInFlight.current = true;

      setRecoveryState(
        "saving",
      );

      setErrorMessage("");

      try {
        await updateCanalPassword(
          password,
        );

        const {
          error: signOutError,
        } =
          await supabase.auth.signOut({
            scope:
              "local",
          });

        if (signOutError) {
          throw signOutError;
        }

        CanalAlert.alert(
          "Password updated",
          "Your Canal password has been changed. Sign in using the new password.",
          [
            {
              text:
                "Return to Login",

              onPress: () => {
                router.replace(
                  "/login" as never,
                );
              },
            },
          ],
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not update the password.",
        );

        setRecoveryState(
          "ready",
        );
      } finally {
        saveInFlight.current = false;
      }
    };

  const returnToForgotPassword =
    (): void => {
      router.replace(
        "/auth/forgot-password" as never,
      );
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
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {recoveryState ===
          "checking" ? (
            <>
              <ActivityIndicator
                size="large"
              />

              <Text
                style={
                  styles.checkingText
                }
              >
                Verifying the password-reset link...
              </Text>
            </>
          ) : null}

          {recoveryState ===
          "error" ? (
            <>
              <Text
                style={
                  styles.errorTitle
                }
              >
                Reset link unavailable
              </Text>

              <Text
                style={
                  styles.errorBody
                }
              >
                {errorMessage}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={
                  returnToForgotPassword
                }
                style={
                  styles.primaryButton
                }
              >
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Request Another Email
                </Text>
              </Pressable>
            </>
          ) : null}

          {recoveryState ===
            "ready" ||
          recoveryState ===
            "saving" ? (
            <>
              <Text
                style={
                  styles.title
                }
              >
                Choose a new password
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                Your reset link is verified. Enter a new password with at least eight characters.
              </Text>

              <TextInput
                value={
                  password
                }
                onChangeText={
                  setPassword
                }
                placeholder="New password"
                placeholderTextColor={canalDynamicColors.muted}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                autoCorrect={
                  false
                }
                style={
                  styles.input
                }
              />

              <TextInput
                value={
                  confirmation
                }
                onChangeText={
                  setConfirmation
                }
                placeholder="Confirm new password"
                placeholderTextColor={canalDynamicColors.muted}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                autoCorrect={
                  false
                }
                style={[
                  styles.input,
                  styles.secondInput,
                ]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Update Password"
                accessibilityState={{
                  busy: recoveryState === "saving",
                  disabled: recoveryState === "saving",
                }}
                disabled={
                  recoveryState ===
                  "saving"
                }
                onPress={() =>
                  void savePassword()
                }
                style={[
                  styles.primaryButton,

                  recoveryState ===
                    "saving" &&
                    styles.disabled,
                ]}
              >
                {recoveryState ===
                "saving" ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    Update Password
                  </Text>
                )}
              </Pressable>

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
            </>
          ) : null}
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
      justifyContent:
        "center",
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 70,
    },

    checkingText: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      textAlign: "center",
      marginTop: 15,
    },

    title: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 29,
      fontWeight: "900",
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 21,
    },

    input: {
      minHeight: 51,
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 15,
      paddingHorizontal: 14,
    },

    secondInput: {
      marginTop: 11,
    },

    primaryButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
      marginTop: 16,
      paddingHorizontal: 18,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    errorTitle: {
      color: canalDynamicColors.danger,
      fontSize: 25,
      fontWeight: "900",
      textAlign: "center",
    },

    errorBody: {
      color: "#7E514D",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 9,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 14,
      marginTop: 15,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

    disabled: {
      opacity: 0.45,
    },
  });
