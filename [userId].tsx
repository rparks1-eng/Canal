import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  loadPublicProfile,
  savePublicSceneToLibrary,
} from "../../lib/social";

import type {
  PublicCanalProfile,
  PublicCanalScene,
} from "../../lib/social";

function safeBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/explore" as never,
  );
}

function creatorInitials(
  profile: PublicCanalProfile,
): string {
  return profile.displayName
    .trim()
    .split(
      /\s+/,
    )
    .filter(
      Boolean,
    )
    .slice(
      0,
      2,
    )
    .map(
      (word) =>
        word
          .charAt(
            0,
          )
          .toUpperCase(),
    )
    .join("") || "C";
}

export default function CreatorProfileScreen() {
  const params =
    useLocalSearchParams<{
      userId?: string;
    }>();

  const userId =
    typeof params.userId ===
      "string"
      ? params.userId
      : "";

  const [
    profile,
    setProfile,
  ] =
    useState<
      PublicCanalProfile | null
    >(
      null,
    );

  const [
    scenes,
    setScenes,
  ] =
    useState<
      PublicCanalScene[]
    >([]);

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
        if (!userId) {
          setErrorMessage(
            "The creator ID is missing.",
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );

        setErrorMessage("");

        try {
          const result =
            await loadPublicProfile(
              userId,
            );

          setProfile(
            result.profile,
          );

          setScenes(
            result.scenes,
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load this creator.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        userId,
      ],
    );

  useEffect(() => {
    void load();
  }, [
    load,
  ]);

  const initials =
    useMemo(
      () =>
        profile
          ? creatorInitials(
              profile,
            )
          : "C",
      [
        profile,
      ],
    );

  const save =
    async (
      scene: PublicCanalScene,
    ): Promise<void> => {
      const key =
        `${scene.ownerId}:${scene.sceneId}`;

      setSavingKey(
        key,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await savePublicSceneToLibrary(
          scene,
        );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.sceneId ===
                  scene.sceneId
                  ? {
                      ...candidate,

                      savedByMe:
                        true,
                    }
                  : candidate,
            ),
        );

        setMessage(
          `"${scene.scene.name}" was saved to your Library.`,
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
        "bottom",
      ]}
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={
            safeBack
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
          Creator
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
            size="large"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {profile ? (
            <View
              style={
                styles.profileCard
              }
            >
              <View
                style={
                  styles.avatar
                }
              >
                <Text
                  style={
                    styles.avatarText
                  }
                >
                  {initials}
                </Text>
              </View>

              <Text
                style={
                  styles.name
                }
              >
                {profile.displayName}
              </Text>

              <Text
                style={
                  styles.handle
                }
              >
                {profile.handle}
              </Text>

              {profile.bio ? (
                <Text
                  style={
                    styles.bio
                  }
                >
                  {profile.bio}
                </Text>
              ) : null}

              {profile.favoriteActivities ? (
                <View
                  style={
                    styles.activitiesBox
                  }
                >
                  <Text
                    style={
                      styles.activitiesLabel
                    }
                  >
                    FAVORITE ACTIVITIES
                  </Text>

                  <Text
                    style={
                      styles.activitiesText
                    }
                  >
                    {profile.favoriteActivities}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

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
                styles.sceneCount
              }
            >
              {scenes.length}
            </Text>
          </View>

          {scenes.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                This creator has no public Scenes.
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.list
              }
            >
              {scenes.map(
                (scene) => {
                  const key =
                    `${scene.ownerId}:${scene.sceneId}`;

                  return (
                    <View
                      key={
                        key
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
                              "/public-scene",

                            params: {
                              ownerId:
                                scene.ownerId,

                              sceneId:
                                scene.sceneId,
                            },
                          } as never)
                        }
                        style={
                          styles.scenePressable
                        }
                      >
                        <View
                          style={
                            styles.sceneArtwork
                          }
                        >
                          <Text
                            style={
                              styles.sceneArtworkText
                            }
                          >
                            {scene.scene.name
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
                            {scene.scene.name}
                          </Text>

                          <Text
                            style={
                              styles.sceneMeta
                            }
                          >
                            {scene.scene.activity ||
                              "Any activity"}{" "}
                            ·{" "}
                            {scene.scene.tracks.length}{" "}
                            tracks
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          scene.isMine ||
                          scene.savedByMe ||
                          savingKey ===
                            key
                        }
                        onPress={() =>
                          void save(
                            scene,
                          )
                        }
                        style={[
                          styles.saveButton,

                          (
                            scene.isMine ||
                            scene.savedByMe ||
                            savingKey ===
                              key
                          ) &&
                            styles.saveButtonDisabled,
                        ]}
                      >
                        {savingKey ===
                        key ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFFFF"
                          />
                        ) : (
                          <Text
                            style={
                              styles.saveButtonText
                            }
                          >
                            {scene.isMine
                              ? "Yours"
                              : scene.savedByMe
                                ? "Saved"
                                : "Save"}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                },
              )}
            </View>
          )}
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
      paddingTop: 8,
      paddingBottom: 12,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
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
      paddingBottom: 45,
    },

    profileCard: {
      alignItems:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 24,
      padding: 22,
    },

    avatar: {
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    avatarText: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "900",
    },

    name: {
      color: "#1B1B1B",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 12,
    },

    handle: {
      color: "#817972",
      fontSize: 13,
      marginTop: 3,
    },

    bio: {
      color: "#4F4944",
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 14,
    },

    activitiesBox: {
      width: "100%",
      backgroundColor:
        "#FFF9F4",
      borderRadius: 16,
      padding: 14,
      marginTop: 15,
    },

    activitiesLabel: {
      color: "#A09993",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    activitiesText: {
      color: "#4F4944",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginTop: 20,
      marginBottom: 11,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    sceneCount: {
      color: "#F47A24",
      fontSize: 13,
      fontWeight: "900",
    },

    list: {
      gap: 12,
    },

    sceneCard: {
      flexDirection: "row",
      alignItems:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 19,
      padding: 13,
    },

    scenePressable: {
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
    },

    sceneArtwork: {
      width: 52,
      height: 52,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF0E5",
      marginRight: 11,
    },

    sceneArtworkText: {
      color: "#F47A24",
      fontSize: 21,
      fontWeight: "900",
    },

    sceneText: {
      flex: 1,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#817972",
      fontSize: 10,
      marginTop: 4,
    },

    saveButton: {
      minWidth: 65,
      minHeight: 38,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginLeft: 10,
      paddingHorizontal: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        "#CFC7C0",
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 19,
      padding: 18,
    },

    emptyText: {
      color: "#746D67",
      fontSize: 13,
      lineHeight: 19,
    },

    successBox: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 15,
      padding: 13,
      marginTop: 14,
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
      marginTop: 14,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },
  });
