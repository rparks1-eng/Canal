import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
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
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  addFeedbackEntry,
} from "../lib/canal-session";

import type {
  SceneFeedbackRating,
} from "../lib/canal-session";

import {
  getSceneById,
  saveSceneFeedback,
} from "../lib/scenes";

import type {
  StoredScene,
} from "../lib/scenes";

import { canalColors } from "../theme/canal-colors";
import { canalTypography } from "../theme/canal-typography";

const OPTIONS: {
  value: SceneFeedbackRating;
  label: string;
  description: string;
}[] = [
  {
    value: "perfect",
    label: "Perfect",
    description:
      "The Scene fit the moment.",
  },
  {
    value: "too-calm",
    label: "Too calm",
    description:
      "Future versions should raise intensity.",
  },
  {
    value: "too-intense",
    label: "Too intense",
    description:
      "Future versions should lower intensity.",
  },
  {
    value: "too-familiar",
    label: "Too familiar",
    description:
      "Use broader and less obvious choices.",
  },
  {
    value: "too-unfamiliar",
    label: "Too unfamiliar",
    description:
      "Favor stronger favorites.",
  },
  {
    value: "wrong-mood",
    label: "Wrong mood",
    description:
      "The emotional direction was off.",
  },
  {
    value: "wrong-artists",
    label: "Wrong artists",
    description:
      "The artist mix did not fit.",
  },
  {
    value: "too-repetitive",
    label: "Too repetitive",
    description:
      "Increase artist and track variety.",
  },
];

