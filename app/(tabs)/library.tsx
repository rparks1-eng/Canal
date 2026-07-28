import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
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
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  deleteScene,
  readScenes,
  sceneDurationMinutes,
} from "../../lib/scenes";

import type {
  SceneVisibility,
  StoredScene,
} from "../../lib/scenes";

import {
  removeSavedSceneCompletely,
} from "../../lib/saved-scene-management";

import {
  setOwnSceneVisibility,
} from "../../lib/social";

type LibraryFilter =
  | "all"
  | "created"
  | "saved"
  | "favorites";

export default function LibraryScreen() {
  const [
    scenes,
    setScenes,
  ] =
    useState<
      StoredScene[]
    >([]);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<LibraryFilter>(
      "all",
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busySceneId,
    setBusySceneId,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const load =
    useCallback(
      async (): Promise<void> => {
        setLoading(
          true,
        );

        setErrorMessage("");

        try {
          setScenes(
            await readScenes(),
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load your Library.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
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

  const filteredScenes =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        return scenes.filter(
          (scene) => {
            const matchesFilter =
              filter ===
                "all" ||
              (
                filter ===
                  "created" &&
                scene.libraryType !==
                  "saved"
              ) ||
              (
                filter ===
                  "saved" &&
                scene.libraryType ===
                  "saved"
              ) ||
              (
                filter ===
                  "favorites" &&
                Boolean(
                  scene.favorite,
                )
              );

            if (
              !matchesFilter
            ) {
              return false;
            }

            if (!needle) {
              return true;
            }

            return [
              scene.name,
              scene.activity,
              scene.emotions,
              scene.genres,
              scene.artists,
              ...scene.tracks.map(
                (track) =>
                  `${track.title} ${track.artist}`,
              ),
            ]
              .join(
                " ",
              )
              .toLowerCase()
              .includes(
                needle,
              );
          },
        );
      },
      [
        filter,
        query,
        scenes,
      ],
    );

  const changeVisibility =
    async (
      scene: StoredScene,
      visibility: SceneVisibility,
    ): Promise<void> => {
      if (
        scene.visibility ===
        visibility ||
        scene.libraryType ===
        "saved"
      ) {
        return;
      }

      setBusySceneId(
        scene.id,
      );

      setMessage("");
      setErrorMessage("");

      try {
        const updated =
          await setOwnSceneVisibility(
            scene.id,
            visibility,
          );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.id ===
                updated.id
                  ? updated
                  : candidate,
            ),
        );

        setMessage(
          `"${updated.name}" is now ${visibility}.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not change Scene visibility.",
        );
      } finally {
        setBusySceneId(
          "",
        );
      }
    };

  const performDelete =
    async (
      scene: StoredScene,
    ): Promise<void> => {
      setBusySceneId(
        scene.id,
      );

      setMessage("");
      setErrorMessage("");

      try {
        if (
          scene.libraryType ===
          "saved"
        ) {
          await removeSavedSceneCompletely(
            scene,
          );
        } else {
          await deleteScene(
            scene.id,
          );
        }

        setScenes(
          (current) =>
            current.filter(
              (candidate) =>
                candidate.id !==
                scene.id,
            ),
        );

        setMessage(
          scene.libraryType ===
          "saved"
            ? `"${scene.name}" was removed from your Library and saved list.`
            : `"${scene.name}" was deleted.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not delete this Scene.",
        );
      } finally {
        setBusySceneId(
          "",
        );
      }
    };

  const confirmDelete =
    (
      scene: StoredScene,
    ): void => {
      Alert.alert(
        scene.libraryType ===
          "saved"
          ? "Remove saved Scene?"
          : "Delete Scene?",

        scene.libraryType ===
          "saved"
          ? `"${scene.name}" will be removed from this account's Library. The original creator's public Scene will not be affected.`
          : `"${scene.name}" will be permanently deleted from this Canal account.`,

        [
          {
            text:
              "Cancel",

            style:
              "cancel",
          },

          {
            text:
              scene.libraryType ===
                "saved"
                ? "Remove"
                : "Delete",

            style:
              "destructive",

            onPress: () =>
              void performDelete(
                scene,
              ),
          },
        ],
      );
    };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
      ]}
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
            styles.header
          }
        >
          <View>
            <Text
              style={
                styles.title
              }
            >
              Library
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Your created and saved Scenes.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/scene-studio" as never,
              )
            }
            style={
              styles.createButton
            }
          >
            <Text
              style={
                styles.createButtonText
              }
            >
              + Create
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Scene collaboration"
          accessibilityHint="Review collaboration invitations and shared Scenes."
          onPress={() =>
            router.push(
              "/scene-collaboration" as never,
            )
          }
          style={({ pressed }) => [
            styles.collaborationButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <View>
            <Text
              style={
                styles.collaborationTitle
              }
            >
              Scene collaboration
            </Text>

            <Text
              style={
                styles.collaborationText
              }
            >
              Invitations, shared edits, and revision conflicts
            </Text>
          </View>

          <Text
            style={
              styles.arrow
            }
          >
            ›
          </Text>
        </Pressable>

        <TextInput
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder="Search your Library"
          placeholderTextColor="#9A938C"
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.searchInput
          }
        />

        <View
          style={
            styles.filters
          }
        >
          {(
            [
              "all",
              "created",
              "saved",
              "favorites",
            ] as LibraryFilter[]
          ).map(
            (value) => (
              <Pressable
                key={
                  value
                }
                accessibilityRole="button"
                onPress={() =>
                  setFilter(
                    value,
                  )
                }
                style={[
                  styles.filterButton,

                  filter ===
                    value &&
                    styles.filterSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,

                    filter ===
                      value &&
                      styles.filterTextSelected,
                  ]}
                >
                  {value
                    .charAt(
                      0,
                    )
                    .toUpperCase() +
                    value.slice(
                      1,
                    )}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {message ? (
          <Notice
            success
            text={
              message
            }
          />
        ) : null}

        {errorMessage ? (
          <Notice
            text={
              errorMessage
            }
          />
        ) : null}

        {loading ? (
          <View
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
            />
          </View>
        ) : filteredScenes.length ===
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
              No matching Scenes
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Create a Scene or save one from Explore.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {filteredScenes.map(
              (scene) => {
                const busy =
                  busySceneId ===
                  scene.id;

                const sourceHandle =
                  typeof scene
                    .sourceCreatorHandle ===
                    "string"
                    ? scene
                        .sourceCreatorHandle
                    : "";

                return (
                  <View
                    key={
                      scene.id
                    }
                    style={
                      styles.sceneCard
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/scenes/[sceneId]",

                          params: {
                            sceneId:
                              scene.id,
                          },
                        } as never)
                      }
                      style={
                        styles.sceneMain
                      }
                    >
                      <View
                        style={
                          styles.artwork
                        }
                      >
                        <Text
                          style={
                            styles.artworkText
                          }
                        >
                          {scene.name
                            .charAt(
                              0,
                            )
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.sceneText
                        }
                      >
                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.sceneName
                          }
                        >
                          {scene.name}
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.sceneMeta
                          }
                        >
                          {scene.activity ||
                            "Any activity"}{" "}
                          ·{" "}
                          {sceneDurationMinutes(
                            scene,
                          )}{" "}
                          min ·{" "}
                          {scene.tracks.length}{" "}
                          tracks
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.sourceText
                          }
                        >
                          {scene.libraryType ===
                          "saved"
                            ? `Saved from ${sourceHandle || "another creator"}`
                            : "Created by you"}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.arrow
                        }
                      >
                        ›
                      </Text>
                    </Pressable>

                    <View
                      style={
                        styles.actionRow
                      }
                    >
                      {scene.libraryType ===
                      "saved" ? (
                        <View
                          style={
                            styles.privateBadge
                          }
                        >
                          <Text
                            style={
                              styles.privateBadgeText
                            }
                          >
                            Private saved copy
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={
                            styles.visibilityButtons
                          }
                        >
                          <VisibilityButton
                            label="Private"
                            selected={
                              scene.visibility ===
                              "private"
                            }
                            disabled={
                              busy
                            }
                            onPress={() =>
                              void changeVisibility(
                                scene,
                                "private",
                              )
                            }
                          />

                          <VisibilityButton
                            label="Public"
                            publicButton
                            selected={
                              scene.visibility ===
                              "public"
                            }
                            disabled={
                              busy
                            }
                            onPress={() =>
                              void changeVisibility(
                                scene,
                                "public",
                              )
                            }
                          />
                        </View>
                      )}

                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          busy
                        }
                        onPress={() =>
                          confirmDelete(
                            scene,
                          )
                        }
                        style={
                          styles.deleteButton
                        }
                      >
                        {busy ? (
                          <ActivityIndicator
                            size="small"
                            color="#A62E27"
                          />
                        ) : (
                          <Text
                            style={
                              styles.deleteText
                            }
                          >
                            {scene.libraryType ===
                            "saved"
                              ? "Remove"
                              : "Delete"}
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

function Notice(
  props: {
    text: string;
    success?: boolean;
  },
) {
  return (
    <View
      style={[
        styles.notice,

        props.success
          ? styles.successNotice
          : styles.errorNotice,
      ]}
    >
      <Text
        style={
          props.success
            ? styles.successText
            : styles.errorText
        }
      >
        {props.text}
      </Text>
    </View>
  );
}

function VisibilityButton(
  props: {
    label: string;
    selected: boolean;
    publicButton?: boolean;
    disabled: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={
        props.disabled
      }
      onPress={
        props.onPress
      }
      style={[
        styles.visibilityButton,

        props.selected &&
          (
            props.publicButton
              ? styles.publicSelected
              : styles.privateSelected
          ),
      ]}
    >
      <Text
        style={[
          styles.visibilityText,

          props.selected &&
            styles.visibilityTextSelected,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FFF9F4",
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 120,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 16,
    },

    title: {
      color: "#181818",
      fontSize: 30,
      fontWeight: "900",
    },

    subtitle: {
      color: "#746D67",
      fontSize: 13,
      marginTop: 3,
    },

    createButton: {
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 14,
      paddingVertical: 11,
    },

    createButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    collaborationButton: {
      minHeight: 72,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 14,
      paddingHorizontal:
        18,
      paddingVertical:
        14,
      borderWidth: 1,
      borderColor:
        "#E7B88F",
      borderRadius:
        20,
      backgroundColor:
        "#FFF1E5",
    },

    collaborationTitle: {
      color:
        "#7D3A10",
      fontSize: 15,
      fontWeight:
        "900",
    },

    collaborationText: {
      marginTop: 3,
      color:
        "#7D6656",
      fontSize: 12,
    },

    pressed: {
      opacity: 0.76,
    },

    searchInput: {
      minHeight: 49,
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      color: "#1B1B1B",
      paddingHorizontal: 14,
    },

    filters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
      marginBottom: 14,
    },

    filterButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 13,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 11,
      paddingVertical: 8,
    },

    filterSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF0E5",
    },

    filterText: {
      color: "#756E68",
      fontSize: 11,
      fontWeight: "800",
    },

    filterTextSelected: {
      color: "#F47A24",
    },

    list: {
      gap: 13,
    },

    sceneCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 21,
      padding: 14,
    },

    sceneMain: {
      flexDirection: "row",
      alignItems:
        "center",
    },

    artwork: {
      width: 58,
      height: 58,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF0E5",
      marginRight: 12,
    },

    artworkText: {
      color: "#F47A24",
      fontSize: 23,
      fontWeight: "900",
    },

    sceneText: {
      flex: 1,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#746D67",
      fontSize: 10,
      marginTop: 4,
    },

    sourceText: {
      color: "#9A938C",
      fontSize: 10,
      marginTop: 4,
    },

    arrow: {
      color: "#B4AAA3",
      fontSize: 25,
      marginLeft: 8,
    },

    actionRow: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      marginTop: 13,
      paddingTop: 11,
    },

    visibilityButtons: {
      flexDirection: "row",
      borderRadius: 12,
      backgroundColor:
        "#EEE7E1",
      padding: 3,
    },

    visibilityButton: {
      minWidth: 66,
      minHeight: 33,
      borderRadius: 9,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    privateSelected: {
      backgroundColor:
        "#7C746D",
    },

    publicSelected: {
      backgroundColor:
        "#F47A24",
    },

    visibilityText: {
      color: "#756E68",
      fontSize: 10,
      fontWeight: "900",
    },

    visibilityTextSelected: {
      color: "#FFFFFF",
    },

    privateBadge: {
      borderRadius: 11,
      backgroundColor:
        "#F2EEEA",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },

    privateBadgeText: {
      color: "#756E68",
      fontSize: 10,
      fontWeight: "800",
    },

    deleteButton: {
      minWidth: 70,
      minHeight: 36,
      borderWidth: 1,
      borderColor:
        "#E4B8B4",
      borderRadius: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginLeft: 10,
    },

    deleteText: {
      color: "#A62E27",
      fontSize: 10,
      fontWeight: "900",
    },

    notice: {
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    successNotice: {
      backgroundColor:
        "#EAF9EF",
    },

    errorNotice: {
      backgroundColor:
        "#FFF0EF",
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

    loadingCard: {
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 22,
    },

    emptyTitle: {
      color: "#1B1B1B",
      fontSize: 18,
      fontWeight: "900",
    },

    emptyText: {
      color: "#746D67",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 7,
    },
  });
