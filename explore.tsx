import {
  useCallback,
  useMemo,
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
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  loadExploreScenes,
  savePublicSceneToLibrary,
} from "../../lib/social";

import type {
  PublicCanalScene,
} from "../../lib/social";

function PublicSceneCard(
  props: {
    item: PublicCanalScene;
    saving: boolean;
    onSave: () => void;
  },
) {
  const {
    item,
  } = props;

  const artistPreview =
    item.scene.tracks
      .slice(
        0,
        3,
      )
      .map(
        (track) =>
          track.artist,
      )
      .filter(
        Boolean,
      )
      .join(
        ", ",
      );

  return (
    <View
      style={
        styles.card
      }
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname:
              "/public-scene",

            params: {
              ownerId:
                item.ownerId,

              sceneId:
                item.sceneId,
            },
          } as never)
        }
        style={({
          pressed,
        }) => [
          styles.scenePressable,

          pressed &&
            styles.pressed,
        ]}
      >
        <View
          style={
            styles.cardTop
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
              {item.scene.name
                .charAt(
                  0,
                )
                .toUpperCase()}
            </Text>
          </View>

          <View
            style={
              styles.cardText
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
              {item.scene.name}
            </Text>

            <Text
              numberOfLines={
                1
              }
              style={
                styles.sceneMeta
              }
            >
              {item.scene.activity ||
                "Any activity"}{" "}
              ·{" "}
              {item.scene.tracks.length}{" "}
              tracks
            </Text>

            <Text
              numberOfLines={
                1
              }
              style={
                styles.artistText
              }
            >
              {artistPreview ||
                item.scene.emotions ||
                "Canal Scene"}
            </Text>
          </View>
        </View>
      </Pressable>

      <View
        style={
          styles.creatorRow
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname:
                "/creator/[userId]",

              params: {
                userId:
                  item.ownerId,
              },
            } as never)
          }
          style={({
            pressed,
          }) => [
            styles.creatorButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.creatorAvatar
            }
          >
            <Text
              style={
                styles.creatorAvatarText
              }
            >
              {item.creator.displayName
                .charAt(
                  0,
                )
                .toUpperCase()}
            </Text>
          </View>

          <View
            style={
              styles.creatorText
            }
          >
            <Text
              numberOfLines={
                1
              }
              style={
                styles.creatorName
              }
            >
              {item.creator.displayName}
              {item.isMine
                ? " · You"
                : ""}
            </Text>

            <Text
              style={
                styles.creatorHandle
              }
            >
              {item.creator.handle}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={
            item.isMine ||
            item.savedByMe ||
            props.saving
          }
          onPress={
            props.onSave
          }
          style={[
            styles.saveButton,

            (
              item.isMine ||
              item.savedByMe ||
              props.saving
            ) &&
              styles.saveButtonDisabled,
          ]}
        >
          {props.saving ? (
            <ActivityIndicator
              color="#FFFFFF"
              size="small"
            />
          ) : (
            <Text
              style={
                styles.saveButtonText
              }
            >
              {item.isMine
                ? "Yours"
                : item.savedByMe
                  ? "Saved"
                  : "Save"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const [
    scenes,
    setScenes,
  ] =
    useState<
      PublicCanalScene[]
    >([]);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingKey,
    setSavingKey,
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
          const result =
            await loadExploreScenes();

          setScenes(
            result,
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load Explore.",
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

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return scenes;
        }

        return scenes.filter(
          (item) =>
            [
              item.scene.name,
              item.scene.activity,
              item.scene.emotions,
              item.scene.genres,
              item.creator.displayName,
              item.creator.handle,
              ...item.scene.tracks.map(
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
              ),
        );
      },
      [
        query,
        scenes,
      ],
    );

  const save =
    async (
      item: PublicCanalScene,
    ): Promise<void> => {
      const key =
        `${item.ownerId}:${item.sceneId}`;

      setSavingKey(
        key,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await savePublicSceneToLibrary(
          item,
        );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.ownerId ===
                  item.ownerId &&
                candidate.sceneId ===
                  item.sceneId
                  ? {
                      ...candidate,

                      savedByMe:
                        true,
                    }
                  : candidate,
            ),
        );

        setMessage(
          `"${item.scene.name}" was saved to your Library.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save this Scene.",
        );
      } finally {
        setSavingKey(
          "",
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
              Explore
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Public Scenes from Canal creators.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void load()
            }
            style={
              styles.refreshButton
            }
          >
            <Text
              style={
                styles.refreshText
              }
            >
              Refresh
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder="Search Scenes, creators, moods, or artists"
          placeholderTextColor="#9A938C"
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.searchInput
          }
        />

        {message ? (
          <View
            style={
              styles.successBox
            }
          >
            <Text
              style={
                styles.successText
              }
            >
              {message}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View
            style={
              styles.errorBox
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
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

            <Text
              style={
                styles.loadingText
              }
            >
              Loading public Scenes...
            </Text>
          </View>
        ) : filtered.length ===
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
              No public Scenes yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Change one of your created Scenes to Public in Library. Your own public Scene will appear here so the social flow can be tested before other creators join.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {filtered.map(
              (item) => {
                const key =
                  `${item.ownerId}:${item.sceneId}`;

                return (
                  <PublicSceneCard
                    key={
                      key
                    }
                    item={
                      item
                    }
                    saving={
                      savingKey ===
                      key
                    }
                    onSave={() =>
                      void save(
                        item,
                      )
                    }
                  />
                );
              },
            )}
          </View>
        )}
      </ScrollView>
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

    refreshButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    refreshText: {
      color: "#F47A24",
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 13,
      paddingHorizontal: 14,
      marginBottom: 14,
    },

    list: {
      gap: 14,
    },

    card: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 15,
    },

    scenePressable: {
      borderRadius: 17,
    },

    cardTop: {
      flexDirection: "row",
      alignItems:
        "center",
    },

    artwork: {
      width: 64,
      height: 64,
      borderRadius: 18,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF0E5",
      marginRight: 13,
    },

    artworkText: {
      color: "#F47A24",
      fontSize: 25,
      fontWeight: "900",
    },

    cardText: {
      flex: 1,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 17,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#746D67",
      fontSize: 11,
      marginTop: 4,
    },

    artistText: {
      color: "#9A938C",
      fontSize: 10,
      marginTop: 4,
    },

    creatorRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      marginTop: 14,
      paddingTop: 12,
    },

    creatorButton: {
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
    },

    creatorAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEE7E1",
      marginRight: 9,
    },

    creatorAvatarText: {
      color: "#4F4944",
      fontSize: 12,
      fontWeight: "900",
    },

    creatorText: {
      flex: 1,
    },

    creatorName: {
      color: "#322E2B",
      fontSize: 12,
      fontWeight: "900",
    },

    creatorHandle: {
      color: "#8B837C",
      fontSize: 10,
      marginTop: 2,
    },

    saveButton: {
      minWidth: 68,
      minHeight: 38,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 12,
      marginLeft: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        "#CFC7C0",
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
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

    loadingText: {
      color: "#746D67",
      fontSize: 13,
      marginTop: 12,
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

    successBox: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor:
        "#FFF0EF",
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

    pressed: {
      opacity: 0.7,
    },
  });
