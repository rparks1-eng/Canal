import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
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
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  completePasswordRecoveryFromLink,
  requestPasswordReset,
} from "../../lib/canal-auth";

export default function ForgotPasswordScreen() {
  const [
    email,
    setEmail,
  ] = useState("");

  const sendingInFlight = useRef(false);
  const openingInFlight = useRef(false);

  const [
    recoveryLink,
    setRecoveryLink,
  ] = useState("");

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    opening,
    setOpening,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const submit =
    async (): Promise<void> => {
      if (sendingInFlight.current) {
        return;
      }

      sendingInFlight.current = true;

      setSending(
        true,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await requestPasswordReset(
          email,
        );

        setMessage(
          "Reset email sent. Open the newest email and tap its button. If Canal does not open, copy the button's complete link and paste it below.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not send the reset email.",
        );
      } finally {
        sendingInFlight.current = false;
        setSending(
          false,
        );
      }
    };

  const openPastedLink =
    async (): Promise<void> => {
      if (openingInFlight.current) {
        return;
      }

      openingInFlight.current = true;

      setOpening(
        true,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await completePasswordRecoveryFromLink(
          recoveryLink,
        );

        router.replace({
          pathname:
            "/auth/reset-password",

          params: {
            verified:
              "1",
          },
        } as never);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not verify the password-reset link.",
        );
      } finally {
        openingInFlight.current = false;
        setOpening(
          false,
        );
      }
    };

  const goBack =
    (): void => {
      router.replace(
        "/login" as never,
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <Pressable
            accessibilityLabel="Back to sign in"
            accessibilityRole="button"
            onPress={
              goBack
            }
            style={
              styles.backButton
            }
          >
            <Text
              style={
                styles.backText
              }
            >
              ‹
            </Text>
          </Pressable>

          <Text
            style={
              styles.title
            }
          >
            Reset your password
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Enter the email used for your Canal account.
          </Text>

          <Text
            style={
              styles.label
            }
          >
            Account email
          </Text>

          <TextInput
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send Reset Email"
            accessibilityState={{
              busy: sending,
              disabled: sending,
            }}
            disabled={
              sending
            }
            onPress={() =>
              void submit()
            }
            style={[
              styles.primaryButton,

              sending &&
                styles.disabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Send Reset Email
              </Text>
            )}
          </Pressable>

          <View
            style={
              styles.simulatorCard
            }
          >
            <Text
              style={
                styles.simulatorTitle
              }
            >
              Reset link did not open?
            </Text>

            <Text
              style={
                styles.simulatorText
              }
            >
              Press and hold the reset button in the newest email, copy its complete link, then paste it here. This also works in the iOS Simulator.
            </Text>

            <TextInput
              value={
                recoveryLink
              }
              onChangeText={
                setRecoveryLink
              }
              placeholder="Paste the complete https:// link"
              placeholderTextColor={canalDynamicColors.muted}
              autoCapitalize="none"
              autoCorrect={
                false
              }
              multiline
              style={[
                styles.input,
                styles.linkInput,
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Verify Reset Link"
              accessibilityState={{
                busy: opening,
                disabled: opening || !recoveryLink.trim(),
              }}
              disabled={
                opening ||
                !recoveryLink.trim()
              }
              onPress={() =>
                void openPastedLink()
              }
              style={[
                styles.secondaryButton,

                (
                  opening ||
                  !recoveryLink.trim()
                ) &&
                  styles.disabled,
              ]}
            >
              {opening ? (
                <ActivityIndicator
                  color="#4C46C8"
                />
              ) : (
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Verify Reset Link
                </Text>
              )}
            </Pressable>
          </View>

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
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 40,
    },

    backButton: {
      width: 48,
      height: 48,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
    },

    title: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 29,
      fontWeight: "900",
      marginTop: 34,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 22,
    },

    label: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 7,
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
      paddingVertical: 12,
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
      marginTop: 14,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    simulatorCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 20,
      padding: 17,
      marginTop: 24,
    },

    simulatorTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    simulatorText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 7,
      marginBottom: 13,
    },

    linkInput: {
      minHeight: 88,
      textAlignVertical:
        "top",
    },

    secondaryButton: {
      minHeight: 49,
      borderWidth: 1,
      borderColor:
        "#4C46C8",
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop: 12,
    },

    secondaryButtonText: {
      color: canalDynamicColors.lavender,
      fontSize: 14,
      fontWeight: "900",
    },

    messageBox: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 15,
      padding: 14,
      marginTop: 16,
    },

    messageText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 14,
      marginTop: 16,
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
