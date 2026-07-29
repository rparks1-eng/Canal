import {
  useCallback,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  deleteSceneCollection,
  loadSceneCollection,
} from "../../lib/scene-collections";

import type {
  SceneCollectionDetail,
} from "../../lib/scene-collections";

import {
  useAuth,
} from "../../providers/auth-provider";

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(
    "/(tabs)/profile" as never,
  );
}

export default function SceneCollectionScreen() {
  const {
    user,
  } =
    useAuth();

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
    collection,
    setCollection,
  ] =
    useState<
      SceneCollectionDetail | null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    deleting,
    setDeleting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const load =
    useCallback(
      async (): Promise<void> => {
        if (!collectionId) {
          setErrorMessage(
            "The Scene collection ID is missing.",
          );
          setLoading(
            false,
          );
          return;
        }

        setLoading(
          true,
        );
        setErrorMessage(
          "",
        );

        try {
          setCollection(
            await loadSceneCollection(
              collectionId,
            ),
          );
        } catch (error) {
          setCollection(
            null,
          );
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "This Scene collection is unavailable.",
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

  const remove =
    async (): Promise<void> => {
      if (
        deleting ||
        !collection
      ) {
        return;
      }

      setDeleting(
        true,
      );
      setErrorMessage(
        "",
      );

      try {
        await deleteSceneCollection(
          collection.id,
        );
        router.replace(
          "/(tabs)/profile" as never,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not delete this Scene collection.",
        );
      } finally {
        setDeleting(
          false,
        );
      }
    };

  const confirmDelete =
    (): void => {
      if (!collection) {
        return;
      }

      Alert.alert(
        "Delete collection?",
        `"${collection.title}" will be removed. Its Scenes stay in your Library.`,
        [
          {
            text: "Cancel",
            style:
              "cancel",
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

  const isOwner =
    Boolean(
      collection &&
        user?.id ===
          collection.ownerId,
    );

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
          Scene collection
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
        >
          {collection ? (
            <>
              <View
                style={
                  styles.hero
                }
              >
                <View
                  style={
                    styles.publicBadge
                  }
                >
                  <Text
                    style={
                      styles.publicBadgeText
                    }
                  >
                    {collection.isPublic
                      ? "PUBLIC COLLECTION"
                      : "DRAFT COLLECTION"}
                  </Text>
                </View>

                <Text
                  selectable
                  style={
                    styles.title
                  }
                >
                  {
                    collection.title
                  }
                </Text>

                {collection.description ? (
                  <Text
                    selectable
                    style={
                      styles.description
                    }
                  >
                    {
                      collection.description
                    }
                  </Text>
                ) : null}

                <Text
                  style={
                    styles.count
                  }
                >
                  {
                    collection.items.length
                  }{" "}
                  {collection.items.length ===
                  1
                    ? "Scene"
                    : "Scenes"}
                </Text>
              </View>

              {isOwner ? (
                <>
                  <Pressable
                    accessibilityLabel={`Plan an event with ${collection.title}`}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname:
                          "/event-run-sheet",
                        params: {
                          collectionId:
                            collection.id,
                        },
                      } as never)
                    }
                    style={
                      styles.planEventButton
                    }
                  >
                    <View>
                      <Text
                        style={
                          styles.planEventEyebrow
                        }
                      >
                        PRIVATE CREATOR TOOL
                      </Text>

                      <Text
                        style={
                          styles.planEventText
                        }
                      >
                        Plan event
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.planEventArrow
                      }
                    >
                      ›
                    </Text>
                  </Pressable>

                  <View
                    style={
                      styles.ownerActions
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/collections/new",
                          params: {
                            collectionId:
                              collection.id,
                          },
                        } as never)
                      }
                      style={
                        styles.editButton
                      }
                    >
                      <Text
                        style={
                          styles.editText
                        }
                      >
                        Edit collection
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        deleting
                      }
                      onPress={
                        confirmDelete
                      }
                      style={
                        styles.deleteButton
                      }
                    >
                      {deleting ? (
                        <ActivityIndicator
                          color="#A6352B"
                        />
                      ) : (
                        <Text
                          style={
                            styles.deleteText
                          }
                        >
                          Delete
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : null}

              <View
                style={
                  styles.sceneList
                }
              >
                {collection.items.map(
                  (
                    item,
                    index,
                  ) => (
                    <Pressable
                      key={
                        `${item.sceneId}:${item.position}`
                      }
                      accessibilityLabel={`Open ${item.scene.name}`}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push(
                          isOwner &&
                            item.scene.visibility !==
                              "public"
                            ? ({
                                pathname:
                                  "/scenes/[sceneId]",
                                params: {
                                  sceneId:
                                    item.sceneId,
                                },
                              } as never)
                            : ({
                                pathname:
                                  "/public-scene",
                                params: {
                                  ownerId:
                                    collection.ownerId,
                                  sceneId:
                                    item.sceneId,
                                },
                              } as never),
                        )
                      }
                      style={
                        styles.sceneCard
                      }
                    >
                      <View
                        style={
                          styles.position
                        }
                      >
                        <Text
                          style={
                            styles.positionText
                          }
                        >
                          {
                            index +
                            1
                          }
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
                            item.scene.name
                          }
                        </Text>

                        <Text
                          style={
                            styles.sceneMeta
                          }
                        >
                          {item.scene.activity ||
                            "Any activity"}{" "}
                          ·{" "}
                          {
                            item.scene.tracks.length
                          }{" "}
                          tracks
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
                  ),
                )}
              </View>
            </>
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
      gap: 13,
    },
    hero: {
      borderRadius: 24,
      backgroundColor:
        "#FFFFFF",
      padding: 20,
    },
    publicBadge: {
      alignSelf:
        "flex-start",
      borderRadius: 9,
      backgroundColor:
        "#FFF0E5",
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    publicBadgeText: {
      color: "#B9500B",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    title: {
      color: "#1B1B1B",
      fontSize: 28,
      fontWeight: "900",
      marginTop: 12,
    },
    description: {
      color: "#5F5751",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
    },
    count: {
      color: "#F47A24",
      fontSize: 11,
      fontWeight: "900",
      marginTop: 13,
    },
    ownerActions: {
      flexDirection: "row",
      gap: 9,
    },
    planEventButton: {
      minHeight: 66,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor:
        "#2B1710",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    planEventEyebrow: {
      color: "#FFB781",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    planEventText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
      marginTop: 3,
    },
    planEventArrow: {
      color: "#FFB781",
      fontSize: 28,
    },
    editButton: {
      flex: 1,
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
    },
    editText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },
    deleteButton: {
      minWidth: 92,
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
    sceneList: {
      gap: 10,
    },
    sceneCard: {
      minHeight: 72,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderWidth: 1,
      borderColor:
        "#EEE5DE",
      borderRadius: 18,
      backgroundColor:
        "#FFFFFF",
      padding: 12,
    },
    position: {
      width: 36,
      height: 36,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 11,
      backgroundColor:
        "#FFF0E5",
      marginRight: 11,
    },
    positionText: {
      color: "#F47A24",
      fontSize: 12,
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
    arrow: {
      color: "#F47A24",
      fontSize: 24,
      marginLeft: 8,
    },
    errorBox: {
      borderRadius: 18,
      backgroundColor:
        "#FFF0EE",
      padding: 16,
    },
    errorText: {
      color: "#A6352B",
      fontSize: 11,
      lineHeight: 17,
    },
    retryButton: {
      alignSelf:
        "flex-start",
      borderRadius: 11,
      backgroundColor:
        "#A6352B",
      paddingHorizontal: 13,
      paddingVertical: 9,
      marginTop: 11,
    },
    retryText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },
  });
