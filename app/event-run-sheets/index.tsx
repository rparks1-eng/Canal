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
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  formatEventRunSheetInstant,
} from "../../lib/event-run-sheet-datetime";

import {
  EVENT_RUN_SHEET_FILTERS,
  eventRunSheetRequestCanCommit,
  eventRunSheetStatusCopy,
  filterEventRunSheets,
  shouldDiscardEventRunSheetSnapshot,
} from "../../lib/event-run-sheet-interface";

import type {
  EventRunSheetFilter,
} from "../../lib/event-run-sheet-interface";

import {
  eventRunSheetRecoveryIssue,
} from "../../lib/event-run-sheet-recovery";

import {
  captureEventRunSheetAccount,
  listOwnEventRunSheets,
} from "../../lib/event-run-sheets";

import type {
  EventRunSheet,
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

function goBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/create" as never,
  );
}

export default function EventRunSheetHubScreen() {
  const {
    user,
  } =
    useAuth();

  return (
    <EventRunSheetHubContent
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

function EventRunSheetHubContent(
  props: {
    expectedUserId: string;
  },
) {
  const {
    user,
  } =
    useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    runSheets,
    setRunSheets,
  ] =
    useState<
      EventRunSheet[]
    >([]);

  const [
    filter,
    setFilter,
  ] =
    useState<EventRunSheetFilter>(
      "all",
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

  const load =
    useCallback(
      async (): Promise<void> => {
        const requestEpoch =
          requestEpochRef.current +
          1;

        requestEpochRef.current =
          requestEpoch;

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
                "Event Run Sheets are offline.",
              ),
              {
                kind:
                  "offline",
              },
            );
          }

          const account =
            await captureEventRunSheetAccount(
              props.expectedUserId,
            );

          const next =
            await listOwnEventRunSheets({
              account,
            });

          if (
            !eventRunSheetRequestCanCommit({
              expectedUserId:
                props.expectedUserId,
              activeUserId:
                user?.id ??
                null,
              accountUserId:
                account.userId,
              requestEpoch,
              activeRequestEpoch:
                requestEpochRef.current,
            })
          ) {
            return;
          }

          setRunSheets(
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
            setRunSheets(
              [],
            );
          }

          setIssue(
            eventRunSheetRecoveryIssue(
              error,
              connectivityStatus,
              "hub",
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
        connectivityStatus,
        props.expectedUserId,
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

  const visibleRunSheets =
    useMemo(
      () =>
        filterEventRunSheets(
          runSheets,
          filter,
        ),
      [
        filter,
        runSheets,
      ],
    );

  const openRunSheet =
    (
      runSheet:
        EventRunSheet,
    ): void => {
      if (
        isLoading ||
        !hasFreshSnapshot
      ) {
        return;
      }

      if (
        runSheet.status ===
          "planned"
      ) {
        router.push({
          pathname:
            "/event-run-sheets/new",
          params: {
            runSheetId:
              runSheet.id,
          },
        } as never);

        return;
      }

      router.push({
        pathname:
          "/event-run-sheets/[runSheetId]",
        params: {
          runSheetId:
            runSheet.id,
        },
      } as never);
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
              styles.headerButtonText
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
          Event Run Sheets
        </Text>

        <Pressable
          accessibilityLabel="Create Event Run Sheet"
          accessibilityRole="button"
          onPress={() =>
            router.push(
              "/event-run-sheets/new",
            )
          }
          style={
            styles.headerButton
          }
        >
          <Text
            style={
              styles.addText
            }
          >
            ＋
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        contentInsetAdjustmentBehavior="automatic"
      >
        <View
          style={
            styles.hero
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            PRIVATE CREATOR TOOL
          </Text>

          <Text
            selectable
            style={
              styles.title
            }
          >
            Plan once. Run from a frozen order.
          </Text>

          <Text
            selectable
            style={
              styles.intro
            }
          >
            Only your Canal account can see these plans. Starting a run freezes its Scene identities, revisions, and display details.
          </Text>
        </View>

        <View
          accessibilityLabel="Event Run Sheet status filter"
          accessibilityRole="radiogroup"
          style={
            styles.filters
          }
        >
          {EVENT_RUN_SHEET_FILTERS.map(
            (value) => {
              const selected =
                filter ===
                value;

              return (
                <Pressable
                  accessibilityLabel={`Show ${value} Event Run Sheets`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked:
                      selected,
                    disabled:
                      isLoading,
                  }}
                  disabled={
                    isLoading
                  }
                  key={
                    value
                  }
                  onPress={() =>
                    setFilter(
                      value,
                    )
                  }
                  style={[
                    styles.filter,
                    selected &&
                      styles.filterSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      selected &&
                        styles.filterTextSelected,
                    ]}
                  >
                    {value.toUpperCase()}
                  </Text>
                </Pressable>
              );
            },
          )}
        </View>

        {issue ? (
          <RecoveryNotice
            busy={
              isLoading
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
        runSheets.length ===
          0 ? (
          <View
            accessibilityLabel="Loading Event Run Sheets"
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
                styles.loadingText
              }
            >
              Loading your private plans…
            </Text>
          </View>
        ) : null}

        {!isLoading &&
        hasFreshSnapshot &&
        visibleRunSheets.length ===
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
              {runSheets.length ===
              0
                ? "No Event Run Sheets yet"
                : `No ${filter} Event Run Sheets`}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Choose an owned Scene collection to create a private plan.
            </Text>

            <Pressable
              accessibilityLabel="Create your first Event Run Sheet"
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  "/event-run-sheets/new",
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
                Create plan
              </Text>
            </Pressable>
          </View>
        ) : null}

        {visibleRunSheets.map(
          (runSheet) => {
            const status =
              eventRunSheetStatusCopy(
                runSheet.status,
              );

            return (
              <Pressable
                accessibilityHint={
                  runSheet.status ===
                    "planned"
                    ? "Opens the editable plan"
                    : runSheet.status ===
                        "running"
                      ? "Opens the current frozen run"
                      : "Opens the immutable completed summary"
                }
                accessibilityLabel={`${runSheet.title}, ${status.label}, ${formatEventRunSheetInstant(runSheet.startsAt, runSheet.timeZone)}`}
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    isLoading ||
                    !hasFreshSnapshot,
                }}
                disabled={
                  isLoading ||
                  !hasFreshSnapshot
                }
                key={
                  runSheet.id
                }
                onPress={() =>
                  openRunSheet(
                    runSheet,
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.card,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.cardTop
                  }
                >
                  <Text
                    style={
                      styles.status
                    }
                  >
                    {
                      status.label
                    }
                  </Text>

                  <Text
                    accessibilityElementsHidden
                    style={
                      styles.arrow
                    }
                  >
                    ›
                  </Text>
                </View>

                <Text
                  style={
                    styles.cardTitle
                  }
                >
                  {
                    runSheet.title
                  }
                </Text>

                <Text
                  style={
                    styles.cardSchedule
                  }
                >
                  {formatEventRunSheetInstant(
                    runSheet.startsAt,
                    runSheet.timeZone,
                  )}
                </Text>

                <Text
                  style={
                    styles.cardMeta
                  }
                >
                  {
                    runSheet.venueLabel
                  }{" "}
                  · {
                    status.title
                  }
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex:
        1,
      backgroundColor:
        "#FFF9F4",
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
    headerButtonText: {
      color:
        "#D35F14",
      fontSize:
        36,
      lineHeight:
        40,
    },
    addText: {
      color:
        "#D35F14",
      fontSize:
        26,
      fontWeight:
        "700",
    },
    headerTitle: {
      color:
        "#241D18",
      fontSize:
        17,
      fontWeight:
        "900",
    },
    content: {
      padding:
        20,
      paddingBottom:
        48,
      gap:
        14,
    },
    hero: {
      paddingVertical:
        12,
      gap:
        9,
    },
    eyebrow: {
      color:
        "#D35F14",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.3,
    },
    title: {
      maxWidth:
        360,
      color:
        "#211B17",
      fontSize:
        30,
      lineHeight:
        35,
      fontWeight:
        "900",
      letterSpacing:
        -0.7,
    },
    intro: {
      color:
        "#746B64",
      fontSize:
        15,
      lineHeight:
        22,
    },
    filters: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        8,
    },
    filter: {
      minHeight:
        48,
      minWidth:
        72,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        14,
      borderWidth:
        1,
      borderColor:
        "#E3D7CD",
      borderRadius:
        24,
      backgroundColor:
        "#FFFFFF",
    },
    filterSelected: {
      borderColor:
        "#241D18",
      backgroundColor:
        "#241D18",
    },
    filterText: {
      color:
        "#756B64",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        0.7,
    },
    filterTextSelected: {
      color:
        "#FFFFFF",
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
    loadingText: {
      color:
        "#746B64",
      fontSize:
        14,
    },
    empty: {
      alignItems:
        "center",
      padding:
        28,
      gap:
        10,
      borderWidth:
        1,
      borderColor:
        "#E9DED5",
      borderRadius:
        24,
      backgroundColor:
        "#FFFFFF",
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
    emptyText: {
      color:
        "#746B64",
      fontSize:
        14,
      lineHeight:
        20,
      textAlign:
        "center",
    },
    primaryButton: {
      minHeight:
        48,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop:
        6,
      paddingHorizontal:
        20,
      borderRadius:
        24,
      backgroundColor:
        "#F47A24",
    },
    primaryButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        15,
      fontWeight:
        "900",
    },
    card: {
      minHeight:
        168,
      padding:
        18,
      gap:
        8,
      borderWidth:
        1,
      borderColor:
        "#E9DED5",
      borderRadius:
        24,
      backgroundColor:
        "#FFFFFF",
      boxShadow:
        "0 8px 24px rgba(57, 35, 20, 0.06)",
    },
    cardTop: {
      minHeight:
        30,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },
    status: {
      color:
        "#D35F14",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.1,
    },
    arrow: {
      color:
        "#B6A9A0",
      fontSize:
        28,
    },
    cardTitle: {
      color:
        "#241D18",
      fontSize:
        21,
      lineHeight:
        25,
      fontWeight:
        "900",
    },
    cardSchedule: {
      color:
        "#4F4640",
      fontSize:
        14,
      lineHeight:
        20,
      fontWeight:
        "700",
    },
    cardMeta: {
      color:
        "#81766E",
      fontSize:
        13,
      lineHeight:
        19,
    },
    pressed: {
      opacity:
        0.7,
      transform: [
        {
          scale:
            0.99,
        },
      ],
    },
  });
