import {
  useCallback,
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
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  inviteSceneCollaborator,
  isSceneRevisionConflictError,
  listIncomingSceneCollaborations,
  listSceneCollaborators,
  loadCollaborativeScene,
  respondToSceneCollaboration,
  revokeSceneCollaborator,
  saveCollaborativeScene,
} from "../lib/scene-collaboration";

import type {
  CollaborativeSceneSave,
  SceneCollaboration,
} from "../lib/scene-collaboration";

import {
  createScene,
  readScenes,
} from "../lib/scenes";

import {
  assertSceneCacheOwner,
  capturePreparedSceneCacheOwner,
  writeScenesForSceneCacheOwner,
} from "../lib/scene-sync";

import {
  useAuth,
} from "../providers/auth-provider";

function parameter(
  value:
    | string
    | string[]
    | undefined,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

async function cacheOwnedCollaborativeScene(
  collaborativeScene:
    CollaborativeSceneSave,
): Promise<void> {
  const cacheOwner =
    await capturePreparedSceneCacheOwner();

  if (
    cacheOwner.userId !==
    collaborativeScene.ownerId
  ) {
    return;
  }

  const scenes =
    await readScenes();

  await assertSceneCacheOwner(
    cacheOwner,
  );

  const cachedScene = {
    ...collaborativeScene.scene,
    ownerId:
      collaborativeScene.ownerId,
    revision:
      collaborativeScene.revision,
    libraryType:
      "created" as const,
  };

  const existingIndex =
    scenes.findIndex(
      (scene) =>
        scene.id ===
        cachedScene.id,
    );

  if (
    existingIndex >=
    0
  ) {
    scenes[existingIndex] =
      cachedScene;
  } else {
    scenes.unshift(
      cachedScene,
    );
  }

  await writeScenesForSceneCacheOwner(
    cacheOwner,
    scenes,
  );
}

export default function SceneCollaborationScreen() {
  const {
    user,
  } =
    useAuth();

  const params =
    useLocalSearchParams<{
      ownerId?: string;
      sceneId?: string;
    }>();

  const ownerId =
    parameter(
      params.ownerId,
    );

  const sceneId =
    parameter(
      params.sceneId,
    );

  const detailMode =
    Boolean(
      ownerId &&
        sceneId,
    );

  const isOwner =
    Boolean(
      user?.id &&
        ownerId ===
          user.id,
    );

  const [
    collaborations,
    setCollaborations,
  ] = useState<
    SceneCollaboration[]
  >([]);

  const [
    collaborativeScene,
    setCollaborativeScene,
  ] =
    useState<
      CollaborativeSceneSave | null
    >(null);

  const [
    handle,
    setHandle,
  ] = useState("");

  const [
    sceneName,
    setSceneName,
  ] = useState("");

  const [
    sceneActivity,
    setSceneActivity,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busyKey,
    setBusyKey,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    conflictMessage,
    setConflictMessage,
  ] = useState("");

  const loadGeneration =
    useRef(
      0,
    );

  const load =
    useCallback(
      async (): Promise<void> => {
        const generation =
          loadGeneration.current +
          1;

        loadGeneration.current =
          generation;

        setLoading(
          true,
        );

        setCollaborations(
          [],
        );

        setCollaborativeScene(
          null,
        );

        setSceneName(
          "",
        );

        setSceneActivity(
          "",
        );

        setConflictMessage(
          "",
        );

        setErrorMessage(
          "",
        );

        try {
          if (
            detailMode
          ) {
            const nextCollaborations =
              await listSceneCollaborators(
                ownerId,
                sceneId,
              );

            if (
              loadGeneration.current !==
              generation
            ) {
              return;
            }

            setCollaborations(
              nextCollaborations,
            );

            const currentMembership =
              nextCollaborations.find(
                (item) =>
                  item.collaboratorId ===
                  user?.id,
              );

            if (
              isOwner ||
              currentMembership
                ?.status ===
                "accepted"
            ) {
              const nextScene =
                await loadCollaborativeScene(
                  ownerId,
                  sceneId,
                );

              if (isOwner) {
                await cacheOwnedCollaborativeScene(
                  nextScene,
                );
              }

              if (
                loadGeneration.current !==
                generation
              ) {
                return;
              }

              setCollaborativeScene(
                nextScene,
              );

              setSceneName(
                nextScene.scene.name,
              );

              setSceneActivity(
                nextScene.scene
                  .activity,
              );
            } else {
              setCollaborativeScene(
                null,
              );
            }
          } else {
            const incoming =
              await listIncomingSceneCollaborations();

            if (
              loadGeneration.current !==
              generation
            ) {
              return;
            }

            setCollaborations(
              incoming,
            );

            setCollaborativeScene(
              null,
            );
          }
        } catch (error) {
          if (
            loadGeneration.current !==
            generation
          ) {
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load Scene collaboration.",
          );
        } finally {
          if (
            loadGeneration.current ===
            generation
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        detailMode,
        isOwner,
        ownerId,
        sceneId,
        user?.id,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();

        return () => {
          loadGeneration.current +=
            1;
        };
      },
      [
        load,
      ],
    ),
  );

  const respond =
    async (
      item:
        SceneCollaboration,
      response:
        | "accepted"
        | "declined",
    ): Promise<void> => {
      const key =
        `${item.sceneOwnerId}:${item.sceneId}`;

      setBusyKey(
        key,
      );

      setMessage(
        "",
      );

      setErrorMessage(
        "",
      );

      try {
        await respondToSceneCollaboration(
          item.sceneOwnerId,
          item.sceneId,
          response,
        );

        setMessage(
          response ===
            "accepted"
            ? "Scene collaboration accepted."
            : "Scene collaboration declined.",
        );

        if (
          response ===
            "accepted"
        ) {
          router.replace({
            pathname:
              "/scene-collaboration",

            params: {
              ownerId:
                item.sceneOwnerId,
              sceneId:
                item.sceneId,
            },
          } as never);
        } else {
          await load();
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not respond to this collaboration.",
        );
      } finally {
        setBusyKey(
          "",
        );
      }
    };

  const duplicateConflictDraft =
    async (): Promise<void> => {
      if (
        !collaborativeScene
      ) {
        return;
      }

      setBusyKey(
        "duplicate-conflict",
      );

      setErrorMessage(
        "",
      );

      try {
        const duplicate =
          await createScene({
            ...collaborativeScene
              .scene,
            id:
              undefined,
            ownerId:
              undefined,
            collaborators: [],
            libraryType:
              "created",
            name:
              `${sceneName.trim() || collaborativeScene.scene.name} (conflict copy)`,
            activity:
              sceneActivity,
          });

        setConflictMessage(
          "",
        );

        setMessage(
          `"${duplicate.name}" was saved as your own Scene. Reloading the shared revision.`,
        );

        await load();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not preserve this draft.",
        );
      } finally {
        setBusyKey(
          "",
        );
      }
    };

  const invite =
    async (): Promise<void> => {
      if (
        !isOwner ||
        !ownerId ||
        !sceneId
      ) {
        return;
      }

      setBusyKey(
        "invite",
      );

      setMessage(
        "",
      );

      setErrorMessage(
        "",
      );

      try {
        await inviteSceneCollaborator(
          ownerId,
          sceneId,
          handle,
        );

        setHandle(
          "",
        );

        setMessage(
          "Collaboration invitation sent.",
        );

        await load();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not send this invitation.",
        );
      } finally {
        setBusyKey(
          "",
        );
      }
    };

  const revoke =
    async (
      item:
        SceneCollaboration,
    ): Promise<void> => {
      setBusyKey(
        item.collaboratorId,
      );

      setMessage(
        "",
      );

      setErrorMessage(
        "",
      );

      try {
        await revokeSceneCollaborator(
          item.sceneOwnerId,
          item.sceneId,
          item.collaboratorId,
        );

        setMessage(
          "Collaboration access revoked.",
        );

        await load();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not revoke this collaborator.",
        );
      } finally {
        setBusyKey(
          "",
        );
      }
    };

  const save =
    async (): Promise<void> => {
      if (
        !collaborativeScene
      ) {
        return;
      }

      setBusyKey(
        "save",
      );

      setMessage(
        "",
      );

      setErrorMessage(
        "",
      );

      setConflictMessage(
        "",
      );

      try {
        const saved =
          await saveCollaborativeScene(
            collaborativeScene
              .ownerId,
            collaborativeScene
              .sceneId,
            collaborativeScene
              .revision,
            {
              ...collaborativeScene
                .scene,
              name:
                sceneName,
              activity:
                sceneActivity,
            },
          );

        setCollaborativeScene(
          saved,
        );

        if (isOwner) {
          await cacheOwnedCollaborativeScene(
            saved,
          );
        }

        setSceneName(
          saved.scene.name,
        );

        setSceneActivity(
          saved.scene.activity,
        );

        setMessage(
          `Saved revision ${saved.revision}.`,
        );
      } catch (error) {
        if (
          isSceneRevisionConflictError(
            error,
          )
        ) {
          setConflictMessage(
            error.message,
          );
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not save this collaborative Scene.",
          );
        }
      } finally {
        setBusyKey(
          "",
        );
      }
    };

  const back =
    (): void => {
      if (
        router.canGoBack()
      ) {
        router.back();
      } else {
        router.replace(
          "/(tabs)/library",
        );
      }
    };

  const currentMembership =
    collaborations.find(
      (item) =>
        item.collaboratorId ===
        user?.id,
    );

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={
            back
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

        <View
          style={
            styles.headerCopy
          }
        >
          <Text
            style={
              styles.title
            }
          >
            Scene collaboration
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Invited edits use revision checks so newer work is never silently overwritten.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
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
              styles.centerCard
            }
          >
            <ActivityIndicator />
          </View>
        ) : detailMode ? (
          <>
            <View
              style={
                styles.card
              }
            >
              <Text
                style={
                  styles.cardEyebrow
                }
              >
                {isOwner
                  ? "Owned Scene"
                  : "Shared Scene"}
              </Text>

              <Text
                style={
                  styles.cardTitle
                }
              >
                {collaborativeScene
                  ?.scene.name ??
                  "Scene invitation"}
              </Text>

              <Text
                style={
                  styles.cardBody
                }
              >
                {isOwner
                  ? `${collaborations.length} invitation${collaborations.length === 1 ? "" : "s"} or collaborator records.`
                  : currentMembership
                    ? `Your access is ${currentMembership.status}.`
                    : "This collaboration is unavailable."}
              </Text>
            </View>

            {isOwner ? (
              <View
                style={
                  styles.card
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Invite by exact handle
                </Text>

                <TextInput
                  accessibilityLabel="Collaborator handle"
                  autoCapitalize="none"
                  autoCorrect={
                    false
                  }
                  onChangeText={
                    setHandle
                  }
                  placeholder="@handle"
                  placeholderTextColor="#91877E"
                  style={
                    styles.input
                  }
                  value={
                    handle
                  }
                />

                <PrimaryButton
                  busy={
                    busyKey ===
                    "invite"
                  }
                  disabled={
                    busyKey !==
                    "" ||
                    !handle.trim()
                  }
                  label="Send invitation"
                  onPress={() =>
                    void invite()
                  }
                />
              </View>
            ) : null}

            {!isOwner &&
            currentMembership
              ?.status ===
              "pending" ? (
              <View
                style={
                  styles.card
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Respond to invitation
                </Text>

                <View
                  style={
                    styles.buttonRow
                  }
                >
                  <PrimaryButton
                    compact
                    busy={
                      busyKey !==
                      ""
                    }
                    disabled={
                      busyKey !==
                      ""
                    }
                    label="Accept"
                    onPress={() =>
                      void respond(
                        currentMembership,
                        "accepted",
                      )
                    }
                  />

                  <SecondaryButton
                    disabled={
                      busyKey !==
                      ""
                    }
                    label="Decline"
                    onPress={() =>
                      void respond(
                        currentMembership,
                        "declined",
                      )
                    }
                  />
                </View>
              </View>
            ) : null}

            {collaborativeScene &&
            (
              isOwner ||
              currentMembership
                ?.status ===
                "accepted"
            ) ? (
              <View
                style={
                  styles.card
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Edit shared details
                </Text>

                <Text
                  style={
                    styles.helper
                  }
                >
                  Revision{" "}
                  {
                    collaborativeScene.revision
                  }
                </Text>

                <TextInput
                  accessibilityLabel="Scene name"
                  onChangeText={
                    setSceneName
                  }
                  placeholder="Scene name"
                  placeholderTextColor="#91877E"
                  style={
                    styles.input
                  }
                  value={
                    sceneName
                  }
                />

                <TextInput
                  accessibilityLabel="Scene activity"
                  onChangeText={
                    setSceneActivity
                  }
                  placeholder="Activity"
                  placeholderTextColor="#91877E"
                  style={
                    styles.input
                  }
                  value={
                    sceneActivity
                  }
                />

                {conflictMessage ? (
                  <View
                    style={
                      styles.conflict
                    }
                  >
                    <Text
                      style={
                        styles.conflictText
                      }
                    >
                      {
                        conflictMessage
                      }
                    </Text>

                    <View
                      style={
                        styles.buttonRow
                      }
                    >
                      <PrimaryButton
                        compact
                        busy={
                          busyKey ===
                          "duplicate-conflict"
                        }
                        disabled={
                          busyKey !==
                          ""
                        }
                        label="Duplicate my changes"
                        onPress={() =>
                          void duplicateConflictDraft()
                        }
                      />

                      <SecondaryButton
                        disabled={
                          busyKey !==
                          ""
                        }
                        label="Reload latest"
                        onPress={() => {
                          setConflictMessage(
                            "",
                          );

                          void load();
                        }}
                      />
                    </View>
                  </View>
                ) : null}

                <PrimaryButton
                  busy={
                    busyKey ===
                    "save"
                  }
                  disabled={
                    busyKey !==
                      "" ||
                    !sceneName.trim()
                  }
                  label="Save revision"
                  onPress={() =>
                    void save()
                  }
                />
              </View>
            ) : null}

            {isOwner &&
            collaborations.length >
              0 ? (
              <View
                style={
                  styles.list
                }
              >
                {collaborations.map(
                  (item) => (
                    <View
                      key={
                        item.collaboratorId
                      }
                      style={
                        styles.card
                      }
                    >
                      <Text
                        style={
                          styles.cardTitle
                        }
                      >
                        Collaborator{" "}
                        {item.collaboratorId.slice(
                          0,
                          8,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.cardBody
                        }
                      >
                        Status:{" "}
                        {
                          item.status
                        }
                      </Text>

                      {item.status !==
                      "revoked" ? (
                        <SecondaryButton
                          disabled={
                            busyKey !==
                            ""
                          }
                          label="Revoke access"
                          onPress={() =>
                            void revoke(
                              item,
                            )
                          }
                        />
                      ) : null}
                    </View>
                  ),
                )}
              </View>
            ) : null}
          </>
        ) : collaborations.length ===
          0 ? (
          <View
            style={
              styles.centerCard
            }
          >
            <Text
              style={
                styles.cardTitle
              }
            >
              No collaboration invitations
            </Text>

            <Text
              style={
                styles.cardBody
              }
            >
              New invitations and accepted shared Scenes will appear here.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {collaborations.map(
              (item) => {
                const key =
                  `${item.sceneOwnerId}:${item.sceneId}`;

                return (
                  <View
                    key={
                      key
                    }
                    style={
                      styles.card
                    }
                  >
                    <Text
                      style={
                        styles.cardEyebrow
                      }
                    >
                      {
                        item.status
                      }
                    </Text>

                    <Text
                      style={
                        styles.cardTitle
                      }
                    >
                      Scene{" "}
                      {
                        item.sceneId
                      }
                    </Text>

                    <Text
                      style={
                        styles.cardBody
                      }
                    >
                      Owner{" "}
                      {item.sceneOwnerId.slice(
                        0,
                        8,
                      )}
                    </Text>

                    {item.status ===
                    "pending" ? (
                      <View
                        style={
                          styles.buttonRow
                        }
                      >
                        <PrimaryButton
                          compact
                          busy={
                            busyKey ===
                            key
                          }
                          disabled={
                            busyKey !==
                            ""
                          }
                          label="Accept"
                          onPress={() =>
                            void respond(
                              item,
                              "accepted",
                            )
                          }
                        />

                        <SecondaryButton
                          disabled={
                            busyKey !==
                            ""
                          }
                          label="Decline"
                          onPress={() =>
                            void respond(
                              item,
                              "declined",
                            )
                          }
                        />
                      </View>
                    ) : (
                      <PrimaryButton
                        label="Open shared Scene"
                        onPress={() =>
                          router.push({
                            pathname:
                              "/scene-collaboration",

                            params: {
                              ownerId:
                                item.sceneOwnerId,
                              sceneId:
                                item.sceneId,
                            },
                          } as never)
                        }
                      />
                    )}
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
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        props.success &&
          styles.noticeSuccess,
      ]}
    >
      <Text
        style={
          styles.noticeText
        }
      >
        {props.text}
      </Text>
    </View>
  );
}

function PrimaryButton(
  props: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    compact?: boolean;
    disabled?: boolean;
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
      style={({ pressed }) => [
        styles.primaryButton,
        props.compact &&
          styles.compactButton,
        props.disabled &&
          styles.disabled,
        pressed &&
          styles.pressed,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator
          color="#FFFFFF"
        />
      ) : (
        <Text
          style={
            styles.primaryButtonText
          }
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}

function SecondaryButton(
  props: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
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
      style={({ pressed }) => [
        styles.secondaryButton,
        props.disabled &&
          styles.disabled,
        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={
          styles.secondaryButtonText
        }
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

    header: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 12,
      paddingHorizontal:
        20,
      paddingVertical:
        14,
      borderBottomWidth:
        1,
      borderBottomColor:
        "#E9DDD4",
    },

    headerCopy: {
      flex: 1,
    },

    backButton: {
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius:
        15,
      backgroundColor:
        "#FFFFFF",
    },

    backText: {
      color:
        "#29231F",
      fontSize: 30,
      lineHeight: 32,
    },

    title: {
      color:
        "#29231F",
      fontSize: 24,
      fontWeight:
        "900",
    },

    subtitle: {
      marginTop: 4,
      color:
        "#6F665F",
      fontSize: 13,
      lineHeight: 19,
    },

    content: {
      gap: 14,
      padding: 20,
      paddingBottom:
        48,
    },

    list: {
      gap: 12,
    },

    card: {
      gap: 12,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#E6D8CE",
      borderRadius:
        22,
      backgroundColor:
        "#FFFFFF",
    },

    centerCard: {
      alignItems:
        "center",
      gap: 10,
      padding: 28,
      borderRadius:
        22,
      backgroundColor:
        "#FFFFFF",
    },

    cardEyebrow: {
      color:
        "#D85E0D",
      fontSize: 11,
      fontWeight:
        "900",
      letterSpacing:
        0.9,
      textTransform:
        "uppercase",
    },

    cardTitle: {
      color:
        "#29231F",
      fontSize: 18,
      fontWeight:
        "900",
    },

    sectionTitle: {
      color:
        "#29231F",
      fontSize: 16,
      fontWeight:
        "900",
    },

    cardBody: {
      color:
        "#6F665F",
      fontSize: 13,
      lineHeight: 19,
    },

    helper: {
      color:
        "#887D74",
      fontSize: 12,
    },

    input: {
      minHeight: 50,
      paddingHorizontal:
        14,
      borderWidth: 1,
      borderColor:
        "#D8C8BC",
      borderRadius:
        15,
      color:
        "#29231F",
      backgroundColor:
        "#FFFDFC",
      fontSize: 15,
    },

    buttonRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
    },

    primaryButton: {
      minHeight: 50,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        18,
      borderRadius:
        16,
      backgroundColor:
        "#D85E0D",
    },

    compactButton: {
      flex: 1,
    },

    primaryButtonText: {
      color:
        "#FFFFFF",
      fontSize: 14,
      fontWeight:
        "900",
    },

    secondaryButton: {
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        16,
      borderWidth: 1,
      borderColor:
        "#D8C8BC",
      borderRadius:
        15,
      backgroundColor:
        "#FFFFFF",
    },

    secondaryButtonText: {
      color:
        "#7D3A10",
      fontSize: 13,
      fontWeight:
        "800",
    },

    conflict: {
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#E0A27A",
      borderRadius:
        15,
      backgroundColor:
        "#FFF2E8",
    },

    conflictText: {
      color:
        "#7A3210",
      fontSize: 13,
      lineHeight: 19,
    },

    notice: {
      padding: 14,
      borderRadius:
        14,
      backgroundColor:
        "#FFE9E4",
    },

    noticeSuccess: {
      backgroundColor:
        "#E5F5E9",
    },

    noticeText: {
      color:
        "#493F39",
      fontSize: 13,
      lineHeight: 19,
      fontWeight:
        "700",
    },

    disabled: {
      opacity: 0.48,
    },

    pressed: {
      opacity: 0.76,
    },
  });
