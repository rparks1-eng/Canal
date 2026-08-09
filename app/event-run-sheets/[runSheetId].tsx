import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
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
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  formatEventRunSheetInstant,
} from "../../lib/event-run-sheet-datetime";

import {
  createEventRunSheetMutationLeaseGate,
  eventRunSheetMutationIsBlocked,
  eventRunSheetRequestCanCommit,
  eventRunSheetStatusCopy,
  shouldDiscardEventRunSheetSnapshot,
} from "../../lib/event-run-sheet-interface";

import {
  eventRunSheetRecoveryIssue,
} from "../../lib/event-run-sheet-recovery";

import {
  advanceEventRunSheet,
  captureEventRunSheetAccount,
  completeEventRunSheet,
  loadEventRunSheet,
} from "../../lib/event-run-sheets";

import type {
  EventRunSheetDetail,
} from "../../lib/event-run-sheets";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

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

export default function EventRunSheetDetailScreen() {
  const {
    user,
    accountEpoch,
  } =
    useAuth();

  const params =
    useLocalSearchParams<{
      runSheetId?:
        | string
        | string[];
    }>();

  const runSheetId =
    firstParam(
      params.runSheetId,
    );

  return (
    <EventRunSheetDetailContent
      key={
        `${user?.id ?? "signed-out"}:${accountEpoch}:${runSheetId}`
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

function EventRunSheetDetailContent(
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
      runSheetId?:
        | string
        | string[];
    }>();

  const runSheetId =
    firstParam(
      params.runSheetId,
    );

  const [
    detail,
    setDetail,
  ] =
    useState<
      EventRunSheetDetail | null
    >(
      null,
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
          if (!runSheetId) {
            throw Object.assign(
              new Error(
                "The Event Run Sheet ID is missing.",
              ),
              {
                kind:
                  "not-found",
              },
            );
          }

          if (
            connectivityStatus ===
              "offline"
          ) {
            throw Object.assign(
              new Error(
                "Event Run Sheet updates are offline.",
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

          const next =
            await loadEventRunSheet(
              runSheetId,
              {
                account,
              },
            );

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
                runSheetId,
              activeRunSheetId:
                runSheetId,
            })
          ) {
            return;
          }

          if (!next) {
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
            next.status ===
              "planned"
          ) {
            router.replace({
              pathname:
                "/event-run-sheets/new",
              params: {
                runSheetId:
                  next.id,
              },
            } as never);

            return;
          }

          setDetail(
            next,
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
            setDetail(
              null,
            );
          }

          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "run",
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
        accountEpoch,
        connectivityStatus,
        props.expectedAccountEpoch,
        props.expectedUserId,
        runSheetId,
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

  const isFinalItem =
    Boolean(
      detail &&
      detail.activePosition ===
        detail.items.length -
          1,
    );

  const mutate =
    async (): Promise<void> => {
      if (
        mutationBlocked ||
        !detail ||
        detail.status !==
          "running"
      ) {
        return;
      }

      const lease =
        mutationGateRef.current
          .acquire();

      if (!lease) {
        return;
      }

      const action =
        isFinalItem
          ? "complete"
          : "advance";

      setBusyAction(
        action,
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

        const next =
          isFinalItem
            ? await completeEventRunSheet(
                detail.id,
                detail.activePosition,
                detail.version,
                {
                  account,
                },
              )
            : await advanceEventRunSheet(
                detail.id,
                detail.activePosition,
                detail.version,
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

        setDetail({
          ...detail,
          ...next,
        });
        setHasFreshSnapshot(
          true,
        );

        AccessibilityInfo
          .announceForAccessibility(
            next.status ===
              "completed"
              ? "Event Run Sheet completed."
              : `Scene ${next.activePosition + 1} of ${detail.items.length} is now current.`,
          );
      } catch (error) {
        if (
          mutationGateRef.current
            .canCommit(
              lease,
            )
        ) {
          setHasFreshSnapshot(
            false,
          );
          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "run",
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

  const statusCopy =
    detail
      ? eventRunSheetStatusCopy(
          detail.status,
        )
      : null;

  const activeItem =
    detail?.items[
      detail.activePosition
    ] ??
    null;

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
          {detail?.status ===
          "completed"
            ? "Completed Run"
            : "Run Event"}
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
      >
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
        !detail ? (
          <View
            accessibilityLabel="Loading Event Run Sheet"
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
                styles.muted
              }
            >
              Loading the frozen run…
            </Text>
          </View>
        ) : null}

        {detail &&
        statusCopy ? (
          <>
            <View
              style={
                detail.status ===
                  "completed"
                  ? styles.completedHero
                  : styles.runningHero
              }
            >
              <Text
                style={
                  styles.heroEyebrow
                }
              >
                {
                  statusCopy.label
                }{" "}
                · PRIVATE
              </Text>

              <Text
                selectable
                style={
                  styles.heroTitle
                }
              >
                {
                  detail.title
                }
              </Text>

              <Text
                selectable
                style={
                  styles.heroMeta
                }
              >
                {formatEventRunSheetInstant(
                  detail.startsAt,
                  detail.timeZone,
                )}
              </Text>

              <Text
                selectable
                style={
                  styles.heroMeta
                }
              >
                {
                  detail.venueLabel
                }{" "}
                ·{" "}
                {
                  detail.sourceCollectionTitle
                }
              </Text>

              <Text
                style={
                  styles.heroDetail
                }
              >
                {
                  statusCopy.detail
                }
              </Text>
            </View>

            {!hasFreshSnapshot ? (
              <View
                accessibilityRole="alert"
                style={
                  styles.staleNotice
                }
              >
                <Text
                  style={
                    styles.staleText
                  }
                >
                  This is the last in-memory view. Lifecycle actions stay locked until Canal reloads the current version.
                </Text>
              </View>
            ) : null}

            {detail.status ===
              "running" &&
            activeItem ? (
              <View
                style={
                  styles.activeCard
                }
              >
                <Text
                  style={
                    styles.activeEyebrow
                  }
                >
                  CURRENT · SCENE{" "}
                  {
                    detail.activePosition +
                    1
                  }{" "}
                  OF{" "}
                  {
                    detail.items.length
                  }
                </Text>

                <Text
                  selectable
                  style={
                    styles.activeTitle
                  }
                >
                  {
                    activeItem.title
                  }
                </Text>

                <Text
                  style={
                    styles.activeMeta
                  }
                >
                  {
                    activeItem.activityLabel
                  }{" "}
                  ·{" "}
                  {
                    activeItem.durationLabel
                  }{" "}
                  ·{" "}
                  {
                    activeItem.trackCount
                  }{" "}
                  {activeItem.trackCount ===
                  1
                    ? "track"
                    : "tracks"}
                </Text>

                <Text
                  style={
                    styles.revision
                  }
                >
                  Frozen database revision{" "}
                  {
                    activeItem.sceneRevision
                  }
                </Text>
              </View>
            ) : null}

            {detail.status ===
            "completed" ? (
              <View
                accessibilityLabel={`Completed Event Run Sheet with ${detail.items.length} frozen Scenes`}
                style={
                  styles.summary
                }
              >
                <Text
                  accessibilityRole="header"
                  style={
                    styles.summaryTitle
                  }
                >
                  Run completed
                </Text>

                <Text
                  style={
                    styles.summaryText
                  }
                >
                  {detail.items.length} frozen{" "}
                  {detail.items.length ===
                  1
                    ? "Scene"
                    : "Scenes"}{" "}
                  · completed{" "}
                  {detail.completedAt
                    ? formatEventRunSheetInstant(
                        detail.completedAt,
                        detail.timeZone,
                      )
                    : "time unavailable"}
                </Text>

                <Text
                  style={
                    styles.summaryPrivacy
                  }
                >
                  This retained summary is visible only to this Canal account and cannot be edited or deleted.
                </Text>
              </View>
            ) : null}

            <View
              style={
                styles.orderSection
              }
            >
              <Text
                accessibilityRole="header"
                style={
                  styles.sectionTitle
                }
              >
                Frozen Scene order
              </Text>

              {detail.items.map(
                (item) => {
                  const current =
                    detail.status ===
                      "running" &&
                    item.position ===
                      detail.activePosition;

                  const covered =
                    detail.status ===
                      "completed" ||
                    item.position <
                      detail.activePosition;

                  return (
                    <View
                      accessibilityLabel={`Scene ${item.position + 1}, ${item.title}, frozen revision ${item.sceneRevision}${current ? ", current" : covered ? ", covered" : ""}`}
                      key={
                        item.sceneId
                      }
                      style={[
                        styles.item,
                        current &&
                          styles.itemCurrent,
                      ]}
                    >
                      <View
                        style={[
                          styles.itemPosition,
                          covered &&
                            styles.itemPositionCovered,
                        ]}
                      >
                        <Text
                          style={[
                            styles.itemPositionText,
                            covered &&
                              styles.itemPositionTextCovered,
                          ]}
                        >
                          {
                            item.position +
                            1
                          }
                        </Text>
                      </View>

                      <View
                        style={
                          styles.itemCopy
                        }
                      >
                        <Text
                          style={
                            styles.itemTitle
                          }
                        >
                          {
                            item.title
                          }
                        </Text>

                        <Text
                          style={
                            styles.itemMeta
                          }
                        >
                          {
                            item.activityLabel
                          }{" "}
                          · rev{" "}
                          {
                            item.sceneRevision
                          }
                        </Text>
                      </View>

                      {current ? (
                        <Text
                          style={
                            styles.currentLabel
                          }
                        >
                          NOW
                        </Text>
                      ) : covered ? (
                        <Text
                          style={
                            styles.coveredLabel
                          }
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  );
                },
              )}
            </View>

            {detail.status ===
            "running" ? (
              <Pressable
                accessibilityHint={
                  isFinalItem
                    ? "Completes and permanently retains this frozen Run Sheet"
                    : "Moves the current position to the next frozen Scene"
                }
                accessibilityLabel={
                  busyAction
                    ? `${isFinalItem ? "Complete Event Run Sheet" : "Advance to next Scene"}, in progress`
                    : isFinalItem
                      ? "Complete Event Run Sheet"
                      : "Advance to next Scene"
                }
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    Boolean(
                      busyAction,
                    ),
                  disabled:
                    mutationBlocked,
                }}
                disabled={
                  mutationBlocked
                }
                onPress={() =>
                  void mutate()
                }
                style={[
                  styles.primaryButton,
                  mutationBlocked &&
                    styles.disabled,
                ]}
              >
                {busyAction ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    {isFinalItem
                      ? "Complete run"
                      : "Next Scene"}
                  </Text>
                )}
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
    loading: {
      minHeight:
        220,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        12,
    },
    muted: {
      color:
        "#746B64",
      fontSize:
        14,
    },
    runningHero: {
      padding:
        20,
      gap:
        9,
      borderRadius:
        24,
      backgroundColor:
        "#2B1D14",
    },
    completedHero: {
      padding:
        20,
      gap:
        9,
      borderRadius:
        24,
      backgroundColor:
        "#243327",
    },
    heroEyebrow: {
      color:
        "#FFAD73",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.2,
    },
    heroTitle: {
      color:
        "#FFFFFF",
      fontSize:
        28,
      lineHeight:
        33,
      fontWeight:
        "900",
    },
    heroMeta: {
      color:
        "#F1DED1",
      fontSize:
        14,
      lineHeight:
        20,
      fontWeight:
        "700",
    },
    heroDetail: {
      color:
        "#CCB9AD",
      fontSize:
        13,
      lineHeight:
        19,
    },
    staleNotice: {
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
    staleText: {
      color:
        "#754118",
      fontSize:
        13,
      lineHeight:
        19,
      fontWeight:
        "700",
    },
    activeCard: {
      padding:
        20,
      gap:
        8,
      borderWidth:
        2,
      borderColor:
        "#F47A24",
      borderRadius:
        24,
      backgroundColor: canalDynamicColors.surface,
      boxShadow:
        "0 10px 28px rgba(120, 63, 22, 0.12)",
    },
    activeEyebrow: {
      color:
        "#D35F14",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.1,
    },
    activeTitle: {
      color:
        "#241D18",
      fontSize:
        25,
      lineHeight:
        30,
      fontWeight:
        "900",
    },
    activeMeta: {
      color:
        "#5F554E",
      fontSize:
        14,
      lineHeight:
        20,
    },
    revision: {
      color:
        "#8C7F76",
      fontSize:
        12,
      fontWeight:
        "700",
    },
    summary: {
      padding:
        20,
      gap:
        8,
      borderWidth:
        1,
      borderColor:
        "#C8DCCB",
      borderRadius:
        24,
      backgroundColor:
        "#F2FAF3",
    },
    summaryTitle: {
      color:
        "#254329",
      fontSize:
        21,
      fontWeight:
        "900",
    },
    summaryText: {
      color:
        "#436347",
      fontSize:
        14,
      lineHeight:
        20,
      fontWeight:
        "700",
    },
    summaryPrivacy: {
      color:
        "#647967",
      fontSize:
        13,
      lineHeight:
        19,
    },
    orderSection: {
      padding:
        18,
      gap:
        10,
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
    item: {
      minHeight:
        64,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      paddingHorizontal:
        10,
      paddingVertical:
        8,
      borderRadius:
        16,
    },
    itemCurrent: {
      backgroundColor:
        "#FFF2E7",
    },
    itemPosition: {
      width:
        36,
      height:
        36,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius:
        18,
      backgroundColor:
        "#F1E8E1",
    },
    itemPositionCovered: {
      backgroundColor:
        "#DDEBDD",
    },
    itemPositionText: {
      color:
        "#6F625A",
      fontSize:
        13,
      fontWeight:
        "900",
    },
    itemPositionTextCovered: {
      color:
        "#315F37",
    },
    itemCopy: {
      flex:
        1,
      gap:
        3,
    },
    itemTitle: {
      color:
        "#2B231E",
      fontSize:
        15,
      fontWeight:
        "800",
    },
    itemMeta: {
      color:
        "#81766E",
      fontSize:
        12,
    },
    currentLabel: {
      color:
        "#D35F14",
      fontSize:
        10,
      fontWeight:
        "900",
      letterSpacing:
        0.9,
    },
    coveredLabel: {
      color:
        "#3F7545",
      fontSize:
        18,
      fontWeight:
        "900",
    },
    primaryButton: {
      minHeight:
        56,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        22,
      borderRadius:
        28,
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
    disabled: {
      opacity:
        0.45,
    },
  });
