import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import DateTimePicker from "@react-native-community/datetimepicker";

import type {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
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
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  eventRunSheetLocalDateTimeFromInstant,
  resolveEventRunSheetLocalDateTime,
  resolvedEventRunSheetTimeZone,
} from "../../lib/event-run-sheet-datetime";

import {
  createEventRunSheetMutationLeaseGate,
  eventRunSheetMutationIsBlocked,
  eventRunSheetRequestCanCommit,
  shouldDiscardEventRunSheetSnapshot,
} from "../../lib/event-run-sheet-interface";

import {
  eventRunSheetRecoveryIssue,
} from "../../lib/event-run-sheet-recovery";

import {
  captureEventRunSheetAccount,
  deleteEventRunSheet,
  loadEventRunSheet,
  saveEventRunSheet,
  startEventRunSheet,
} from "../../lib/event-run-sheets";

import type {
  EventRunSheet,
} from "../../lib/event-run-sheets";

import {
  listOwnSceneCollections,
} from "../../lib/scene-collections";

import type {
  SceneCollectionSummary,
} from "../../lib/scene-collections";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type PickerMode =
  | "date"
  | "time"
  | "";

const MAX_TITLE_LENGTH =
  80;

const MAX_VENUE_LENGTH =
  120;

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(
    value,
  )
    ? value[0] ??
        ""
    : value ??
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
    "/event-run-sheets" as never,
  );
}

function localDateTimeValue(
  date: Date,
): string {
  const pad = (
    value: number,
  ) =>
    value
      .toString()
      .padStart(
        2,
        "0",
      );

  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() +
        1,
    ),
    "-",
    pad(
      date.getDate(),
    ),
    "T",
    pad(
      date.getHours(),
    ),
    ":",
    pad(
      date.getMinutes(),
    ),
  ].join(
    "",
  );
}

function initialLocalDateTime(): string {
  const date =
    new Date();

  date.setMinutes(
    date.getMinutes() +
      60,
    0,
    0,
  );

  return localDateTimeValue(
    date,
  );
}

function pickerDate(
  value: string,
): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
      value,
    );

  if (!match) {
    return new Date();
  }

  const date =
    new Date(
      Number(
        match[1],
      ),
      Number(
        match[2],
      ) -
        1,
      Number(
        match[3],
      ),
      Number(
        match[4],
      ),
      Number(
        match[5],
      ),
      0,
      0,
    );

  return Number.isFinite(
    date.getTime(),
  )
    ? date
    : new Date();
}

export default function EventRunSheetBuilderScreen() {
  const {
    user,
    accountEpoch,
  } =
    useAuth();

  return (
    <EventRunSheetBuilderContent
      key={
        `${user?.id ?? "signed-out"}:${accountEpoch}`
      }
      expectedUserId={
        user?.id ??
        ""
      }
      expectedAccountEpoch={
        accountEpoch
      }
    />
  );
}

