import {
  useCallback,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
  loadSceneCollection,
  saveSceneCollection,
} from "../../lib/scene-collections";

import {
  readScenes,
} from "../../lib/scenes";

import type {
  StoredScene,
} from "../../lib/scenes";

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(
    "/(tabs)/profile" as never,
  );
}

export default function NewSceneCollectionScreen() {
  const params =
    useLocalSearchParams<{
      collectionId?: string;
    }>();

  const collectionId =
    typeof params.collectionId ===
      "string"
      ? params.collectionId
      : "";

  const [
    scenes,
    setScenes,
  ] =
    useState<StoredScene[]>(
      [],
    );

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    selectedIds,
    setSelectedIds,
  ] =
    useState<Set<string>>(
      new Set(),
    );

  const [
    isPublic,
    setIsPublic,
  ] = useState(true);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

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
        setErrorMessage(
          "",
        );

        try {
          const [
            storedScenes,
            existingCollection,
          ] =
            await Promise.all([
              readScenes(),
              collectionId
                ? loadSceneCollection(
                    collectionId,
                  )
                : Promise.resolve(
                    null,
                  ),
            ]);

          const ownedScenes =
            storedScenes.filter(
              (scene) =>
                scene.libraryType !==
                "saved",
            );

          setScenes(
            collectionId
              ? ownedScenes
              : ownedScenes.filter(
                  (scene) =>
                    scene.visibility ===
                    "public",
                ),
          );

          if (
            existingCollection
          ) {
            setTitle(
              existingCollection.title,
            );
            setDescription(
              existingCollection.description,
            );
            setIsPublic(
              existingCollection.isPublic,
            );
            setSelectedIds(
              new Set(
                existingCollection.items.map(
                  (item) =>
                    item.sceneId,
                ),
              ),
            );
          }
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load your public Scenes.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        collectionId,
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

  const toggleScene =
    (
      sceneId: string,
    ): void => {
      setSelectedIds(
        (current) => {
          const next =
            new Set(
              current,
            );

          if (
            next.has(
              sceneId,
            )
          ) {
            next.delete(
              sceneId,
            );
          } else {
            next.add(
              sceneId,
            );
          }

          return next;
        },
      );
    };

  const save =
    async (): Promise<void> => {
      if (saving) {
        return;
      }

      if (!title.trim()) {
        setErrorMessage(
          "Enter a collection title.",
        );
        return;
      }

      if (
        isPublic &&
        selectedIds.size ===
        0
      ) {
        setErrorMessage(
          "Choose at least one public Scene.",
        );
        return;
      }

      setSaving(
        true,
      );
      setErrorMessage(
        "",
      );

      try {
        const collection =
          await saveSceneCollection({
            id:
              collectionId ||
              undefined,
            title,
            description,
            isPublic,
            sceneIds:
              Array.from(
                selectedIds,
              ),
          });

        router.replace({
          pathname:
            "/collections/[collectionId]",
          params: {
            collectionId:
              collection.id,
          },
        } as never);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not publish this Scene collection.",
        );
      } finally {
        setSaving(
          false,
        );
      }
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
          {collectionId
            ? "Edit collection"
            : "New collection"}
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
              styles.introCard
            }
          >
            <Text
              style={
                styles.title
              }
            >
              Curate your public Scenes
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Your selections stay in this order and publish together as one collection.
            </Text>
          </View>

          <Text
            style={
              styles.label
            }
          >
            TITLE
          </Text>

          <TextInput
            accessibilityLabel="Collection title"
            maxLength={
              80
            }
            onChangeText={
              setTitle
            }
            placeholder="Late-night drives"
            placeholderTextColor="#9A938C"
            style={
              styles.input
            }
            value={
              title
            }
          />

          {collectionId ? (
            <View
              style={
                styles.visibilityRow
              }
            >
              <View
                style={
                  styles.visibilityCopy
                }
              >
                <Text
                  style={
                    styles.visibilityTitle
                  }
                >
                  Public collection
                </Text>

                <Text
                  style={
                    styles.visibilityDescription
                  }
                >
                  Drafts may include private Scenes. Publishing requires every selected Scene to be public.
                </Text>
              </View>

              <Switch
                accessibilityLabel="Public collection"
                onValueChange={
                  setIsPublic
                }
                value={
                  isPublic
                }
              />
            </View>
          ) : null}

          <Text
            style={
              styles.label
            }
          >
            DESCRIPTION
          </Text>

          <TextInput
            accessibilityLabel="Collection description"
            maxLength={
              500
            }
            multiline
            onChangeText={
              setDescription
            }
            placeholder="What connects these Scenes?"
            placeholderTextColor="#9A938C"
            style={[
              styles.input,
              styles.descriptionInput,
            ]}
            value={
              description
            }
          />

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
              Public Scenes
            </Text>

            <Text
              style={
                styles.selectionCount
              }
            >
              {
                selectedIds.size
              }{" "}
              selected
            </Text>
          </View>

          {scenes.length >
          0 ? (
            <View
              style={
                styles.sceneList
              }
            >
              {scenes.map(
                (scene) => {
                  const selected =
                    selectedIds.has(
                      scene.id,
                    );

                  return (
                    <Pressable
                      key={
                        scene.id
                      }
                      accessibilityLabel={`${selected ? "Remove" : "Add"} ${scene.name}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked:
                          selected,
                      }}
                      onPress={() =>
                        toggleScene(
                          scene.id,
                        )
                      }
                      style={[
                        styles.sceneCard,
                        selected &&
                          styles.sceneCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.check,
                          selected &&
                            styles.checkSelected,
                        ]}
                      >
                        <Text
                          style={
                            styles.checkText
                          }
                        >
                          {selected
                            ? "✓"
                            : ""}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.sceneCopy
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
                          {
                            scene.name
                          }
                        </Text>

                        <Text
                          style={
                            styles.sceneMeta
                          }
                        >
                          {scene.activity ||
                            "Any activity"}{" "}
                          ·{" "}
                          {
                            scene.tracks.length
                          }{" "}
                          tracks
                        </Text>
                      </View>
                    </Pressable>
                  );
                },
              )}
            </View>
          ) : (
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
                No public Scenes yet
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Publish a Scene from your Library before creating a public collection.
              </Text>
            </View>
          )}

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
              saving ||
              (
                !collectionId &&
                scenes.length ===
                  0
              )
            }
            onPress={() =>
              void save()
            }
            style={[
              styles.publishButton,
              (
                saving ||
                (
                  !collectionId &&
                  scenes.length ===
                    0
                )
              ) &&
                styles.disabledButton,
            ]}
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.publishText
                }
              >
                {collectionId
                  ? isPublic
                    ? "Save public collection"
                    : "Save draft"
                  : "Publish collection"}
              </Text>
            )}
          </Pressable>
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
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 21,
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
      width: 42,
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
    introCard: {
      borderRadius: 22,
      backgroundColor:
        "#FFFFFF",
      padding: 18,
    },
    title: {
      color: "#1B1B1B",
      fontSize: 24,
      fontWeight: "900",
    },
    subtitle: {
      color: "#746D67",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
    },
    label: {
      color: "#8B817A",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
      marginTop: 4,
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
    descriptionInput: {
      minHeight: 94,
      textAlignVertical:
        "top",
    },
    visibilityRow: {
      flexDirection: "row",
      alignItems:
        "center",
      gap: 14,
      borderRadius: 17,
      backgroundColor:
        "#FFFFFF",
      padding: 15,
    },
    visibilityCopy: {
      flex: 1,
    },
    visibilityTitle: {
      color: "#1B1B1B",
      fontSize: 13,
      fontWeight: "900",
    },
    visibilityDescription: {
      color: "#746D67",
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 8,
    },
    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 18,
      fontWeight: "900",
    },
    selectionCount: {
      color: "#F47A24",
      fontSize: 10,
      fontWeight: "900",
    },
    sceneList: {
      gap: 9,
    },
    sceneCard: {
      minHeight: 68,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderWidth: 1,
      borderColor:
        "#E8DFD8",
      borderRadius: 17,
      backgroundColor:
        "#FFFFFF",
      padding: 12,
    },
    sceneCardSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF3EA",
    },
    check: {
      width: 26,
      height: 26,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#D8CEC6",
      borderRadius: 8,
      marginRight: 11,
    },
    checkSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#F47A24",
    },
    checkText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },
    sceneCopy: {
      flex: 1,
    },
    sceneName: {
      color: "#1B1B1B",
      fontSize: 13,
      fontWeight: "900",
    },
    sceneMeta: {
      color: "#817972",
      fontSize: 10,
      marginTop: 4,
    },
    emptyCard: {
      borderWidth: 1,
      borderColor:
        "#EEE5DE",
      borderRadius: 19,
      backgroundColor:
        "#FFFFFF",
      padding: 18,
    },
    emptyTitle: {
      color: "#1B1B1B",
      fontSize: 14,
      fontWeight: "900",
    },
    emptyText: {
      color: "#746D67",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 5,
    },
    errorBox: {
      borderRadius: 15,
      backgroundColor:
        "#FFF0EE",
      padding: 13,
    },
    errorText: {
      color: "#A6352B",
      fontSize: 11,
      lineHeight: 17,
    },
    publishButton: {
      minHeight: 52,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 16,
      backgroundColor:
        "#F47A24",
      marginTop: 4,
    },
    disabledButton: {
      opacity: 0.5,
    },
    publishText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },
  });
