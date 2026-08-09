import {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as Linking from "expo-linking";

import {
  router,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  completeSupabaseAuthUrl,
} from "../../lib/canal-auth";

export default function AuthCallbackScreen() {
  const callbackUrl =
    Linking.useURL();

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    let cancelled =
      false;

    const complete =
      async (): Promise<void> => {
        const url =
          callbackUrl ||
          (await Linking.getInitialURL());

        if (!url) {
          throw new Error(
            "Canal did not receive an authentication callback.",
          );
        }

        await completeSupabaseAuthUrl(
          url,
        );

        if (!cancelled) {
          router.replace(
            "/login" as never,
          );
        }
      };

    complete().catch(
      (error: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not complete authentication.",
          );
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    callbackUrl,
  ]);

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.content}>
        {errorMessage ? (
          <>
            <Text
              style={
                styles.errorTitle
              }
            >
              Authentication failed
            </Text>

            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>

            <Pressable
              accessibilityLabel="Return to Login"
              accessibilityRole="button"
              accessibilityState={{
                disabled: false,
              }}
              onPress={() =>
                router.replace(
                  "/login" as never,
                )
              }
              style={
                styles.button
              }
            >
              <Text
                style={
                  styles.buttonText
                }
              >
                Return to Login
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator
              size="large"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Completing sign-in...
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#F3EFE5",
    },

    content: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 24,
    },

    loadingText: {
      color: "#6D6B64",
      fontSize: 14,
      marginTop: 14,
    },

    errorTitle: {
      color: "#A62E27",
      fontSize: 23,
      fontWeight: "900",
    },

    errorText: {
      color: "#7E3833",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 8,
    },

    button: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
      marginTop: 18,
      paddingHorizontal: 22,
    },

    buttonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },
  });
