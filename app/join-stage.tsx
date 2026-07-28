import { Ionicons } from "@expo/vector-icons";
import {
  router,
} from "expo-router";
import {
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  joinLiveStageByCode,
} from "../lib/live-stages";

export default function JoinStageScreen() {
  const [code, setCode] =
    useState("");

  const [isJoining, setIsJoining] =
    useState(false);

  function updateCode(
    value: string,
  ) {
    setCode(
      value
        .replace(/\D/g, "")
        .slice(0, 6),
    );
  }

  async function joinStage() {
    if (code.length !== 6) {
      Alert.alert(
        "Enter the Stage code",
        "Stage codes contain six numbers.",
      );

      return;
    }

    try {
      setIsJoining(true);

      const stage =
        await joinLiveStageByCode(
          code,
        );

      if (!stage) {
        Alert.alert(
          "Stage not found",
          "Check the code or ask the host whether the Stage is still live.",
        );

        return;
      }

      router.replace({
        pathname:
          "/live-stage/[stageId]",
        params: {
          stageId: stage.id,
        },
      });
    } catch (error) {
      console.error(
        "Unable to join Stage:",
        error,
      );

      Alert.alert(
        "Unable to join",
        "Canal could not join this Stage.",
      );
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
        style={styles.layout}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.backText}
            >
              ‹ Live
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Join a Stage
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={styles.content}
        >
          <View
            style={styles.stageIcon}
          >
            <Ionicons
              name="radio-outline"
              size={38}
              color="#ff9a50"
            />
          </View>

          <Text style={styles.eyebrow}>
            STAGE CODE
          </Text>

          <Text style={styles.heading}>
            Enter six numbers.
          </Text>

          <Text
            style={styles.description}
          >
            Ask the Stage host for
            their code, then enter it
            below.
          </Text>

          <TextInput
            value={code}
            onChangeText={
              updateCode
            }
            onSubmitEditing={() => {
              void joinStage();
            }}
            placeholder="000000"
            placeholderTextColor="#4f5751"
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={6}
            autoFocus
            style={styles.codeInput}
          />

          <Text
            style={styles.codeCounter}
          >
            {code.length}/6
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={
              isJoining ||
              code.length !== 6
            }
            onPress={() => {
              void joinStage();
            }}
            style={({ pressed }) => [
              styles.joinButton,
              (isJoining ||
                code.length !== 6) &&
                styles.disabled,
              pressed &&
                styles.pressed,
            ]}
          >
            {isJoining ? (
              <ActivityIndicator
                color="#17110c"
              />
            ) : (
              <>
                <Ionicons
                  name="enter-outline"
                  size={21}
                  color="#17110c"
                />

                <Text
                  style={
                    styles.joinButtonText
                  }
                >
                  Join Stage
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.demoCard}>
            <Text
              style={styles.demoTitle}
            >
              Prototype Stage codes
            </Text>

            <Text
              style={styles.demoText}
            >
              Try 248319 or 817204 to
              test the Stage flow.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  layout: {
    flex: 1,
  },

  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },

  headerButton: {
    width: 80,
    minHeight: 44,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 80,
  },

  backText: {
    color: "#c5cbc6",
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 27,
    paddingBottom: 60,
  },

  stageIcon: {
    width: 86,
    height: 86,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "#2b1d14",
  },

  eyebrow: {
    marginTop: 23,
    color: "#ff9a50",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    marginTop: 8,
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
  },

  description: {
    maxWidth: 330,
    marginTop: 10,
    color: "#aeb6b0",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  codeInput: {
    width: "100%",
    minHeight: 83,
    marginTop: 28,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 22,
    backgroundColor: "#211810",
    color: "#ffffff",
    fontSize: 37,
    fontWeight: "800",
    letterSpacing: 12,
    textAlign: "center",
  },

  codeCounter: {
    marginTop: 8,
    color: "#777f79",
    fontSize: 11,
    fontWeight: "700",
  },

  joinButton: {
    width: "100%",
    minHeight: 57,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: "#ff7a1a",
  },

  joinButtonText: {
    color: "#17110c",
    fontSize: 16,
    fontWeight: "800",
  },

  demoCard: {
    width: "100%",
    marginTop: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 16,
    backgroundColor: "#171c19",
  },

  demoTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  demoText: {
    marginTop: 5,
    color: "#8f9891",
    fontSize: 11,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.45,
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