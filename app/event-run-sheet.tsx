import DateTimePicker from "@react-native-community/datetimepicker";

import type {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  useCallback,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
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
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  advanceEventRunSheet,
  deleteEventRunSheet,
  listOwnEventRunSheets,
  loadEventRunSheet,
  saveEventRunSheet,
} from "../lib/event-run-sheets";

import type {
  EventRunSheet,
} from "../lib/event-run-sheets";

import {
  loadSceneCollection,
} from "../lib/scene-collections";

import type {
  SceneCollectionDetail,
} from "../lib/scene-collections";

import {
  useAuth,
} from "../providers/auth-provider";

type PickerMode =
  | "date"
  | "time"
  | "";

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(
    "/(tabs)/profile" as never,
  );
}

function initialStart(): Date {
  const date =
    new Date();

  date.setMinutes(
    date.getMinutes() +
      60,
    0,
    0,
  );

  return date;
}

function localTimeZone(): string {
  return (
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone ||
    "UTC"
  );
}

function webDateValue(
  date: Date,
): string {
  const local =
    new Date(
      date.getTime() -
        date.getTimezoneOffset() *
          60_000,
    );

  return local
    .toISOString()
    .slice(
      0,
      16,
    );
}

function readableError(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Canal could not update this Event Run Sheet.";
}

export default function EventRunSheetScreen() {
  const {
    user,
  } =
    useAuth();

  return (
    <EventRunSheetContent
      key={
        user?.id ??
        "signed-out"
      }
    />
  );
}