function EventRunSheetBuilderContent(
  props: {
    expectedUserId: string;
    expectedAccountEpoch: number;
  },
) {
  const {
    user,
    accountEpoch,
  } =
    useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams<{
      collectionId?:
        | string
        | string[];
      runSheetId?:
        | string
        | string[];
    }>();

  const requestedCollectionId =
    firstParam(
      params.collectionId,
    );

  const requestedRunSheetId =
    firstParam(
      params.runSheetId,
    );

  const [
    collections,
    setCollections,
  ] =
    useState<
      SceneCollectionSummary[]
    >([]);

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
    selectedCollectionId,
    setSelectedCollectionId,
  ] =
    useState(
      "",
    );

  const [
    title,
    setTitle,
  ] =
    useState(
      "",
    );

  const [
    venueLabel,
    setVenueLabel,
  ] =
    useState(
      "",
    );

  const [
    localDateTime,
    setLocalDateTime,
  ] =
    useState(
      initialLocalDateTime,
    );

  const [
    timeZone,
    setTimeZone,
  ] =
    useState(
      resolvedEventRunSheetTimeZone,
    );

  const [
    pickerMode,
    setPickerMode,
  ] =
    useState<PickerMode>(
      "",
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(
      true,
    );

  const [
    hasFreshSnapshot,
    setHasFreshSnapshot,
  ] =
    useState(
      false,
    );

  const [
    busyAction,
    setBusyAction,
  ] =
    useState(
      "",
    );

  const [
    issue,
    setIssue,
  ] =
    useState<
      RecoveryIssue | null
    >(
      null,
    );

  const [
    overlapNotice,
    setOverlapNotice,
  ] =
    useState(
      "",
    );

  const requestEpochRef =
    useRef(
      0,
    );

  const mutationGateRef =
    useRef(
      createEventRunSheetMutationLeaseGate(),
    );

  const screenHeadingRef =
    useRef<Text>(
      null,
    );

  const recoveryHeadingRef =
    useRef<Text>(
      null,
    );

  const focusedStateRef =
    useRef<string | null>(
      null,
    );

  useEffect(
    () => {
      if (
        isLoading ||
        user?.id !==
          props.expectedUserId ||
        accountEpoch !==
          props.expectedAccountEpoch
      ) {
        return;
      }

      const focusState =
        issue
          ? `recovery:${issue.title}:${issue.message}`
          : "heading";

      if (
        focusedStateRef.current ===
        focusState
      ) {
        return;
      }

      focusedStateRef.current =
        focusState;

      const target =
        issue
          ? recoveryHeadingRef.current
          : screenHeadingRef.current;

      const targetNode =
        findNodeHandle(
          target,
        );

      if (
        targetNode !==
        null
      ) {
        AccessibilityInfo
          .setAccessibilityFocus(
            targetNode,
          );
      }
    },
    [
      accountEpoch,
      isLoading,
      issue,
      props.expectedAccountEpoch,
      props.expectedUserId,
      user?.id,
    ],
  );

  const applyRunSheet =
    useCallback(
      (
        next:
          EventRunSheet | null,
        nextCollections:
          SceneCollectionSummary[],
      ): void => {
        setRunSheet(
          next,
        );

        const selectedId =
          next?.collectionId ??
          (
            nextCollections.some(
              (collection) =>
                collection.id ===
                requestedCollectionId,
            )
              ? requestedCollectionId
              : nextCollections[0]?.id ??
                ""
          );

        setSelectedCollectionId(
          selectedId,
        );

        const selected =
          nextCollections.find(
            (collection) =>
              collection.id ===
              selectedId,
          );

        setTitle(
          next?.title ??
          (
            selected
              ? `${selected.title} run sheet`
              : ""
          ),
        );
        setVenueLabel(
          next?.venueLabel ??
          "",
        );
        setTimeZone(
          next?.timeZone ??
          resolvedEventRunSheetTimeZone(),
        );
        setLocalDateTime(
          next
            ? eventRunSheetLocalDateTimeFromInstant(
                next.startsAt,
                next.timeZone,
              )
            : initialLocalDateTime(),
        );
        setOverlapNotice(
          "",
        );
      },
      [
        requestedCollectionId,
      ],
    );

  const load =
    useCallback(
      async (): Promise<void> => {
        const requestEpoch =
          requestEpochRef.current +
          1;

        requestEpochRef.current =
          requestEpoch;
        mutationGateRef.current
          .invalidateCommits();

        setIsLoading(
          true,
        );
        setHasFreshSnapshot(
          false,
        );
        setIssue(
          null,
        );

        try {
          if (
            connectivityStatus ===
              "offline"
          ) {
            throw Object.assign(
              new Error(
                "Event Run Sheet planning is offline.",
              ),
              {
                kind:
                  "offline",
              },
            );
          }

          const account =
            await captureEventRunSheetAccount(
              {
                userId:
                  props.expectedUserId,
                accountEpoch:
                  props.expectedAccountEpoch,
              },
            );

          const [
            nextCollections,
            nextDetail,
          ] =
            await Promise.all([
              listOwnSceneCollections({
                account,
              }),
              requestedRunSheetId
                ? loadEventRunSheet(
                    requestedRunSheetId,
                    {
                      account,
                    },
                  )
                : Promise.resolve(
                    null,
                  ),
            ]);

          if (
            !eventRunSheetRequestCanCommit({
              expectedUserId:
                props.expectedUserId,
              expectedAccountEpoch:
                props.expectedAccountEpoch,
              activeUserId:
                user?.id ??
                null,
              activeAccountEpoch:
                accountEpoch,
              accountUserId:
                account.userId,
              accountEpoch:
                account.accountEpoch,
              requestEpoch,
              activeRequestEpoch:
                requestEpochRef.current,
              expectedRunSheetId:
                requestedRunSheetId ||
                undefined,
              activeRunSheetId:
                requestedRunSheetId ||
                undefined,
            })
          ) {
            return;
          }

          if (
            requestedRunSheetId &&
            !nextDetail
          ) {
            throw Object.assign(
              new Error(
                "This Event Run Sheet is unavailable.",
              ),
              {
                kind:
                  "not-found",
              },
            );
          }

          if (
            nextDetail &&
            nextDetail.status !==
              "planned"
          ) {
            router.replace({
              pathname:
                "/event-run-sheets/[runSheetId]",
              params: {
                runSheetId:
                  nextDetail.id,
              },
            } as never);

            return;
          }

          setCollections(
            nextCollections,
          );
          applyRunSheet(
            nextDetail,
            nextCollections,
          );
          setHasFreshSnapshot(
            true,
          );
        } catch (error) {
          if (
            requestEpoch !==
            requestEpochRef.current
          ) {
            return;
          }

          if (
            shouldDiscardEventRunSheetSnapshot(
              error,
            )
          ) {
            setCollections(
              [],
            );
            setRunSheet(
              null,
            );
            setSelectedCollectionId(
              "",
            );
          }

          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "plan",
            ),
          );
        } finally {
          if (
            requestEpoch ===
            requestEpochRef.current
          ) {
            setIsLoading(
              false,
            );
          }
        }
      },
      [
        applyRunSheet,
        accountEpoch,
        connectivityStatus,
        props.expectedAccountEpoch,
        props.expectedUserId,
        requestedRunSheetId,
        user?.id,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();

        return () => {
          requestEpochRef.current +=
            1;
          mutationGateRef.current
            .invalidateCommits();
        };
      },
      [
        load,
      ],
    ),
  );

  useReconnectReload(
    load,
  );

  const retry =
    async (): Promise<void> => {
      await refreshConnectivity();
      await load();
    };

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

  const mutationBlocked =
    eventRunSheetMutationIsBlocked({
      isLoading,
      hasFreshSnapshot,
      isOffline:
        connectivityStatus ===
        "offline",
      isBusy:
        Boolean(
          busyAction,
        ),
    });

  const fieldsAreValid =
    Boolean(
      selectedCollection &&
      title.trim() &&
      venueLabel.trim() &&
      localDateTime.trim() &&
      timeZone.trim(),
    );

  const canStart =
    Boolean(
      fieldsAreValid &&
      selectedCollection &&
      selectedCollection.sceneCount >=
        1 &&
      selectedCollection.sceneCount <=
        50,
    );

  const runSave =
    async (
      shouldStart:
        boolean,
    ): Promise<void> => {
      if (
        mutationBlocked ||
        !fieldsAreValid ||
        (
          shouldStart &&
          !canStart
        ) ||
        !selectedCollection
      ) {
        return;
      }

      const lease =
        mutationGateRef.current
          .acquire();

      if (!lease) {
        return;
      }

      setBusyAction(
        shouldStart
          ? "start"
          : "save",
      );
      setIssue(
        null,
      );
      setOverlapNotice(
        "",
      );

      try {
        if (
          connectivityStatus ===
            "offline"
        ) {
          throw Object.assign(
            new Error(
              "Reconnect before changing this Event Run Sheet.",
            ),
            {
              kind:
                "offline",
            },
          );
        }

        const account =
          await captureEventRunSheetAccount(
            {
              userId:
                props.expectedUserId,
              accountEpoch:
                props.expectedAccountEpoch,
            },
          );

        const resolvedSchedule =
          resolveEventRunSheetLocalDateTime(
            localDateTime,
            timeZone.trim(),
          );

        const saved =
          await saveEventRunSheet(
            {
              id:
                runSheet?.id,
              collectionId:
                selectedCollection.id,
              title,
              venueLabel,
              startsAt:
                resolvedSchedule.instant,
              timeZone:
                timeZone.trim(),
              expectedVersion:
                runSheet?.version,
            },
            {
              account,
            },
          );

        if (
          !mutationGateRef.current
            .canCommit(
              lease,
            ) ||
          user?.id !==
            account.userId ||
          props.expectedUserId !==
            account.userId ||
          accountEpoch !==
            account.accountEpoch ||
          props.expectedAccountEpoch !==
            account.accountEpoch
        ) {
          return;
        }

        setRunSheet(
          saved,
        );
        setTitle(
          saved.title,
        );
        setVenueLabel(
          saved.venueLabel,
        );
        setTimeZone(
          saved.timeZone,
        );
        setLocalDateTime(
          eventRunSheetLocalDateTimeFromInstant(
            saved.startsAt,
            saved.timeZone,
          ),
        );
        setOverlapNotice(
          resolvedSchedule.overlap ===
            "earlier"
            ? "This clock time occurs twice. Canal saved the first occurrence in the selected time zone."
            : "",
        );

        if (
          !shouldStart
        ) {
          AccessibilityInfo
            .announceForAccessibility(
              "Event Run Sheet plan saved.",
            );

          return;
        }

        const started =
          await startEventRunSheet(
            saved.id,
            saved.version,
            {
              account,
            },
          );

        if (
          !mutationGateRef.current
            .canCommit(
              lease,
            ) ||
          user?.id !==
            account.userId ||
          props.expectedUserId !==
            account.userId ||
          accountEpoch !==
            account.accountEpoch ||
          props.expectedAccountEpoch !==
            account.accountEpoch
        ) {
          return;
        }

        AccessibilityInfo
          .announceForAccessibility(
            "Event Run Sheet started with a frozen Scene order.",
          );

        router.replace({
          pathname:
            "/event-run-sheets/[runSheetId]",
          params: {
            runSheetId:
              started.id,
          },
        } as never);
      } catch (error) {
        if (
          mutationGateRef.current
            .canCommit(
              lease,
            )
        ) {
          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "plan",
            ),
          );
        }
      } finally {
        mutationGateRef.current
          .release(
            lease,
          );
        setBusyAction(
          "",
        );
      }
    };

  const remove =
    async (): Promise<void> => {
      if (
        mutationBlocked ||
        !runSheet
      ) {
        return;
      }

      const lease =
        mutationGateRef.current
          .acquire();

      if (!lease) {
        return;
      }

      setBusyAction(
        "delete",
      );
      setIssue(
        null,
      );

      try {
        if (
          connectivityStatus ===
            "offline"
        ) {
          throw Object.assign(
            new Error(
              "Reconnect before deleting this Event Run Sheet.",
            ),
            {
              kind:
                "offline",
            },
          );
        }

        const account =
          await captureEventRunSheetAccount(
            {
              userId:
                props.expectedUserId,
              accountEpoch:
                props.expectedAccountEpoch,
            },
          );

        await deleteEventRunSheet(
          runSheet.id,
          runSheet.version,
          {
            account,
          },
        );

        if (
          mutationGateRef.current
            .canCommit(
              lease,
            ) &&
          user?.id ===
            account.userId &&
          props.expectedUserId ===
            account.userId &&
          accountEpoch ===
            account.accountEpoch &&
          props.expectedAccountEpoch ===
            account.accountEpoch
        ) {
          router.replace(
            "/event-run-sheets" as never,
          );
        }
      } catch (error) {
        if (
          mutationGateRef.current
            .canCommit(
              lease,
            )
        ) {
          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "plan",
            ),
          );
        }
      } finally {
        mutationGateRef.current
          .release(
            lease,
          );
        setBusyAction(
          "",
        );
      }
    };

  const confirmDelete =
    (): void => {
      if (!runSheet) {
        return;
      }

      Alert.alert(
        "Delete planned Run Sheet?",
        `"${runSheet.title}" will be deleted. Its source collection and Scenes stay unchanged.`,
        [
          {
            text:
              "Cancel",
            style:
              "cancel",
          },
          {
            text:
              "Delete plan",
            style:
              "destructive",
            onPress: () =>
              void remove(),
          },
        ],
      );
    };

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

      const current =
        pickerDate(
          localDateTime,
        );

      if (
        pickerMode ===
          "date"
      ) {
        current.setFullYear(
          value.getFullYear(),
          value.getMonth(),
          value.getDate(),
        );
      } else {
        current.setHours(
          value.getHours(),
          value.getMinutes(),
          0,
          0,
        );
      }

      setLocalDateTime(
        localDateTimeValue(
          current,
        ),
      );

      if (
        Platform.OS !==
          "ios"
      ) {
        setPickerMode(
          "",
        );
      }
    };

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
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={
            goBack
          }
          style={
            styles.headerButton
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
          accessibilityRole="header"
          ref={screenHeadingRef}
          style={
            styles.headerTitle
          }
        >
          {runSheet
            ? "Edit Event Run Sheet"
            : "New Event Run Sheet"}
        </Text>

        <View
          style={
            styles.headerButton
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
            styles.privateNotice
          }
        >
          <Text
            style={
              styles.privateEyebrow
            }
          >
            PLANNED · PRIVATE
          </Text>

          <Text
            style={
              styles.privateText
            }
          >
            Editable until Start. Starting atomically freezes the current ordered Scene IDs, database revisions, and bounded display details.
          </Text>
        </View>

        {issue ? (
          <>
            <Text
              accessibilityRole="header"
              ref={recoveryHeadingRef}
              style={
                styles.screenReaderOnly
              }
            >
              {issue.title}
            </Text>

            <RecoveryNotice
              busy={
                isLoading ||
                Boolean(
                  busyAction,
                )
              }
              issue={
                issue
              }
              onAction={
                retry
              }
            />
          </>
        ) : null}

        {isLoading &&
        collections.length ===
          0 ? (
          <View
            accessibilityLabel="Loading Event Run Sheet planner"
            accessibilityRole="progressbar"
            style={
              styles.loading
            }
          >
            <ActivityIndicator
              color="#F47A24"
            />
            <Text
              style={
                styles.helper
              }
            >
              Loading your collections…
            </Text>
          </View>
        ) : null}

        {!isLoading &&
        hasFreshSnapshot &&
        collections.length ===
          0 ? (
          <View
            style={
              styles.empty
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              Create a Scene collection first
            </Text>

            <Text
              style={
                styles.helper
              }
            >
              A private Run Sheet starts from one of your owned collections.
            </Text>

            <Pressable
              accessibilityLabel="Create Scene collection"
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  "/collections/new",
                )
              }
              style={
                styles.primaryButton
              }
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Create collection
              </Text>
            </Pressable>
          </View>
        ) : null}

        {collections.length >
        0 ? (
          <>
            <View
              style={
                styles.section
              }
            >
              <Text
                accessibilityRole="header"
                style={
                  styles.sectionTitle
                }
              >
                Source collection
              </Text>

              <Text
                style={
                  styles.helper
                }
              >
                You can change this choice while the sheet is planned.
              </Text>

              <View
                accessibilityLabel="Source Scene collection"
                accessibilityRole="radiogroup"
                style={
                  styles.collectionList
                }
              >
                {collections.map(
                  (
                    collection,
                  ) => {
                    const selected =
                      selectedCollectionId ===
                      collection.id;

                    return (
                      <Pressable
                        accessibilityLabel={`${collection.title}, ${collection.sceneCount} ${collection.sceneCount === 1 ? "Scene" : "Scenes"}`}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked:
                            selected,
                          disabled:
                            mutationBlocked,
                        }}
                        disabled={
                          mutationBlocked
                        }
                        key={
                          collection.id
                        }
                        onPress={() => {
                          setSelectedCollectionId(
                            collection.id,
                          );

                          if (
                            !runSheet &&
                            !title.trim()
                          ) {
                            setTitle(
                              `${collection.title} run sheet`,
                            );
                          }
                        }}
                        style={[
                          styles.collectionOption,
                          selected &&
                            styles.collectionOptionSelected,
                        ]}
                      >
                        <View
                          style={
                            styles.radio
                          }
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
                              ? "Public collection"
                              : "Draft collection"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            <View
              style={
                styles.section
              }
            >
              <Text
                accessibilityRole="header"
                style={
                  styles.sectionTitle
                }
              >
                Event details
              </Text>

              <TextInput
                accessibilityLabel="Event Run Sheet title"
                editable={
                  !mutationBlocked
                }
                maxLength={
                  MAX_TITLE_LENGTH
                }
                onChangeText={
                  setTitle
                }
                placeholder="Event title"
                placeholderTextColor={canalDynamicColors.muted}
                style={
                  styles.input
                }
                value={
                  title
                }
              />

              <TextInput
                accessibilityLabel="Venue or room label"
                editable={
                  !mutationBlocked
                }
                maxLength={
                  MAX_VENUE_LENGTH
                }
                onChangeText={
                  setVenueLabel
                }
                placeholder="Venue or room"
                placeholderTextColor={canalDynamicColors.muted}
                style={
                  styles.input
                }
                value={
                  venueLabel
                }
              />
            </View>

            <View
              style={
                styles.section
              }
            >
              <Text
                accessibilityRole="header"
                style={
                  styles.sectionTitle
                }
              >
                Scheduled start
              </Text>

              {Platform.OS ===
              "web" ? (
                <TextInput
                  accessibilityLabel="Scheduled local date and time"
                  editable={
                    !mutationBlocked
                  }
                  onChangeText={
                    setLocalDateTime
                  }
                  placeholder="YYYY-MM-DDTHH:mm"
                  placeholderTextColor={canalDynamicColors.muted}
                  style={
                    styles.input
                  }
                  value={
                    localDateTime
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
                    accessibilityState={{
                      disabled:
                        mutationBlocked,
                    }}
                    disabled={
                      mutationBlocked
                    }
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
                      {pickerDate(
                        localDateTime,
                      ).toLocaleDateString()}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityLabel="Choose event time"
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled:
                        mutationBlocked,
                    }}
                    disabled={
                      mutationBlocked
                    }
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
                      {pickerDate(
                        localDateTime,
                      ).toLocaleTimeString(
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
                    pickerDate(
                      localDateTime,
                    )
                  }
                />
              ) : null}

              <TextInput
                accessibilityHint="Use an IANA zone such as America/New_York"
                accessibilityLabel="Event time zone"
                autoCapitalize="none"
                editable={
                  !mutationBlocked
                }
                maxLength={
                  64
                }
                onChangeText={
                  setTimeZone
                }
                placeholder="America/New_York"
                placeholderTextColor={canalDynamicColors.muted}
                style={
                  styles.input
                }
                value={
                  timeZone
                }
              />

              <Text
                style={
                  styles.policy
                }
              >
                Canal stores one absolute instant and renders it in this zone. Daylight-saving gaps are rejected; overlaps use the first occurrence and are disclosed after save.
              </Text>

              {overlapNotice ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={
                    styles.overlap
                  }
                >
                  {
                    overlapNotice
                  }
                </Text>
              ) : null}
            </View>

            {selectedCollection &&
            (
              selectedCollection.sceneCount <
                1 ||
              selectedCollection.sceneCount >
                50
            ) ? (
              <View
                accessibilityRole="alert"
                style={
                  styles.warning
                }
              >
                <Text
                  style={
                    styles.warningText
                  }
                >
                  Start requires 1–50 uniquely ordered Scenes. Update this collection before starting.
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityLabel={
                busyAction ===
                  "start"
                  ? "Start frozen Event Run Sheet, in progress"
                  : "Start frozen Event Run Sheet"
              }
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  busyAction ===
                  "start",
                disabled:
                  mutationBlocked ||
                  !canStart,
              }}
              disabled={
                mutationBlocked ||
                !canStart
              }
              onPress={() =>
                void runSave(
                  true,
                )
              }
              style={[
                styles.primaryButton,
                (
                  mutationBlocked ||
                  !canStart
                ) &&
                  styles.disabled,
              ]}
            >
              {busyAction ===
              "start" ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Start and freeze Scenes
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityLabel={
                busyAction ===
                  "save"
                  ? "Save Event Run Sheet plan, in progress"
                  : "Save Event Run Sheet plan"
              }
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  busyAction ===
                  "save",
                disabled:
                  mutationBlocked ||
                  !fieldsAreValid,
              }}
              disabled={
                mutationBlocked ||
                !fieldsAreValid
              }
              onPress={() =>
                void runSave(
                  false,
                )
              }
              style={[
                styles.secondaryButton,
                (
                  mutationBlocked ||
                  !fieldsAreValid
                ) &&
                  styles.disabled,
              ]}
            >
              {busyAction ===
              "save" ? (
                <ActivityIndicator
                  color="#D35F14"
                />
              ) : (
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Save plan
                </Text>
              )}
            </Pressable>

            {runSheet ? (
              <Pressable
                accessibilityLabel={`Delete planned Event Run Sheet ${runSheet.title}`}
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    mutationBlocked,
                }}
                disabled={
                  mutationBlocked
                }
                onPress={
                  confirmDelete
                }
                style={[
                  styles.deleteButton,
                  mutationBlocked &&
                    styles.disabled,
                ]}
              >
                <Text
                  style={
                    styles.deleteButtonText
                  }
                >
                  Delete plan
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex:
        1,
      backgroundColor: canalDynamicColors.surface,
    },
    header: {
      minHeight:
        58,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal:
        12,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E9DED5",
      backgroundColor:
        "#FFFDFB",
    },
    headerButton: {
      width:
        48,
      height:
        48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius:
        24,
    },
    backText: {
      color:
        "#D35F14",
      fontSize:
        36,
      lineHeight:
        40,
    },
    headerTitle: {
      color:
        "#241D18",
      fontSize:
        17,
      fontWeight:
        "900",
    },
    screenReaderOnly: {
      height:
        1,
      left:
        -1,
      opacity:
        0.01,
      overflow:
        "hidden",
      position:
        "absolute",
      top:
        -1,
      width:
        1,
    },
    content: {
      padding:
        20,
      paddingBottom:
        52,
      gap:
        14,
    },
    privateNotice: {
      padding:
        18,
      gap:
        8,
      borderRadius:
        22,
      backgroundColor:
        "#2B1D14",
    },
    privateEyebrow: {
      color:
        "#FFAD73",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.2,
    },
    privateText: {
      color:
        "#F8EDE5",
      fontSize:
        14,
      lineHeight:
        21,
    },
    loading: {
      minHeight:
        180,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        12,
    },
    empty: {
      alignItems:
        "center",
      padding:
        28,
      gap:
        12,
      borderWidth:
        1,
      borderColor:
        "#E9DED5",
      borderRadius:
        24,
      backgroundColor: canalDynamicColors.surface,
    },
    emptyTitle: {
      color:
        "#241D18",
      fontSize:
        20,
      fontWeight:
        "900",
      textAlign:
        "center",
    },
    section: {
      padding:
        18,
      gap:
        12,
      borderWidth:
        1,
      borderColor:
        "#E9DED5",
      borderRadius:
        24,
      backgroundColor: canalDynamicColors.surface,
    },
    sectionTitle: {
      color:
        "#241D18",
      fontSize:
        19,
      fontWeight:
        "900",
    },
    helper: {
      color:
        "#746B64",
      fontSize:
        14,
      lineHeight:
        20,
      textAlign:
        "center",
    },
    collectionList: {
      gap:
        8,
    },
    collectionOption: {
      minHeight:
        64,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      paddingHorizontal:
        14,
      paddingVertical:
        8,
      borderWidth:
        1,
      borderColor:
        "#E8DED5",
      borderRadius:
        18,
      backgroundColor:
        "#FFFDFB",
    },
    collectionOptionSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF4EB",
    },
    radio: {
      width:
        24,
      height:
        24,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth:
        2,
      borderColor:
        "#D35F14",
      borderRadius:
        12,
    },
    radioDot: {
      width:
        12,
      height:
        12,
      borderRadius:
        6,
      backgroundColor:
        "#D35F14",
    },
    collectionCopy: {
      flex:
        1,
      gap:
        3,
    },
    collectionTitle: {
      color:
        "#241D18",
      fontSize:
        15,
      fontWeight:
        "800",
    },
    collectionMeta: {
      color:
        "#81766E",
      fontSize:
        12,
    },
    input: {
      minHeight:
        52,
      paddingHorizontal:
        15,
      paddingVertical:
        12,
      borderWidth:
        1,
      borderColor:
        "#DDD0C6",
      borderRadius:
        16,
      color:
        "#241D18",
      backgroundColor:
        "#FFFDFB",
      fontSize:
        16,
    },
    dateActions: {
      flexDirection:
        "row",
      gap:
        10,
    },
    dateButton: {
      minHeight:
        52,
      flex:
        1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        12,
      borderWidth:
        1,
      borderColor:
        "#DDD0C6",
      borderRadius:
        16,
      backgroundColor:
        "#FFFDFB",
    },
    dateButtonText: {
      color:
        "#3F352E",
      fontSize:
        15,
      fontWeight:
        "800",
    },
    policy: {
      color:
        "#81766E",
      fontSize:
        12,
      lineHeight:
        18,
    },
    overlap: {
      color:
        "#7B4A22",
      fontSize:
        13,
      lineHeight:
        19,
      fontWeight:
        "700",
    },
    warning: {
      padding:
        16,
      borderWidth:
        1,
      borderColor:
        "#E5B47D",
      borderRadius:
        18,
      backgroundColor:
        "#FFF4E8",
    },
    warningText: {
      color:
        "#754118",
      fontSize:
        13,
      lineHeight:
        19,
      fontWeight:
        "700",
    },
    primaryButton: {
      minHeight:
        54,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        20,
      borderRadius:
        27,
      backgroundColor:
        "#F47A24",
    },
    primaryButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        16,
      fontWeight:
        "900",
    },
    secondaryButton: {
      minHeight:
        52,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        20,
      borderWidth:
        1,
      borderColor:
        "#E1A06F",
      borderRadius:
        26,
      backgroundColor: canalDynamicColors.surface,
    },
    secondaryButtonText: {
      color:
        "#D35F14",
      fontSize:
        15,
      fontWeight:
        "900",
    },
    deleteButton: {
      minHeight:
        50,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius:
        25,
    },
    deleteButtonText: {
      color:
        "#B52A2A",
      fontSize:
        14,
      fontWeight:
        "800",
    },
    disabled: {
      opacity:
        0.45,
    },
  });
