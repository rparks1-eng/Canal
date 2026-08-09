import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import * as Haptics from "expo-haptics";
import {
  Stack,
  router,
} from "expo-router";
import {
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  joinLiveStageByCode,
} from "../lib/live-stages";

export default function JoinStageScreen() {
  const [
    code,
    setCode,
  ] = useState("");

  const [
    joining,
    setJoining,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [joinAsCollaborator, setJoinAsCollaborator] = useState(false);

  function updateCode(
    value: string,
  ) {
    setCode(
      value
        .replace(
          /\D/g,
          "",
        )
        .slice(
          0,
          6,
        ),
    );
    setError("");
  }

  async function joinStage() {
    if (
      code.length !==
      6
    ) {
      setError(
        "Stage codes contain six numbers.",
      );
      return;
    }

    try {
      setJoining(
        true,
      );
      setError("");

      const stage =
        await joinLiveStageByCode(
          code,
          undefined,
          joinAsCollaborator,
        );

      if (!stage) {
        setError(
          "That Stage was not found. Check the code or ask the host whether it is still live.",
        );
        return;
      }

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .notificationAsync(
            Haptics
              .NotificationFeedbackType
              .Success,
          );
      }

      router.replace({
        pathname:
          stage.membershipRole ===
          "collaborator"
            ? "/stage-contribution"
            : "/live-stage/[stageId]",
        params: {
          stageId:
            stage.id,
        },
      });
    } catch (
      joinError
    ) {
      setError(
        joinError instanceof
          Error
          ? joinError.message
          : "Canal could not join this Stage.",
      );
    } finally {
      setJoining(
        false,
      );
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:
            true,
          title:
            "Join a Stage",
          headerBackTitle:
            "Live",
          headerShadowVisible:
            false,
          headerStyle: {
            backgroundColor:
              "#100D0B",
          },
          headerTintColor:
            "#FFFFFF",
        }}
      />

      <KeyboardAvoidingView
        behavior={
          process.env
            .EXPO_OS ===
          "ios"
            ? "padding"
            : undefined
        }
        style={styles.screen}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.content
          }
        >
          <View
            style={
              styles.signal
            }
          >
            <View
              style={
                styles.signalRingLarge
              }
            >
              <View
                style={
                  styles.signalRingSmall
                }
              >
                <View
                  style={
                    styles.signalCore
                  }
                />
              </View>
            </View>
          </View>

          <Text
            selectable
            style={
              styles.eyebrow
            }
          >
            INVITATION CODE
          </Text>

          <Text
            selectable
            style={
              styles.heading
            }
          >
            Enter six numbers.
          </Text>

          <Text
            selectable
            style={
              styles.description
            }
          >
            A Stage code lets you
            enter both public and
            private rooms. Choose whether
            to listen or contribute your
            own Scene take.
          </Text>

          <View
            style={
              styles.codeArea
            }
          >
            <TextInput
              autoFocus
              value={code}
              onChangeText={
                updateCode
              }
              onSubmitEditing={() => {
                void joinStage();
              }}
              accessibilityLabel="Six-digit Stage code"
              placeholder="000000"
              placeholderTextColor={canalDynamicColors.muted}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={6}
              selectionColor="#F47A24"
              style={
                styles.codeInput
              }
            />

            <Text
              style={
                styles.counter
              }
            >
              {code.length}/6
            </Text>
          </View>

          <View style={styles.roleRow}>
            <View style={styles.roleCopy}>
              <Text style={styles.roleTitle}>Join as a collaborator</Text>
              <Text style={styles.roleDescription}>Contribute an existing Scene or create your own mood, activity, and genre take.</Text>
            </View>
            <Switch
              accessibilityLabel="Join this Stage as a collaborator"
              value={joinAsCollaborator}
              onValueChange={setJoinAsCollaborator}
            />
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={
                styles.errorCard
              }
            >
              <Text
                selectable
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={
              joining ||
              code.length !==
                6
            }
            onPress={() => {
              void joinStage();
            }}
            style={({
              pressed,
            }) => [
              styles.joinButton,
              (
                joining ||
                code.length !==
                  6
              ) &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {joining ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Text
                  style={
                    styles.joinIcon
                  }
                >
                  →
                </Text>

                <Text
                  style={
                    styles.joinText
                  }
                >
                  Enter Stage
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push(
                "/(tabs)/live",
              );
            }}
            style={({
              pressed,
            }) => [
              styles.browseButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.browseText
              }
            >
              Browse public Stages
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#100D0B",
    },

    content: {
      flexGrow: 1,
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 42,
      paddingBottom: 42,
      gap: 12,
    },

    roleRow: {
      width: "100%",
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.06)",
    },

    roleCopy: { flex: 1, gap: 3 },
    roleTitle: { color: canalDynamicColors.text, fontSize: 15, fontWeight: "800" },
    roleDescription: { color: canalDynamicColors.muted, fontSize: 12, lineHeight: 17 },

    signal: {
      width: 108,
      height: 108,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },

    signalRingLarge: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#4B2A1B",
      borderRadius: 48,
      backgroundColor:
        "#1D1511",
    },

    signalRingSmall: {
      width: 66,
      height: 66,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#713B21",
      borderRadius: 33,
      backgroundColor:
        "#291A13",
    },

    signalCore: {
      width: 21,
      height: 21,
      borderRadius: 11,
      backgroundColor:
        "#F47A24",
      boxShadow:
        "0 0 18px rgba(244, 122, 36, 0.65)",
    },

    eyebrow: {
      color: "#F68D48",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.5,
    },

    heading: {
      color: canalDynamicColors.text,
      fontSize: 31,
      lineHeight: 37,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: -0.8,
    },

    description: {
      maxWidth: 335,
      color: canalDynamicColors.muted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    codeArea: {
      width: "100%",
      gap: 7,
      paddingTop: 16,
    },

    codeInput: {
      width: "100%",
      minHeight: 78,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: "#46372F",
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor:
        "#1B1613",
      color: canalDynamicColors.text,
      fontSize: 36,
      lineHeight: 44,
      fontWeight: "800",
      letterSpacing: 10,
      textAlign: "center",
      fontVariant: [
        "tabular-nums",
      ],
    },

    counter: {
      alignSelf:
        "flex-end",
      color: "#766A63",
      fontSize: 11,
      fontVariant: [
        "tabular-nums",
      ],
    },

    errorCard: {
      width: "100%",
      padding: 14,
      borderWidth: 1,
      borderColor: "#663527",
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor:
        "#301A14",
    },

    errorText: {
      color: "#FFAD94",
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },

    joinButton: {
      width: "100%",
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      marginTop: 4,
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
      boxShadow:
        "0 10px 24px rgba(173, 67, 4, 0.24)",
    },

    joinIcon: {
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
    },

    joinText: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    browseButton: {
      minHeight: 48,
      justifyContent:
        "center",
      paddingHorizontal: 14,
    },

    browseText: {
      color: "#E99660",
      fontSize: 14,
      fontWeight: "800",
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
      transform: [
        {
          scale: 0.99,
        },
      ],
    },
  });
