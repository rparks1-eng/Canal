import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { CanalAlert } from "../lib/canal-alert";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  deleteSnapshotTemplate,
  listOwnSnapshotTemplates,
  saveSnapshotTemplate,
  SNAPSHOT_TEMPLATE_THEMES,
} from "../lib/snapshot-templates";

import type {
  SnapshotTemplate,
  SnapshotTemplateTheme,
} from "../lib/snapshot-templates";

import {
  useAuth,
} from "../providers/auth-provider";

type ThemePreset = {
  key: SnapshotTemplateTheme;
  label: string;
  description: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
};

const THEME_PRESETS: ThemePreset[] = [
  {
    key: "sunset",
    label: "Sunset",
    description:
      "Warm orange on deep plum",
    backgroundColor:
      "#3E1734",
    accentColor:
      "#FF9A50",
    textColor:
      "#FFF8F2",
  },
  {
    key: "midnight",
    label: "Midnight",
    description:
      "Electric blue on midnight",
    backgroundColor:
      "#101B34",
    accentColor:
      "#79A7FF",
    textColor:
      "#F6F8FF",
  },
  {
    key: "paper",
    label: "Paper",
    description:
      "Charcoal and coral on cream",
    backgroundColor:
      "#FFF4E8",
    accentColor:
      "#C64B2D",
    textColor:
      "#2B2520",
  },
];

const DEFAULT_THEME: SnapshotTemplateTheme =
  "sunset";

function closeTemplates(): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/profile",
  );
}

export default function SnapshotTemplatesScreen() {
  const {
    accountEpoch,
    sessionGeneration,
    user,
  } = useAuth();

  return (
    <SnapshotTemplatesContent
      key={
        user?.id
          ? `${user.id}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`
          : "signed-out"
      }
    />
  );
}