function EventRunSheetContent() {
  const params =
    useLocalSearchParams<{
      collectionId?: string;
      sheetId?: string;
    }>();

  const requestedCollectionId =
    typeof params.collectionId ===
      "string"
      ? params.collectionId
      : "";

  const requestedSheetId =
    typeof params.sheetId ===
      "string"
      ? params.sheetId
      : "";

  const [
    collection,
    setCollection,
  ] =
    useState<
      SceneCollectionDetail | null
    >(
      null,
    );

  const [
    runSheet,
    setRunSheet,
  ] =
    useState<
      EventRunSheet | null
    >(
      null,
    );

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    venueLabel,
    setVenueLabel,
  ] = useState("");

  const [
    startsAt,
    setStartsAt,
  ] =
    useState<Date>(
      initialStart,
    );

  const [
    timeZone,
    setTimeZone,
  ] =
    useState(
      localTimeZone,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busyAction,
    setBusyAction,
  ] = useState("");

  const [
    pickerMode,
    setPickerMode,
  ] =
    useState<PickerMode>(
      "",
    );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const applyRunSheet =
    (
      next:
        EventRunSheet | null,
      nextCollection:
        SceneCollectionDetail,
    ): void => {
      setRunSheet(
        next,
      );
      setTitle(
        next?.title ??
          `${nextCollection.title} run sheet`,
      );
      setVenueLabel(
        next?.venueLabel ??
          "",
      );
      setStartsAt(
        next
          ? new Date(
              next.startsAt,
            )
          : initialStart(),
      );
      setTimeZone(
        next?.timeZone ??
          localTimeZone(),
      );
    };

  const load =
    useCallback(
      async (): Promise<void> => {
        setLoading(
          true,
        );
        setErrorMessage(
          "",
        );

        try {
          if (
            requestedSheetId
          ) {
            const nextSheet =
              await loadEventRunSheet(
                requestedSheetId,
              );

            if (!nextSheet) {
              throw new Error(
                "This Event Run Sheet is unavailable.",
              );
            }

            const nextCollection =
              await loadSceneCollection(
                nextSheet.collectionId,
              );

            setCollection(
              nextCollection,
            );
            applyRunSheet(
              nextSheet,
              nextCollection,
            );
            return;
          }

          if (
            !requestedCollectionId
          ) {
            throw new Error(
              "Choose a Scene collection before planning an event.",
            );
          }

          const [
            nextCollection,
            ownRunSheets,
          ] =
            await Promise.all([
              loadSceneCollection(
                requestedCollectionId,
              ),
              listOwnEventRunSheets(),
            ]);

          const existing =
            ownRunSheets.find(
              (candidate) =>
                candidate.collectionId ===
                requestedCollectionId,
            ) ??
            null;

          setCollection(
            nextCollection,
          );
          applyRunSheet(
            existing,
            nextCollection,
          );
        } catch (error) {
          setCollection(
            null,
          );
          setRunSheet(
            null,
          );
          setErrorMessage(
            readableError(
              error,
            ),
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        requestedCollectionId,
        requestedSheetId,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();
      },
      [
        load,
      ],
    ),
  );

  const handleNativeDate =
    (
      event:
        DateTimePickerEvent,
      value?: Date,
    ): void => {
      if (
        event.type ===
          "dismissed" ||
        !value
      ) {
        setPickerMode(
          "",
        );
        return;
      }

      setStartsAt(
        (current) => {
          const next =
            new Date(
              current,
            );

          if (
            pickerMode ===
            "date"
          ) {
            next.setFullYear(
              value.getFullYear(),
              value.getMonth(),
              value.getDate(),
            );
          } else {
            next.setHours(
              value.getHours(),
              value.getMinutes(),
              0,
              0,
            );
          }

          return next;
        },
      );

      if (
        Platform.OS ===
        "android"
      ) {
        setPickerMode(
          "",
        );
      }
    };

  const save =
    async (): Promise<void> => {
      if (
        !collection ||
        busyAction
      ) {
        return;
      }

      if (
        !title.trim() ||
        !venueLabel.trim()
      ) {
        setErrorMessage(
          "Add an event title and venue label.",
        );
        return;
      }

      setBusyAction(
        "save",
      );
      setErrorMessage(
        "",
      );

      try {
        const next =
          await saveEventRunSheet({
            id:
              runSheet?.id,
            collectionId:
              collection.id,
            title,
            venueLabel,
            startsAt:
              startsAt.toISOString(),
            timeZone,
          });

        setRunSheet(
          next,
        );
        setTitle(
          next.title,
        );
        setVenueLabel(
          next.venueLabel,
        );
        AccessibilityInfo
          .announceForAccessibility(
            "Event Run Sheet saved.",
          );
      } catch (error) {
        setErrorMessage(
          readableError(
            error,
          ),
        );
      } finally {
        setBusyAction(
          "",
        );
      }
    };

  const advance =
    async (): Promise<void> => {
      if (
        !runSheet ||
        busyAction ||
        runSheet.status ===
          "completed"
      ) {
        return;
      }

      setBusyAction(
        "advance",
      );
      setErrorMessage(
        "",
      );

      try {
        const next =
          await advanceEventRunSheet(
            runSheet.id,
            runSheet.activePosition,
          );

        setRunSheet(
          next,
        );

        AccessibilityInfo
          .announceForAccessibility(
            next.status ===
              "completed"
              ? "Event Run Sheet completed."
              : `Advanced to Scene ${next.activePosition + 1}.`,
          );
      } catch (error) {
        setErrorMessage(
          readableError(
            error,
          ),
        );
      } finally {
        setBusyAction(
          "",
        );
      }
    };

  const remove =
    async (): Promise<void> => {
      if (
        !runSheet ||
        busyAction
      ) {
        return;
      }

      setBusyAction(
        "delete",
      );

      try {
        await deleteEventRunSheet(
          runSheet.id,
        );
        goBack();
      } catch (error) {
        setErrorMessage(
          readableError(
            error,
          ),
        );
        setBusyAction(
          "",
        );
      }
    };

  const confirmDelete =
    (): void => {
      Alert.alert(
        "Delete Event Run Sheet?",
        "The Scene collection will not be changed.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style:
              "destructive",
            onPress: () =>
              void remove(),
          },
        ],
      );
    };

  const activeItem =
    collection &&
    runSheet &&
    runSheet.status !==
      "completed"
      ? collection.items[
          runSheet.activePosition
        ] ??
        null
      : null;

  const openScene =
    (): void => {
      if (
        !collection ||
        !activeItem
      ) {
        return;
      }

      router.push(
        activeItem.scene
          .visibility ===
        "public"
          ? ({
              pathname:
                "/public-scene",
              params: {
                ownerId:
                  collection.ownerId,
                sceneId:
                  activeItem.sceneId,
              },
            } as never)
          : ({
              pathname:
                "/scenes/[sceneId]",
              params: {
                sceneId:
                  activeItem.sceneId,
              },
            } as never),
      );
    };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityLabel="Go back"
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
            styles.headerTitle
          }
        >
          Event Run Sheet
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      {loading ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            color="#F47A24"
          />
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={
              styles.privateNotice
            }
          >
            <Text
              style={
                styles.privateEyebrow
              }
            >
              PRIVATE CREATOR TOOL
            </Text>

            <Text
              style={
                styles.privateText
              }
            >
              This run sheet is visible only to your Canal account. It does not create a Live Stage or claim venue music licensing.
            </Text>
          </View>

          {collection ? (
            <>
              <Text
                style={
                  styles.collectionLabel
                }
              >
                {
                  collection.title
                }{" "}
                ·{" "}
                {
                  collection.items.length
                }{" "}
                Scenes
              </Text>

              <TextInput
                accessibilityLabel="Event title"
                maxLength={
                  80
                }
                onChangeText={
                  setTitle
                }
                placeholder="Event title"
                placeholderTextColor="#9A938C"
                style={
                  styles.input
                }
                value={
                  title
                }
              />

              <TextInput
                accessibilityLabel="Venue label"
                maxLength={
                  120
                }
                onChangeText={
                  setVenueLabel
                }
                placeholder="Venue name or room"
                placeholderTextColor="#9A938C"
                style={
                  styles.input
                }
                value={
                  venueLabel
                }
              />

              <View
                style={
                  styles.scheduleCard
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Scheduled start
                </Text>

                {Platform.OS ===
                "web" ? (
                  <TextInput
                    accessibilityLabel="Scheduled start in local time"
                    defaultValue={
                      webDateValue(
                        startsAt,
                      )
                    }
                    onEndEditing={(
                      event,
                    ) => {
                      const parsed =
                        new Date(
                          event.nativeEvent.text,
                        );

                      if (
                        Number.isFinite(
                          parsed.getTime(),
                        )
                      ) {
                        setStartsAt(
                          parsed,
                        );
                      }
                    }}
                    style={
                      styles.input
                    }
                  />
                ) : (
                  <View
                    style={
                      styles.dateActions
                    }
                  >
                    <Pressable
                      accessibilityLabel="Choose event date"
                      accessibilityRole="button"
                      onPress={() =>
                        setPickerMode(
                          "date",
                        )
                      }
                      style={
                        styles.dateButton
                      }
                    >
                      <Text
                        style={
                          styles.dateButtonText
                        }
                      >
                        {startsAt.toLocaleDateString()}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityLabel="Choose event time"
                      accessibilityRole="button"
                      onPress={() =>
                        setPickerMode(
                          "time",
                        )
                      }
                      style={
                        styles.dateButton
                      }
                    >
                      <Text
                        style={
                          styles.dateButtonText
                        }
                      >
                        {startsAt.toLocaleTimeString(
                          [],
                          {
                            hour:
                              "numeric",
                            minute:
                              "2-digit",
                          },
                        )}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {Platform.OS !==
                  "web" &&
                pickerMode ? (
                  <DateTimePicker
                    accessibilityLabel={`Event ${pickerMode}`}
                    display={
                      Platform.OS ===
                      "ios"
                        ? "compact"
                        : "default"
                    }
                    minuteInterval={
                      15
                    }
                    mode={
                      pickerMode
                    }
                    onChange={
                      handleNativeDate
                    }
                    value={
                      startsAt
                    }
                  />
                ) : null}

                <Text
                  selectable
                  style={
                    styles.timeZone
                  }
                >
                  Time zone: {
                    timeZone
                  }
                </Text>
              </View>

              {runSheet ? (
                <View
                  style={
                    styles.progressCard
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    {runSheet.status ===
                    "completed"
                      ? "Run complete"
                      : `Scene ${runSheet.activePosition + 1} of ${collection.items.length}`}
                  </Text>

                  {activeItem ? (
                    <Pressable
                      accessibilityLabel={`Open current Scene ${activeItem.scene.name}`}
                      accessibilityRole="button"
                      onPress={
                        openScene
                      }
                      style={
                        styles.activeScene
                      }
                    >
                      <View>
                        <Text
                          style={
                            styles.activeSceneName
                          }
                        >
                          {
                            activeItem.scene.name
                          }
                        </Text>

                        <Text
                          style={
                            styles.activeSceneMeta
                          }
                        >
                          {activeItem.scene.activity ||
                            "Any activity"}{" "}
                          ·{" "}
                          {
                            activeItem.scene.tracks.length
                          }{" "}
                          tracks
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.activeSceneArrow
                        }
                      >
                        ›
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      style={
                        styles.completedText
                      }
                    >
                      Every Scene in this collection has been covered.
                    </Text>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      Boolean(
                        busyAction,
                      ) ||
                      runSheet.status ===
                        "completed"
                    }
                    onPress={() =>
                      void advance()
                    }
                    style={[
                      styles.advanceButton,
                      (
                        busyAction ||
                        runSheet.status ===
                          "completed"
                      ) &&
                        styles.disabled,
                    ]}
                  >
                    {busyAction ===
                    "advance" ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                      />
                    ) : (
                      <Text
                        style={
                          styles.advanceText
                        }
                      >
                        {runSheet.activePosition >=
                        collection.items.length -
                          1
                          ? "Complete run"
                          : "Next Scene"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {errorMessage ? (
                <View
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
                    {
                      errorMessage
                    }
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={
                  Boolean(
                    busyAction,
                  )
                }
                onPress={() =>
                  void save()
                }
                style={[
                  styles.saveButton,
                  busyAction &&
                    styles.disabled,
                ]}
              >
                {busyAction ===
                "save" ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.saveText
                    }
                  >
                    {runSheet
                      ? "Save changes"
                      : "Create run sheet"}
                  </Text>
                )}
              </Pressable>

              {runSheet ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    Boolean(
                      busyAction,
                    )
                  }
                  onPress={
                    confirmDelete
                  }
                  style={
                    styles.deleteButton
                  }
                >
                  <Text
                    style={
                      styles.deleteText
                    }
                  >
                    Delete run sheet
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : errorMessage ? (
            <View
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
                {
                  errorMessage
                }
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void load()
                }
                style={
                  styles.retryButton
                }
              >
                <Text
                  style={
                    styles.retryText
                  }
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
    },
    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 22,
      backgroundColor:
        "#FFFFFF",
    },
    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
    },
    headerTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },
    headerSpacer: {
      width: 44,
    },
    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 50,
      gap: 12,
    },
    privateNotice: {
      borderRadius: 20,
      backgroundColor:
        "#2B1710",
      padding: 17,
    },
    privateEyebrow: {
      color: "#FFB781",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    privateText: {
      color: "#F7E7DE",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 6,
    },
    collectionLabel: {
      color: "#6F6660",
      fontSize: 11,
      fontWeight: "800",
    },
    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#E8DFD8",
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      color: "#1B1B1B",
      fontSize: 13,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    scheduleCard: {
      borderRadius: 19,
      backgroundColor:
        "#FFFFFF",
      padding: 16,
      gap: 11,
    },
    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },
    dateActions: {
      flexDirection: "row",
      gap: 9,
    },
    dateButton: {
      flex: 1,
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#E8DFD8",
      borderRadius: 14,
      backgroundColor:
        "#FFF9F4",
      paddingHorizontal: 8,
    },
    dateButtonText: {
      color: "#382E28",
      fontSize: 11,
      fontWeight: "900",
    },
    timeZone: {
      color: "#817972",
      fontSize: 10,
      lineHeight: 15,
    },
    progressCard: {
      borderRadius: 20,
      backgroundColor:
        "#FFFFFF",
      padding: 16,
      gap: 12,
    },
    activeScene: {
      minHeight: 66,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      borderRadius: 15,
      backgroundColor:
        "#FFF0E5",
      padding: 13,
    },
    activeSceneName: {
      color: "#2B1710",
      fontSize: 14,
      fontWeight: "900",
    },
    activeSceneMeta: {
      color: "#7D6455",
      fontSize: 9,
      marginTop: 4,
    },
    activeSceneArrow: {
      color: "#F47A24",
      fontSize: 25,
      marginLeft: 10,
    },
    completedText: {
      color: "#5A514B",
      fontSize: 12,
      lineHeight: 18,
    },
    advanceButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 15,
      backgroundColor:
        "#2B1710",
    },
    advanceText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },
    errorBox: {
      borderRadius: 16,
      backgroundColor:
        "#FFF0EE",
      padding: 14,
    },
    errorText: {
      color: "#A6352B",
      fontSize: 11,
      lineHeight: 17,
    },
    saveButton: {
      minHeight: 52,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 16,
      backgroundColor:
        "#F47A24",
    },
    saveText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },
    deleteButton: {
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#F0C8C2",
      borderRadius: 14,
      backgroundColor:
        "#FFF0EE",
    },
    deleteText: {
      color: "#A6352B",
      fontSize: 11,
      fontWeight: "900",
    },
    retryButton: {
      alignSelf:
        "flex-start",
      minHeight: 44,
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor:
        "#A6352B",
      paddingHorizontal: 14,
      marginTop: 11,
    },
    retryText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },
    disabled: {
      opacity: 0.5,
    },
  });