export default function SceneFeedbackScreen() {
  const params =
    useLocalSearchParams<{
      sceneId?: string;
    }>();

  const sceneId =
    typeof params.sceneId ===
      "string"
      ? params.sceneId
      : "";

  const [
    scene,
    setScene,
  ] =
    useState<StoredScene | null>(
      null,
    );

  const [
    rating,
    setRating,
  ] =
    useState<SceneFeedbackRating | null>(
      null,
    );

  const [
    note,
    setNote,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const load =
      async (): Promise<void> => {
        if (sceneId) {
          setScene(
            await getSceneById(
              sceneId,
            ),
          );
        }
      };

    void load();
  }, [sceneId]);

  const submit =
    async (): Promise<void> => {
      if (
        submittingRef.current ||
        !scene ||
        !rating
      ) {
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);

      try {
        await Promise.all([
        addFeedbackEntry({
          sceneId:
            scene.id,

          sceneName:
            scene.name,

          rating,

          note:
            note.trim(),
        }),

        saveSceneFeedback(
          scene.id,
          rating,
          note.trim(),
        ),
        ]);

        router.replace({
        pathname:
          "/scene-snapshot",

        params: {
          sceneId:
            scene.id,
        },
        });
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    };

  if (!scene) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={
            styles.center
          }
        >
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>
          SCENE COMPLETE
        </Text>

        <Text style={styles.title}>
          Did it fit the moment?
        </Text>

        <Text style={styles.subtitle}>
          Your answer is stored locally and
          used to improve Scene
          recommendations.
        </Text>

        <View style={styles.sceneCard}>
          <Text
            style={
              styles.sceneActivity
            }
          >
            {scene.activity}
          </Text>

          <Text
            style={
              styles.sceneName
            }
          >
            {scene.name}
          </Text>

          <Text
            style={
              styles.sceneMood
            }
          >
            {scene.emotions ||
              `${scene.energy} energy`}
          </Text>
        </View>

        <View
          accessibilityRole="radiogroup"
          style={styles.options}
        >
          {OPTIONS.map(
            (option) => (
              <Pressable
                key={option.value}
                accessibilityLabel={`${option.label}. ${option.description}`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked:
                    rating ===
                    option.value,
                }}
                onPress={() =>
                  setRating(
                    option.value,
                  )
                }
                style={({ pressed }) => [
                  styles.option,

                  rating ===
                    option.value &&
                    styles.optionSelected,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.optionLabel,

                      rating ===
                        option.value &&
                        styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>

                  <Text
                    style={[
                      styles.optionDescription,

                      rating ===
                        option.value &&
                        styles.optionDescriptionSelected,
                    ]}
                  >
                    {option.description}
                  </Text>
                </View>

                <View
                  style={[
                    styles.radio,

                    rating ===
                      option.value &&
                      styles.radioSelected,
                  ]}
                >
                  {rating ===
                  option.value ? (
                    <View
                      style={
                        styles.radioDot
                      }
                    />
                  ) : null}
                </View>
              </Pressable>
            ),
          )}
        </View>

        <Text style={styles.noteLabel}>
          Optional note
        </Text>

        <TextInput
          accessibilityLabel="Optional Scene feedback note"
          value={note}
          onChangeText={setNote}
          placeholder="What worked or did not work?"
          placeholderTextColor="#9A938C"
          multiline
          maxLength={300}
          textAlignVertical="top"
          style={styles.noteInput}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save feedback and continue"
          accessibilityState={{ disabled: !rating || submitting, busy: submitting }}
          disabled={
            !rating ||
            submitting
          }
          onPress={() =>
            void submit()
          }
          style={({ pressed }) => [
            styles.submitButton,

            (!rating ||
              submitting) &&
              styles.disabled,

            pressed &&
              styles.pressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={
                styles.submitText
              }
            >
              Save Feedback and Continue
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip feedback"
          onPress={() =>
            router.replace(
              "/(tabs)",
            )
          }
          style={({ pressed }) => [
            styles.skipButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.skipText
            }
          >
            Skip feedback
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalColors.light.page,
    },

    center: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 40,
    },

    eyebrow: {
      color: canalColors.light.accent,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      textAlign: "center",
    },

    title: {
      ...canalTypography.title,
      color: canalColors.light.ink,
      textAlign: "center",
      marginTop: 6,
    },

    subtitle: {
      color: canalColors.light.muted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 7,
      marginBottom: 20,
    },

    sceneCard: {
      alignItems: "center",
      backgroundColor:
        "#2B1710",
      borderRadius: 22,
      padding: 21,
      marginBottom: 17,
    },

    sceneActivity: {
      color: "#FFB781",
      fontSize: 10,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 0.9,
    },

    sceneName: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 5,
    },

    sceneMood: {
      color: "#DCC4B8",
      fontSize: 13,
      marginTop: 5,
    },

    options: {
      gap: 9,
    },

    option: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor:
        "#E5DED8",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 17,
      padding: 14,
    },

    optionSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF0E5",
    },

    optionLabel: {
      color: "#292522",
      fontSize: 14,
      fontWeight: "900",
    },

    optionLabelSelected: {
      color: "#A94B0A",
    },

    optionDescription: {
      color: "#77706A",
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },

    optionDescriptionSelected: {
      color: "#805334",
    },

    radio: {
      width: 23,
      height: 23,
      borderRadius: 12,
      borderWidth: 2,
      borderColor:
        "#CFC6BF",
      alignItems:
        "center",
      justifyContent:
        "center",
      marginLeft: 12,
    },

    radioSelected: {
      borderColor:
        "#F47A24",
    },

    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor:
        "#F47A24",
    },

    noteLabel: {
      color: "#5F5853",
      fontSize: 12,
      fontWeight: "800",
      marginTop: 19,
      marginBottom: 7,
    },

    noteInput: {
      minHeight: 105,
      borderWidth: 1,
      borderColor:
        "#E5DED8",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 17,
      color: "#1B1B1B",
      fontSize: 14,
      padding: 13,
    },

    submitButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginTop: 17,
    },

    submitText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    skipButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop: 8,
    },

    skipText: {
      color: "#77706A",
      fontSize: 13,
      fontWeight: "700",
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