function SnapshotTemplatesContent() {
  const [
    templates,
    setTemplates,
  ] =
    useState<
      SnapshotTemplate[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    busyId,
    setBusyId,
  ] = useState("");

  const [
    editingId,
    setEditingId,
  ] = useState("");

  const [
    name,
    setName,
  ] = useState("");

  const [
    brandLabel,
    setBrandLabel,
  ] = useState("");

  const [
    theme,
    setTheme,
  ] =
    useState<SnapshotTemplateTheme>(
      DEFAULT_THEME,
    );

  const [
    isDefault,
    setIsDefault,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const requestIdRef =
    useRef(0);

  const loadTemplates =
    useCallback(
      async (): Promise<boolean> => {
        const requestId =
          requestIdRef.current +
          1;

        requestIdRef.current =
          requestId;

        try {
          setIsLoading(
            true,
          );
          setErrorMessage(
            "",
          );

          const nextTemplates =
            await listOwnSnapshotTemplates();

          if (
            requestIdRef.current !==
            requestId
          ) {
            return false;
          }

          setTemplates(
            nextTemplates,
          );

          return true;
        } catch (error) {
          if (
            requestIdRef.current !==
            requestId
          ) {
            return false;
          }

          setErrorMessage(
            readableError(
              error,
              "Canal could not load your Snapshot templates.",
            ),
          );

          return false;
        } finally {
          if (
            requestIdRef.current ===
            requestId
          ) {
            setIsLoading(
              false,
            );
          }
        }
      },
      [],
    );

  useFocusEffect(
    useCallback(
      () => {
        void loadTemplates();

        return () => {
          requestIdRef.current +=
            1;
        };
      },
      [
        loadTemplates,
      ],
    ),
  );

  const resetForm =
    (): void => {
      setEditingId("");
      setName("");
      setBrandLabel("");
      setTheme(
        DEFAULT_THEME,
      );
      setIsDefault(
        false,
      );
      setErrorMessage("");
    };

  const beginEditing =
    (
      template: SnapshotTemplate,
    ): void => {
      setEditingId(
        template.id,
      );
      setName(
        template.name,
      );
      setBrandLabel(
        template.brandLabel,
      );
      setTheme(
        template.theme,
      );
      setIsDefault(
        template.isDefault,
      );
      setErrorMessage("");
    };

  const save =
    async (): Promise<void> => {
      const normalizedName =
        name.trim();

      const normalizedBrand =
        brandLabel.trim();

      if (
        !normalizedName ||
        !normalizedBrand ||
        busyId
      ) {
        if (
          !normalizedName ||
          !normalizedBrand
        ) {
          setErrorMessage(
            "Add a template name and brand label before saving.",
          );
        }

        return;
      }

      const operationId =
        editingId ||
        "new";

      try {
        setBusyId(
          operationId,
        );
        setErrorMessage(
          "",
        );

        await saveSnapshotTemplate({
          id:
            editingId ||
            undefined,
          name:
            normalizedName,
          brandLabel:
            normalizedBrand,
          theme,
          isDefault,
        });

        const refreshed =
          await loadTemplates();

        if (!refreshed) {
          return;
        }

        resetForm();

        const message =
          editingId
            ? "Snapshot template updated."
            : "Snapshot template created.";

        AccessibilityInfo
          .announceForAccessibility(
            message,
          );
      } catch (error) {
        setErrorMessage(
          readableError(
            error,
            "Canal could not save this Snapshot template.",
          ),
        );
      } finally {
        setBusyId("");
      }
    };

  const confirmDelete =
    (
      template: SnapshotTemplate,
    ): void => {
      CanalAlert.alert(
        "Delete this template?",
        "Published Snapshots keep their captured design and attribution.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style:
              "destructive",
            onPress: () => {
              void remove(
                template,
              );
            },
          },
        ],
      );
    };

  const remove =
    async (
      template: SnapshotTemplate,
    ): Promise<void> => {
      if (busyId) {
        return;
      }

      try {
        setBusyId(
          template.id,
        );
        setErrorMessage(
          "",
        );

        await deleteSnapshotTemplate(
          template.id,
        );

        const refreshed =
          await loadTemplates();

        if (!refreshed) {
          return;
        }

        if (
          editingId ===
          template.id
        ) {
          resetForm();
        }

        AccessibilityInfo
          .announceForAccessibility(
            "Snapshot template deleted.",
          );
      } catch (error) {
        setErrorMessage(
          readableError(
            error,
            "Canal could not delete this Snapshot template.",
          ),
        );
      } finally {
        setBusyId("");
      }
    };

  const availablePresets =
    THEME_PRESETS.filter(
      (preset) =>
        SNAPSHOT_TEMPLATE_THEMES.includes(
          preset.key,
        ),
    );

  const selectedPreset =
    availablePresets.find(
      (preset) =>
        preset.key ===
        theme,
    ) ??
    availablePresets[0] ??
    THEME_PRESETS[0];

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={
          styles.page
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={
              closeTemplates
            }
            style={({
              pressed,
            }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.backText
              }
            >
              ‹ Profile
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Snapshot Templates
          </Text>

          <Pressable
            accessibilityLabel="Create a new Snapshot template"
            accessibilityRole="button"
            onPress={
              resetForm
            }
            style={({
              pressed,
            }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.headerAction
              }
            >
              New
            </Text>
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text
            style={
              styles.eyebrow
            }
          >
            CREATOR TOOLS
          </Text>

          <Text
            style={
              styles.heading
            }
          >
            Give every moment your signature.
          </Text>

          <Text
            style={
              styles.description
            }
          >
            Build reusable, accessible designs and apply one when you publish a Scene Snapshot.
          </Text>
        </View>

        {errorMessage ? (
          <View
            accessibilityRole="alert"
            style={
              styles.errorBox
            }
          >
            <Text
              selectable
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.editorCard
          }
        >
          <View
            style={[
              styles.preview,
              {
                backgroundColor:
                  selectedPreset
                    .backgroundColor,
              },
            ]}
          >
            <View
              style={[
                styles.previewAccent,
                {
                  backgroundColor:
                    selectedPreset
                      .accentColor,
                },
              ]}
            />

            <Text
              numberOfLines={1}
              style={[
                styles.previewBrand,
                {
                  color:
                    selectedPreset
                      .textColor,
                },
              ]}
            >
              {brandLabel.trim() ||
                "YOUR BRAND"}
            </Text>

            <View>
              <Text
                numberOfLines={2}
                style={[
                  styles.previewName,
                  {
                    color:
                      selectedPreset
                        .textColor,
                  },
                ]}
              >
                {name.trim() ||
                  "Template name"}
              </Text>

              <Text
                numberOfLines={2}
                style={[
                  styles.previewTagline,
                  {
                    color:
                      selectedPreset
                        .textColor,
                  },
                ]}
              >
                A reusable look for your Scene moments.
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.formTitle
            }
          >
            {editingId
              ? "Edit template"
              : "New template"}
          </Text>

          <TextInput
            accessibilityLabel="Template name"
            value={name}
            onChangeText={
              setName
            }
            placeholder="Night Drive"
            placeholderTextColor={canalDynamicColors.muted}
            maxLength={60}
            style={styles.input}
          />

          <TextInput
            accessibilityLabel="Brand label"
            value={brandLabel}
            onChangeText={
              setBrandLabel
            }
            placeholder="ARI STUDIO"
            placeholderTextColor={canalDynamicColors.muted}
            autoCapitalize="characters"
            maxLength={32}
            style={styles.input}
          />

          <Text
            style={
              styles.fieldLabel
            }
          >
            Theme
          </Text>

          <View
            accessibilityRole="radiogroup"
            style={
              styles.themeList
            }
          >
            {availablePresets.map(
              (preset) => {
                const selected =
                  theme ===
                  preset.key;

                return (
                  <Pressable
                    key={
                      preset.key
                    }
                    accessibilityLabel={`${preset.label}. ${preset.description}`}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked:
                        selected,
                    }}
                    onPress={() =>
                      setTheme(
                        preset.key,
                      )
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.themeButton,
                      selected &&
                        styles.selectedThemeButton,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.themeSwatch,
                        {
                          backgroundColor:
                            preset.backgroundColor,
                          borderColor:
                            preset.accentColor,
                        },
                      ]}
                    />

                    <View
                      style={
                        styles.themeCopy
                      }
                    >
                      <Text
                        style={
                          styles.themeLabel
                        }
                      >
                        {
                          preset.label
                        }
                      </Text>

                      <Text
                        style={
                          styles.themeDescription
                        }
                      >
                        {
                          preset.description
                        }
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.radioMark,
                        selected &&
                          styles.selectedRadioMark,
                      ]}
                    >
                      {selected
                        ? "●"
                        : "○"}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>

          <View
            style={
              styles.defaultRow
            }
          >
            <View
              style={
                styles.defaultCopy
              }
            >
              <Text
                style={
                  styles.defaultTitle
                }
              >
                Use by default
              </Text>

              <Text
                style={
                  styles.defaultDescription
                }
              >
                Preselect this design when you make a Snapshot.
              </Text>
            </View>

            <Switch
              accessibilityLabel="Use this template by default"
              accessibilityRole="switch"
              accessibilityState={{
                checked:
                  isDefault,
              }}
              value={
                isDefault
              }
              onValueChange={
                setIsDefault
              }
              style={
                styles.switchControl
              }
              trackColor={{
                false:
                  "#D8CEC6",
                true:
                  "#F47A24",
              }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View
            style={
              styles.formActions
            }
          >
            {editingId ? (
              <Pressable
                accessibilityRole="button"
                disabled={
                  Boolean(
                    busyId,
                  )
                }
                onPress={
                  resetForm
                }
                style={({
                  pressed,
                }) => [
                  styles.secondaryButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Cancel
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel={
                editingId
                  ? "Save Snapshot template changes"
                  : "Create Snapshot template"
              }
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  Boolean(
                    busyId,
                  ),
              }}
              disabled={
                Boolean(
                  busyId,
                )
              }
              onPress={() =>
                void save()
              }
              style={({
                pressed,
              }) => [
                styles.primaryButton,
                Boolean(
                  busyId,
                ) &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              {busyId ===
              (
                editingId ||
                "new"
              ) ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {editingId
                    ? "Save changes"
                    : "Create template"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Your templates
          </Text>

          <Text
            style={
              styles.count
            }
          >
            {templates.length}
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator
            color="#F47A24"
            size="large"
          />
        ) : templates.length ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No templates yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Create your first reusable Snapshot look above.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.templateList
            }
          >
            {templates.map(
              (template) => {
                const preset =
                  THEME_PRESETS.find(
                    (item) =>
                      item.key ===
                      template.theme,
                  ) ??
                  THEME_PRESETS[0];

                return (
                  <View
                    key={
                      template.id
                    }
                    style={
                      styles.templateCard
                    }
                  >
                    <View
                      style={[
                        styles.templateSwatch,
                        {
                          backgroundColor:
                            preset.backgroundColor,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.templateAccent,
                          {
                            backgroundColor:
                              preset.accentColor,
                          },
                        ]}
                      />

                      <Text
                        numberOfLines={
                          1
                        }
                        style={[
                          styles.templateBrand,
                          {
                            color:
                              preset.textColor,
                          },
                        ]}
                      >
                        {
                          template.brandLabel
                        }
                      </Text>
                    </View>

                    <View
                      style={
                        styles.templateCopy
                      }
                    >
                      <Text
                        numberOfLines={
                          1
                        }
                        style={
                          styles.templateName
                        }
                      >
                        {
                          template.name
                        }
                      </Text>

                      <Text
                        numberOfLines={
                          2
                        }
                        style={
                          styles.templateTagline
                        }
                      >
                        {template.isDefault
                          ? `Default · ${preset.label}`
                          : preset.label}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.cardActions
                      }
                    >
                      <Pressable
                        accessibilityLabel={`Edit ${template.name}`}
                        accessibilityRole="button"
                        disabled={
                          Boolean(
                            busyId,
                          )
                        }
                        onPress={() =>
                          beginEditing(
                            template,
                          )
                        }
                        style={({
                          pressed,
                        }) => [
                          styles.smallButton,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <Text
                          style={
                            styles.smallButtonText
                          }
                        >
                          Edit
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityLabel={`Delete ${template.name}`}
                        accessibilityRole="button"
                        disabled={
                          Boolean(
                            busyId,
                          )
                        }
                        onPress={() =>
                          confirmDelete(
                            template,
                          )
                        }
                        style={({
                          pressed,
                        }) => [
                          styles.smallButton,
                          styles.deleteButton,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        {busyId ===
                        template.id ? (
                          <ActivityIndicator
                            color="#B93A2D"
                            size="small"
                          />
                        ) : (
                          <Text
                            style={
                              styles.deleteButtonText
                            }
                          >
                            Delete
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              },
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function readableError(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error &&
    error.message.trim()
    ? error.message
    : fallback;
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },

    page: {
      width: "100%",
      maxWidth: 720,
      alignSelf:
        "center",
      gap: 20,
      paddingHorizontal: 20,
      paddingBottom: 48,
    },

    header: {
      minHeight: 54,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
    },

    headerButton: {
      minWidth: 68,
      minHeight: 48,
      justifyContent:
        "center",
    },

    backText: {
      color: canalDynamicColors.gold,
      fontSize: 15,
      fontWeight: "800",
    },

    headerTitle: {
      flex: 1,
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      fontWeight: "400",
      textAlign: "center",
    },

    headerAction: {
      color: canalDynamicColors.gold,
      fontSize: 15,
      fontWeight: "900",
      textAlign: "right",
    },

    intro: {
      gap: 7,
    },

    eyebrow: {
      color: canalDynamicColors.gold,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    heading: {
      color: canalDynamicColors.text,
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 35,
    },

    description: {
      color: canalDynamicColors.muted,
      fontSize: 15,
      lineHeight: 22,
    },

    errorBox: {
      borderWidth: 1,
      borderColor:
        "#E9A49B",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF0ED",
      padding: 14,
    },

    errorText: {
      color: "#8B2E25",
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "700",
    },

    editorCard: {
      gap: 14,
      borderWidth: 1,
      borderColor:
        "#E9DED5",
      borderRadius: 24,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 16,
    },

    preview: {
      aspectRatio: 9 / 12,
      maxHeight: 350,
      justifyContent:
        "space-between",
      borderRadius: 22,
      borderCurve:
        "continuous",
      overflow: "hidden",
      padding: 22,
    },

    previewAccent: {
      position:
        "absolute",
      top: -50,
      right: -50,
      width: 170,
      height: 170,
      borderRadius: 85,
      opacity: 0.32,
    },

    previewBrand: {
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 1.6,
    },

    previewName: {
      fontSize: 31,
      fontWeight: "900",
      lineHeight: 34,
    },

    previewTagline: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      opacity: 0.84,
    },

    formTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#DED2C8",
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFFDFC",
      color: canalDynamicColors.text,
      fontSize: 15,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },

    fieldLabel: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      fontWeight: "900",
    },

    themeList: {
      gap: 9,
    },

    themeButton: {
      minHeight: 58,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      borderWidth: 1,
      borderColor:
        "#E5DBD3",
      borderRadius: 15,
      borderCurve:
        "continuous",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },

    selectedThemeButton: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF5EC",
    },

    themeSwatch: {
      width: 34,
      height: 34,
      borderWidth: 3,
      borderRadius: 17,
    },

    themeCopy: {
      flex: 1,
      gap: 2,
    },

    themeLabel: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    themeDescription: {
      color: canalDynamicColors.muted,
      fontSize: 11,
    },

    radioMark: {
      color: "#A29A94",
      fontSize: 22,
    },

    selectedRadioMark: {
      color: canalDynamicColors.gold,
    },

    defaultRow: {
      minHeight: 60,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 16,
      borderWidth: 1,
      borderColor:
        "#E5DBD3",
      borderRadius: 15,
      borderCurve:
        "continuous",
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    defaultCopy: {
      flex: 1,
      gap: 3,
    },
    switchControl: {
      minWidth: 48,
      minHeight: 48,
    },

    defaultTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    defaultDescription: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 16,
    },

    formActions: {
      flexDirection:
        "row",
      justifyContent:
        "flex-end",
      gap: 10,
    },

    primaryButton: {
      minHeight: 50,
      flexGrow: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 15,
      borderCurve:
        "continuous",
      backgroundColor:
        "#4C46C8",
      paddingHorizontal: 18,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    secondaryButton: {
      minHeight: 50,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#DED2C8",
      borderRadius: 15,
      borderCurve:
        "continuous",
      paddingHorizontal: 18,
    },

    secondaryButtonText: {
      color: "#5F5650",
      fontSize: 14,
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.5,
    },

    pressed: {
      opacity: 0.7,
    },

    sectionHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 20,
      fontWeight: "900",
    },

    count: {
      color: "#8B837C",
      fontSize: 13,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    emptyCard: {
      gap: 7,
      borderWidth: 1,
      borderColor:
        "#E9DED5",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 18,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 19,
    },

    templateList: {
      gap: 12,
    },

    templateCard: {
      minHeight: 100,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      borderWidth: 1,
      borderColor:
        "#E9DED5",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 12,
    },

    templateSwatch: {
      width: 76,
      height: 76,
      justifyContent:
        "space-between",
      borderRadius: 16,
      borderCurve:
        "continuous",
      overflow: "hidden",
      padding: 9,
    },

    templateAccent: {
      width: 30,
      height: 6,
      borderRadius: 3,
    },

    templateBrand: {
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    templateCopy: {
      flex: 1,
      gap: 4,
    },

    templateName: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    templateTagline: {
      color: "#756D67",
      fontSize: 11,
      lineHeight: 16,
    },

    cardActions: {
      gap: 6,
    },

    smallButton: {
      minWidth: 62,
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#DED2C8",
      borderRadius: 12,
      borderCurve:
        "continuous",
      paddingHorizontal: 9,
    },

    smallButtonText: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
    },

    deleteButton: {
      borderColor:
        "#E8C2BC",
      backgroundColor:
        "#FFF6F4",
    },

    deleteButtonText: {
      color: "#B93A2D",
      fontSize: 12,
      fontWeight: "900",
    },
  });
