import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  useCallback,
  useMemo,
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
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  captureCreatorReleaseAccount,
  createCreatorRelease,
} from "../../lib/creator-releases";

import {
  createCreatorReleaseMutationLeaseGate,
  shouldDiscardCreatorReleaseSnapshot,
} from "../../lib/creator-release-interface";

import {
  listOwnSceneCollections,
} from "../../lib/scene-collections";

import type {
  SceneCollectionSummary,
} from "../../lib/scene-collections";

import type {
  ConnectivityStatus,
} from "../../lib/connectivity";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

const MAX_TITLE_LENGTH =
  80;

const MAX_DESCRIPTION_LENGTH =
  500;

export type CreationSnapshotMutationGateInput =
  Readonly<{
    loadInFlight: boolean;
    isLoading: boolean;
    hasFreshSnapshot: boolean;
  }>;

export function creationSnapshotMutationIsBlocked(
  input:
    CreationSnapshotMutationGateInput,
): boolean {
  return (
    input.loadInFlight ||
    input.isLoading ||
    !input.hasFreshSnapshot
  );
}

type ReleaseErrorShape = {
  kind?: unknown;
  message?: unknown;
};

function taggedError(
  kind: string,
  message: string,
): Error & {
  kind: string;
} {
  return Object.assign(
    new Error(
      message,
    ),
    {
      kind,
    },
  );
}

function releaseIssue(
  error: unknown,
  connectivityStatus:
    ConnectivityStatus,
): RecoveryIssue {
  const shape =
    error &&
    typeof error ===
      "object"
      ? error as ReleaseErrorShape
      : {};

  const kind =
    typeof shape.kind ===
      "string"
      ? shape.kind
      : "";

  const message =
    error instanceof Error
      ? error.message
      : typeof shape.message ===
          "string"
        ? shape.message
        : "";

  if (
    kind === "offline" ||
    connectivityStatus ===
      "offline"
  ) {
    return {
      kind: "offline",
      title:
        "Release creation is offline",
      message:
        "Reconnect before loading collections or creating a release. No draft was queued.",
      action: "retry",
      actionLabel:
        "Check connection",
    };
  }

  if (
    kind ===
      "account-changed"
  ) {
    return {
      kind: "canal-session",
      title:
        "Account changed",
      message:
        "Canal stopped this request before it could affect the previous account. Reload collections for the current account.",
      action: "retry",
      actionLabel:
        "Load current account",
    };
  }

  if (
    kind ===
      "permission-denied" ||
    kind === "blocked"
  ) {
    return {
      kind: "service",
      title:
        "Collection unavailable",
      message:
        message ||
        "This account cannot use that Scene collection for a release.",
      action: "retry",
      actionLabel:
        "Reload collections",
    };
  }

  if (
    kind === "conflict" ||
    kind === "stale"
  ) {
    return {
      kind: "service",
      title:
        "Collection changed",
      message:
        message ||
        "The selected collection changed while the release was being created. Reload it before trying again.",
      action: "retry",
      actionLabel:
        "Reload collections",
    };
  }

  return classifyRecoveryIssue(
    error,
    {
      service: "canal",
      connectivityStatus,
    },
  );
}

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value[0] ??
      "";
  }

  return value ??
    "";
}

function goBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/releases" as never,
  );
}

function collectionIsEligible(
  collection:
    SceneCollectionSummary,
): boolean {
  return (
    collection.isPublic &&
    collection.sceneCount >
      0
  );
}

export default function NewCreatorReleaseScreen() {
  const {
    user,
  } = useAuth();

  return (
    <NewCreatorReleaseContent
      key={
        user?.id ??
        "signed-out"
      }
      expectedUserId={
        user?.id ??
        ""
      }
    />
  );
}

