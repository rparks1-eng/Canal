import {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";

import { CanalAlert } from "../lib/canal-alert";

import {
  router,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  deleteCanalAccount,
} from "../lib/account-deletion";

import {
  clearLocalAccountAfterDeletion,
} from "../lib/app-session";

import {
  useAuth,
} from "../providers/auth-provider";

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(
    "/settings",
  );
}

export default function DeleteAccountScreen() {
  const colorScheme =
    useColorScheme();
  const dark =
    colorScheme === "dark";
  const {
    user,
  } = useAuth();
  const [
    confirmation,
    setConfirmation,
  ] = useState("");
  const [
    deleting,
    setDeleting,
  ] = useState(false);
  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const requiredConfirmation =
    useMemo(
      () =>
        user?.email
          ?.trim()
          .toLowerCase() ||
        "delete",
      [
        user?.email,
      ],
    );
  const confirmationMatches =
    confirmation
      .trim()
      .toLowerCase() ===
    requiredConfirmation;
  const colors = {
    background:
      dark
        ? "#160F14"
        : "#FFF9F7",
    surface:
      dark
        ? "rgba(255,255,255,0.07)"
        : "rgba(255,255,255,0.72)",
    text:
      dark
        ? "#FFF6F7"
        : "#321B22",
    muted:
      dark
        ? "rgba(255,246,247,0.70)"
        : "rgba(50,27,34,0.66)",
    line:
      dark
        ? "rgba(255,246,247,0.16)"
        : "rgba(50,27,34,0.14)",
    danger:
      dark
        ? "#FFB2BC"
        : "#A12834",
  };

  const permanentlyDelete =
    async (): Promise<void> => {
      if (
        deleting ||
        !user ||
        !confirmationMatches
      ) {
        return;
      }

      setDeleting(true);
      setErrorMessage("");

      try {
        await deleteCanalAccount(
          user.id,
          confirmation,
        );
        await clearLocalAccountAfterDeletion();
        router.replace({
          pathname: "/login",
          params: {
            deleted: "1",
          },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not permanently delete this account.",
        );
        setDeleting(false);
      }
    };

  const confirmPermanentDeletion =
    (): void => {
      if (!confirmationMatches) {
        setErrorMessage(
          `Enter ${user?.email ?? "DELETE"} exactly to continue.`,
        );
        return;
      }

      if (Platform.OS === "web") {
        const confirm = (
          globalThis as typeof globalThis & {
            confirm?: (prompt: string) => boolean;
          }
        ).confirm;

        if (
          typeof confirm === "function" &&
          confirm(
            "Permanently delete this Canal account? This cannot be undone.",
          )
        ) {
          void permanentlyDelete();
        }

        return;
      }

      CanalAlert.alert(
        "Permanently Delete Account?",
        "This cannot be undone. Canal will remove the account and its profile, Scenes, Snapshots, Stages, social activity, and uploaded profile photo.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete Forever",
            style: "destructive",
            onPress: () => {
              void permanentlyDelete();
            },
          },
        ],
      );
    };

  if (!user) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor:
              colors.background,
          },
        ]}
      >
        <Text
          style={[
            styles.signedOutText,
            {
              color:
                colors.text,
            },
          ]}
        >
          Sign in before deleting an account.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.replace(
              "/login",
            )
          }
          style={
            styles.returnButton
          }
        >
          <Text
            style={{
              color:
                colors.text,
            }}
          >
            Return to Login
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={[
        "top",
        "bottom",
      ]}
      style={[
        styles.safeArea,
        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityLabel="Back to Settings"
          accessibilityRole="button"
          disabled={deleting}
          onPress={goBack}
          style={
            styles.backButton
          }
        >
          <Text
            style={[
              styles.backText,
              {
                color:
                  colors.text,
              },
            ]}
          >
            ‹
          </Text>
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            {
              color:
                colors.text,
            },
          ]}
        >
          Delete Account
        </Text>
        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor:
                colors.surface,
              borderColor:
                colors.line,
            },
          ]}
        >
          <Text
            style={[
              styles.eyebrow,
              {
                color:
                  colors.danger,
              },
            ]}
          >
            PERMANENT ACTION
          </Text>
          <Text
            style={[
              styles.title,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Delete your Canal account and its data.
          </Text>
          <Text
            style={[
              styles.body,
              {
                color:
                  colors.muted,
              },
            ]}
          >
            This removes your Supabase Auth account and Canal profile, Scenes, Snapshots, hosted Stages, memberships, messages, follows, activity, exports, and uploaded profile photo. This cannot be recovered.
          </Text>

          <Text
            style={[
              styles.label,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Enter {user.email ?? "DELETE"} to confirm
          </Text>
          <TextInput
            accessibilityLabel="Account deletion confirmation"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!deleting}
            onChangeText={(value) => {
              setConfirmation(
                value,
              );
              setErrorMessage("");
            }}
            placeholder={
              user.email ??
              "DELETE"
            }
            placeholderTextColor={
              colors.muted
            }
            style={[
              styles.input,
              {
                color:
                  colors.text,
                borderColor:
                  colors.line,
              },
            ]}
            value={
              confirmation
            }
          />

          {errorMessage ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[
                styles.error,
                {
                  color:
                    colors.danger,
                },
              ]}
            >
              {errorMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityHint="Permanently deletes the signed-in Canal account after one final confirmation."
            accessibilityLabel="Permanently delete this account"
            accessibilityRole="button"
            accessibilityState={{
              busy: deleting,
              disabled:
                !confirmationMatches ||
                deleting,
            }}
            disabled={
              !confirmationMatches ||
              deleting
            }
            onPress={
              confirmPermanentDeletion
            }
            style={[
              styles.deleteButton,
              {
                backgroundColor:
                  colors.danger,
              },
              (
                !confirmationMatches ||
                deleting
              ) &&
                styles.disabled,
            ]}
          >
            {deleting ? (
              <ActivityIndicator
                color={
                  colors.background
                }
              />
            ) : (
              <Text
                style={[
                  styles.deleteText,
                  {
                    color:
                      colors.background,
                  },
                ]}
              >
                Permanently Delete Account
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
    },
    header: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 16,
    },
    backButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent:
        "center",
    },
    backText: {
      fontSize: 34,
      lineHeight: 36,
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: "700",
    },
    headerSpacer: {
      width: 48,
      height: 48,
    },
    content: {
      flexGrow: 1,
      justifyContent:
        "center",
      paddingHorizontal: 20,
      paddingVertical: 30,
    },
    card: {
      width: "100%",
      maxWidth: 620,
      alignSelf: "center",
      borderWidth: 1,
      borderRadius: 28,
      borderCurve:
        "continuous",
      padding: 24,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    title: {
      marginTop: 10,
      fontFamily: "Georgia",
      fontSize: 34,
      lineHeight: 38,
    },
    body: {
      marginTop: 14,
      fontSize: 13,
      lineHeight: 21,
    },
    label: {
      marginTop: 28,
      marginBottom: 8,
      fontSize: 12,
      fontWeight: "700",
    },
    input: {
      minHeight: 52,
      borderBottomWidth: 1,
      paddingHorizontal: 2,
      fontSize: 15,
    },
    error: {
      marginTop: 12,
      fontSize: 11,
      lineHeight: 17,
    },
    deleteButton: {
      minHeight: 52,
      marginTop: 24,
      alignItems: "center",
      justifyContent:
        "center",
      borderRadius: 18,
      borderCurve:
        "continuous",
      paddingHorizontal: 16,
    },
    deleteText: {
      fontSize: 13,
      fontWeight: "800",
    },
    disabled: {
      opacity: 0.42,
    },
    signedOutText: {
      margin: 24,
      textAlign: "center",
    },
    returnButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent:
        "center",
    },
  });