function NewCreatorReleaseContent(
  props: {
    expectedUserId: string;
  },
) {
  const params =
    useLocalSearchParams<{
      collectionId?:
        | string
        | string[];
    }>();

  const requestedCollectionId =
    firstParam(
      params.collectionId,
    );

  const {
    user,
  } = useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    collections,
    setCollections,
  ] =
    useState<
      SceneCollectionSummary[]
    >([]);

  const [
    selectedCollectionId,
    setSelectedCollectionId,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    hasFreshSnapshot,
    setHasFreshSnapshot,
  ] = useState(false);

  const [
    isCreating,
    setIsCreating,
  ] = useState(false);

  const [
    loadError,
    setLoadError,
  ] =
    useState<unknown>(
      null,
    );

  const [
    formMessage,
    setFormMessage,
  ] = useState("");

  const [
    restoredDraftId,
    setRestoredDraftId,
  ] = useState("");

  const requestEpoch =
    useRef(0);

  const loadInFlightRef =
    useRef<
      number | null
    >(
      null,
    );

  const freshSnapshotRef =
    useRef(false);

  const mutationLeaseGateRef =
    useRef(
      createCreatorReleaseMutationLeaseGate(),
    );

  const activeUserIdRef =
    useRef<
      string | null
    >(
      user?.id ??
      null,
    );

  activeUserIdRef.current =
    user?.id ??
    null;

  const loadCollections =
    useCallback(
      async (
        checkedStatus:
          ConnectivityStatus =
            connectivityStatus,
      ): Promise<boolean> => {
        const epoch =
          requestEpoch.current +
          1;

        requestEpoch.current =
          epoch;

        loadInFlightRef.current =
          epoch;
        freshSnapshotRef.current =
          false;

        setHasFreshSnapshot(
          false,
        );

        const isCurrent =
          (
            accountUserId:
              string,
          ): boolean =>
            requestEpoch.current ===
              epoch &&
            activeUserIdRef.current ===
              accountUserId &&
            accountUserId ===
              props.expectedUserId;

        setIsLoading(
          true,
        );
        setLoadError(
          null,
        );

        try {
          if (
            !props.expectedUserId
          ) {
            throw taggedError(
              "account-changed",
              "Sign in to create a release.",
            );
          }

          if (
            checkedStatus ===
              "offline"
          ) {
            throw taggedError(
              "offline",
              "Canal is offline.",
            );
          }

          const account =
            await captureCreatorReleaseAccount(
              props.expectedUserId,
            );

          if (
            !isCurrent(
              account.userId,
            )
          ) {
            return false;
          }

          const nextCollections =
            await listOwnSceneCollections({
              account,
            });

          if (
            !isCurrent(
              account.userId,
            )
          ) {
            return false;
          }

          setCollections(
            nextCollections,
          );

          setSelectedCollectionId(
            (current) => {
              const requested =
                requestedCollectionId
                  ? nextCollections.find(
                      (collection) =>
                        collection.id ===
                        requestedCollectionId,
                    )
                  : null;

              if (
                requested &&
                collectionIsEligible(
                  requested,
                )
              ) {
                return requested.id;
              }

              const currentCollection =
                nextCollections.find(
                  (collection) =>
                    collection.id ===
                    current,
                );

              return currentCollection &&
                collectionIsEligible(
                  currentCollection,
                )
                ? current
                : "";
            },
          );

          if (
            requestedCollectionId
          ) {
            const requested =
              nextCollections.find(
                (collection) =>
                  collection.id ===
                  requestedCollectionId,
              );

            if (
              !requested
            ) {
              setFormMessage(
                "The preselected collection is unavailable to this account.",
              );
            } else if (
              !requested.isPublic
            ) {
              setFormMessage(
                "The preselected collection is a draft. Publish it before starting a release.",
              );
            } else if (
              requested.sceneCount ===
                0
            ) {
              setFormMessage(
                "The preselected collection is empty. Add at least one public Scene first.",
              );
            } else {
              setFormMessage(
                "",
              );
            }
          }

          freshSnapshotRef.current =
            true;
          setHasFreshSnapshot(
            true,
          );

          return true;
        } catch (error) {
          if (
            requestEpoch.current !==
              epoch ||
            activeUserIdRef.current !==
              props.expectedUserId
          ) {
            return false;
          }

          if (
            shouldDiscardCreatorReleaseSnapshot(
              error,
            )
          ) {
            setCollections(
              [],
            );
            setSelectedCollectionId(
              "",
            );
          }

          setLoadError(
            error,
          );

          return false;
        } finally {
          if (
            loadInFlightRef.current ===
            epoch
          ) {
            loadInFlightRef.current =
              null;
          }

          if (
            requestEpoch.current ===
              epoch &&
            activeUserIdRef.current ===
              props.expectedUserId
          ) {
            setIsLoading(
              false,
            );
          }
        }
      },
      [
        connectivityStatus,
        props.expectedUserId,
        requestedCollectionId,
      ],
    );

  const loadCollectionsRef =
    useRef(
      loadCollections,
    );

  loadCollectionsRef.current =
    loadCollections;

  useFocusEffect(
    useCallback(
      () => {
        void loadCollectionsRef.current();

        return () => {
          requestEpoch.current +=
            1;
          mutationLeaseGateRef.current
            .invalidateCommits();
          freshSnapshotRef.current =
            false;
          loadInFlightRef.current =
            null;

          setHasFreshSnapshot(
            false,
          );
          setIsLoading(
            false,
          );
        };
      },
      [],
    ),
  );

  useReconnectReload(
    useCallback(
      async (): Promise<void> => {
        await loadCollections();
      },
      [
        loadCollections,
      ],
    ),
  );

  const retry =
    useCallback(
      async (): Promise<void> => {
        const checkedStatus =
          await refreshConnectivity();

        await loadCollections(
          checkedStatus,
        );
      },
      [
        loadCollections,
        refreshConnectivity,
      ],
    );

  const eligibleCollections =
    useMemo(
      () =>
        collections.filter(
          collectionIsEligible,
        ),
      [
        collections,
      ],
    );

  const selectedCollection =
    useMemo(
      () =>
        collections.find(
          (collection) =>
            collection.id ===
            selectedCollectionId,
        ) ??
        null,
      [
        collections,
        selectedCollectionId,
      ],
    );

  const snapshotMutationIsBlocked =
    (): boolean =>
      creationSnapshotMutationIsBlocked({
        loadInFlight:
          loadInFlightRef.current !==
          null,
        isLoading,
        hasFreshSnapshot:
          hasFreshSnapshot &&
          freshSnapshotRef.current,
      });

  const createRelease =
    async (): Promise<void> => {
      if (
        mutationLeaseGateRef.current
          .isBusy() ||
        isCreating
      ) {
        return;
      }

      if (
        restoredDraftId ||
        snapshotMutationIsBlocked()
      ) {
        return;
      }

      if (
        connectivityStatus ===
          "offline"
      ) {
        setLoadError(
          taggedError(
            "offline",
            "Canal is offline.",
          ),
        );

        return;
      }

      if (
        activeUserIdRef.current !==
          props.expectedUserId ||
        !props.expectedUserId
      ) {
        setLoadError(
          taggedError(
            "account-changed",
            "The signed-in account changed.",
          ),
        );

        return;
      }

      if (
        loadError
      ) {
        setLoadError(
          taggedError(
            "stale",
            "Reload your collections before creating a release.",
          ),
        );

        return;
      }

      const normalizedTitle =
        title.trim();

      const normalizedDescription =
        description.trim();

      if (
        !selectedCollection
      ) {
        setFormMessage(
          "Choose a public, non-empty Scene collection.",
        );

        return;
      }

      if (
        !selectedCollection.isPublic
      ) {
        setFormMessage(
          "Draft collections cannot start a release. Publish this collection first.",
        );

        return;
      }

      if (
        selectedCollection.sceneCount <=
          0
      ) {
        setFormMessage(
          "An empty collection cannot start a release. Add at least one public Scene first.",
        );

        return;
      }

      if (
        !normalizedTitle
      ) {
        setFormMessage(
          "Enter a release title.",
        );

        return;
      }

      if (
        normalizedTitle.length >
          MAX_TITLE_LENGTH ||
        normalizedDescription.length >
          MAX_DESCRIPTION_LENGTH
      ) {
        setFormMessage(
          "Shorten the release title or description before continuing.",
        );

        return;
      }

      const lease =
        mutationLeaseGateRef.current
          .acquire();

      if (!lease) {
        return;
      }

      setIsCreating(
        true,
      );
      setLoadError(
        null,
      );
      setFormMessage(
        "",
      );

      const isCurrent =
        (
          accountUserId:
            string,
        ): boolean =>
          mutationLeaseGateRef.current
            .canCommit(
              lease,
            ) &&
          activeUserIdRef.current ===
            accountUserId &&
          accountUserId ===
            props.expectedUserId;

      try {
        const account =
          await captureCreatorReleaseAccount(
            props.expectedUserId,
          );

        if (
          !isCurrent(
            account.userId,
          )
        ) {
          return;
        }

        const release =
          await createCreatorRelease(
            {
              collectionId:
                selectedCollection.id,
              title:
                normalizedTitle,
              description:
                normalizedDescription,
            },
            {
              account,
            },
          );

        if (
          !isCurrent(
            account.userId,
          )
        ) {
          if (
            activeUserIdRef.current ===
              props.expectedUserId &&
            props.expectedUserId
          ) {
            setRestoredDraftId(
              release.id,
            );
          }

          return;
        }

        router.replace({
          pathname:
            "/releases/[releaseId]",
          params: {
            releaseId:
              release.id,
          },
        } as never);
      } catch (error) {
        if (
          mutationLeaseGateRef.current
            .canCommit(
              lease,
            ) &&
          activeUserIdRef.current ===
            props.expectedUserId
        ) {
          setLoadError(
            error,
          );
        }
      } finally {
        const released =
          mutationLeaseGateRef.current
            .release(
              lease,
            );

        if (released) {
          setIsCreating(
            false,
          );
        }
      }
    };

  const issue =
    loadError
      ? releaseIssue(
          loadError,
          connectivityStatus,
        )
      : null;

  const createIsDisabled =
    snapshotMutationIsBlocked() ||
    isCreating ||
    Boolean(
      restoredDraftId,
    ) ||
    Boolean(
      loadError,
    ) ||
    connectivityStatus ===
      "offline" ||
    !selectedCollection ||
    !collectionIsEligible(
      selectedCollection,
    );

  return (
    <SafeAreaView
      edges={[
        "top",
        "left",
        "right",
      ]}
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
          accessibilityHint="Returns to the previous Canal screen"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={
            goBack
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
            ‹
          </Text>
        </Pressable>

        <Text
          style={
            styles.headerTitle
          }
        >
          New Release
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            styles.column
          }
        >
          <View
            style={
              styles.introCard
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              DRAFT FIRST
            </Text>

            <Text
              selectable
              style={
                styles.title
              }
            >
              Start from a public collection.
            </Text>

            <Text
              selectable
              style={
                styles.subtitle
              }
            >
              Creating this draft does not open voting. When you open it, Canal freezes the collection’s ordered Scene IDs and revisions.
            </Text>
          </View>

          {issue ? (
            <RecoveryNotice
              busy={
                isLoading ||
                isCreating
              }
              issue={
                issue
              }
              onAction={
                retry
              }
            />
          ) : null}

          {isLoading &&
          collections.length ===
            0 ? (
            <View
              accessibilityLabel="Loading your Scene collections"
              accessibilityLiveRegion="polite"
              style={
                styles.loading
              }
            >
              <ActivityIndicator
                color="#F47A24"
                size="large"
              />

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading your collections…
              </Text>
            </View>
          ) : null}

          {isLoading &&
          collections.length >
            0 &&
          !issue ? (
            <View
              accessibilityLiveRegion="polite"
              style={
                styles.refreshNotice
              }
            >
              <ActivityIndicator
                color="#A84B0E"
                size="small"
              />

              <Text
                selectable
                style={
                  styles.refreshText
                }
              >
                Refreshing collection eligibility…
              </Text>
            </View>
          ) : null}

          {connectivityStatus ===
            "offline" &&
          collections.length >
            0 &&
          !issue ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={
                styles.offlineNotice
              }
            >
              <Text
                selectable
                style={
                  styles.offlineText
                }
              >
                Offline. Your form stays on this device, but Canal will not queue or create a release draft.
              </Text>
            </View>
          ) : null}

          {!isLoading &&
          collections.length ===
            0 &&
          !issue ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                selectable
                style={
                  styles.emptyTitle
                }
              >
                No Scene collections yet
              </Text>

              <Text
                selectable
                style={
                  styles.emptyText
                }
              >
                Create a public collection with at least one public Scene before starting a release.
              </Text>

              <Pressable
                accessibilityLabel="Create a Scene collection"
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/collections/new" as never,
                  )
                }
                style={
                  styles.secondaryButton
                }
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  New Scene collection
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading &&
          collections.length >
            0 &&
          eligibleCollections.length ===
            0 ? (
            <View
              accessibilityLiveRegion="polite"
              style={
                styles.warningCard
              }
            >
              <Text
                selectable
                style={
                  styles.warningTitle
                }
              >
                No eligible collection
              </Text>

              <Text
                selectable
                style={
                  styles.warningText
                }
              >
                Publish a non-empty collection first. Draft, private, and empty choices stay disabled below.
              </Text>
            </View>
          ) : null}

          {collections.length >
          0 ? (
            <View
              style={
                styles.section
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Scene collection
              </Text>

              <Text
                selectable
                style={
                  styles.sectionDescription
                }
              >
                Choose one collection. Its current order is copied only when the ballot opens.
              </Text>

              <View
                accessibilityRole="radiogroup"
                style={
                  styles.collectionList
                }
              >
                {collections.map(
                  (collection) => {
                    const selected =
                      collection.id ===
                      selectedCollectionId;

                    const eligible =
                      collectionIsEligible(
                        collection,
                      );

                    const disabledReason =
                      !collection.isPublic
                        ? "Draft collection"
                        : collection.sceneCount ===
                            0
                          ? "Empty collection"
                          : "";

                    return (
                      <Pressable
                        accessibilityHint={
                          eligible
                            ? "Selects this collection for the release draft"
                            : disabledReason
                        }
                        accessibilityLabel={`${collection.title}, ${collection.sceneCount} ${collection.sceneCount === 1 ? "Scene" : "Scenes"}${disabledReason ? `, ${disabledReason}` : ""}`}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked:
                            selected,
                          disabled:
                            !eligible ||
                            isCreating ||
                            Boolean(
                              restoredDraftId,
                            ),
                        }}
                        disabled={
                          !eligible ||
                          isCreating ||
                          Boolean(
                            restoredDraftId,
                          )
                        }
                        key={
                          collection.id
                        }
                        onPress={() => {
                          if (
                            !eligible ||
                            isCreating
                          ) {
                            return;
                          }

                          setSelectedCollectionId(
                            collection.id,
                          );
                          setFormMessage(
                            "",
                          );
                        }}
                        style={({
                          pressed,
                        }) => [
                          styles.collectionCard,
                          selected &&
                            styles.collectionCardSelected,
                          !eligible &&
                            styles.disabledCard,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected &&
                              styles.radioSelected,
                          ]}
                        >
                          {selected ? (
                            <View
                              style={
                                styles.radioDot
                              }
                            />
                          ) : null}
                        </View>

                        <View
                          style={
                            styles.collectionCopy
                          }
                        >
                          <Text
                            numberOfLines={2}
                            selectable
                            style={
                              styles.collectionTitle
                            }
                          >
                            {
                              collection.title
                            }
                          </Text>

                          <Text
                            style={
                              styles.collectionMeta
                            }
                          >
                            {
                              collection.sceneCount
                            }{" "}
                            {collection.sceneCount ===
                            1
                              ? "Scene"
                              : "Scenes"}{" "}
                            ·{" "}
                            {collection.isPublic
                              ? "Public"
                              : "Draft"}
                          </Text>

                          {disabledReason ? (
                            <Text
                              selectable
                              style={
                                styles.disabledReason
                              }
                            >
                              {disabledReason}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>
          ) : null}

          <View
            style={
              styles.section
            }
          >
            <View
              style={
                styles.labelRow
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                RELEASE TITLE
              </Text>

              <Text
                accessibilityLabel={`${title.length} of ${MAX_TITLE_LENGTH} characters used`}
                style={
                  styles.characterCount
                }
              >
                {
                  title.length
                }
                /
                {
                  MAX_TITLE_LENGTH
                }
              </Text>
            </View>

            <TextInput
              accessibilityLabel="Release title"
              editable={
                !isCreating &&
                !restoredDraftId
              }
              maxLength={
                MAX_TITLE_LENGTH
              }
              onChangeText={
                setTitle
              }
              placeholder="Summer Canal Sessions"
              placeholderTextColor={canalDynamicColors.muted}
              returnKeyType="next"
              style={
                styles.input
              }
              value={
                title
              }
            />

            <View
              style={
                styles.labelRow
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                DESCRIPTION
              </Text>

              <Text
                accessibilityLabel={`${description.length} of ${MAX_DESCRIPTION_LENGTH} characters used`}
                style={
                  styles.characterCount
                }
              >
                {
                  description.length
                }
                /
                {
                  MAX_DESCRIPTION_LENGTH
                }
              </Text>
            </View>

            <TextInput
              accessibilityLabel="Release description"
              editable={
                !isCreating &&
                !restoredDraftId
              }
              maxLength={
                MAX_DESCRIPTION_LENGTH
              }
              multiline
              onChangeText={
                setDescription
              }
              placeholder="Tell listeners what connects these Scenes."
              placeholderTextColor={canalDynamicColors.muted}
              style={[
                styles.input,
                styles.descriptionInput,
              ]}
              textAlignVertical="top"
              value={
                description
              }
            />
          </View>

          {restoredDraftId ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={
                styles.restoredDraftCard
              }
            >
              <Text
                selectable
                style={
                  styles.restoredDraftTitle
                }
              >
                Draft created while you were away
              </Text>

              <Text
                selectable
                style={
                  styles.restoredDraftText
                }
              >
                Canal stopped the late navigation. Open the completed draft before starting another release.
              </Text>

              <Pressable
                accessibilityLabel="Open the completed release draft"
                accessibilityRole="button"
                onPress={() => {
                  router.replace({
                    pathname:
                      "/releases/[releaseId]",
                    params: {
                      releaseId:
                        restoredDraftId,
                    },
                  } as never);
                }}
                style={
                  styles.restoredDraftButton
                }
              >
                <Text
                  style={
                    styles.restoredDraftButtonText
                  }
                >
                  Open completed draft
                </Text>
              </Pressable>
            </View>
          ) : null}

          {formMessage ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={
                styles.formMessage
              }
            >
              <Text
                selectable
                style={
                  styles.formMessageText
                }
              >
                {formMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityLabel={
              isCreating
                ? "Creating release draft"
                : "Create release draft"
            }
            accessibilityRole="button"
            accessibilityState={{
              busy:
                isCreating,
              disabled:
                createIsDisabled,
            }}
            disabled={
              createIsDisabled
            }
            onPress={() => {
              void createRelease();
            }}
            style={({
              pressed,
            }) => [
              styles.createButton,
              createIsDisabled &&
                styles.disabledButton,
              pressed &&
                styles.pressed,
            ]}
          >
            {isCreating ? (
              <ActivityIndicator
                color="#FFFFFF"
                size="small"
              />
            ) : null}

            <Text
              style={
                styles.createButtonText
              }
            >
              {isCreating
                ? "Creating draft…"
                : "Create draft"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.surface,
    },

    header: {
      minHeight: 58,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingVertical: 8,
    },

    headerButton: {
      width: 44,
      height: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 22,
      backgroundColor: canalDynamicColors.surface,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
    },

    headerTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    headerSpacer: {
      width: 44,
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 48,
    },

    column: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      gap: 16,
    },

    introCard: {
      gap: 8,
      padding: 20,
      borderRadius: 24,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    eyebrow: {
      color: canalDynamicColors.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 32,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
    },

    loading: {
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 12,
    },

    loadingText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
    },

    refreshNotice: {
      minHeight: 44,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 15,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF3E9",
    },

    refreshText: {
      flex: 1,
      color: "#7C451F",
      fontSize: 12,
      lineHeight: 18,
    },

    offlineNotice: {
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#D8C7A6",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF7DF",
    },

    offlineText: {
      color: "#6E5525",
      fontSize: 12,
      lineHeight: 18,
    },

    emptyCard: {
      alignItems:
        "flex-start",
      gap: 12,
      padding: 20,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 22,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 20,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
    },

    secondaryButton: {
      minHeight: 46,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor:
        "#E8C6AC",
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF3E9",
    },

    secondaryButtonText: {
      color: "#A84B0E",
      fontSize: 12,
      fontWeight: "900",
    },

    warningCard: {
      gap: 5,
      padding: 15,
      borderWidth: 1,
      borderColor:
        "#E9C89B",
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF6DF",
    },

    warningTitle: {
      color: "#6D4D1B",
      fontSize: 14,
      fontWeight: "900",
    },

    warningText: {
      color: "#735B35",
      fontSize: 12,
      lineHeight: 18,
    },

    section: {
      gap: 10,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    sectionDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    collectionList: {
      gap: 10,
    },

    collectionCard: {
      minHeight: 80,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#E9E0D8",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    collectionCardSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF5EC",
    },

    disabledCard: {
      opacity: 0.58,
      backgroundColor:
        "#F5F1ED",
    },

    radio: {
      width: 24,
      height: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 2,
      borderColor:
        "#B9AEA5",
      borderRadius: 12,
    },

    radioSelected: {
      borderColor:
        "#F47A24",
    },

    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor:
        "#F47A24",
    },

    collectionCopy: {
      flex: 1,
      gap: 4,
    },

    collectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    collectionMeta: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontVariant: [
        "tabular-nums",
      ],
    },

    disabledReason: {
      color: "#98572E",
      fontSize: 10,
      fontWeight: "800",
    },

    labelRow: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      paddingTop: 4,
    },

    label: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    characterCount: {
      color: "#8A817A",
      fontSize: 10,
      fontVariant: [
        "tabular-nums",
      ],
    },

    input: {
      minHeight: 50,
      paddingHorizontal: 15,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor:
        "#E7DED6",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 14,
    },

    descriptionInput: {
      minHeight: 126,
    },

    restoredDraftCard: {
      alignItems:
        "flex-start",
      gap: 9,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#B8DEC5",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor:
        "#EAF7EE",
    },

    restoredDraftTitle: {
      color: "#2F6543",
      fontSize: 15,
      fontWeight: "900",
    },

    restoredDraftText: {
      color: "#496C56",
      fontSize: 12,
      lineHeight: 18,
    },

    restoredDraftButton: {
      minHeight: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 16,
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor:
        "#347047",
    },

    restoredDraftButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    formMessage: {
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#EDC3BC",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF0EE",
    },

    formMessageText: {
      color: "#8C352D",
      fontSize: 12,
      lineHeight: 18,
    },

    createButton: {
      minHeight: 52,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 9,
      paddingHorizontal: 18,
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F47A24",
    },

    createButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    disabledButton: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
