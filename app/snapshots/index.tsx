import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
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

import { CanalAlert } from "../../lib/canal-alert";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../providers/auth-provider";

import {
  shareSnapshot,
} from "../../lib/canal-share";
import {
  deleteSnapshotWithStatus,
  readSnapshotsWithStatus,
  Snapshot,
  SnapshotVisibility,
} from "../../lib/snapshots";

type SnapshotFilter =
  | "all"
  | SnapshotVisibility;

const FILTERS: {
  key: SnapshotFilter;
  label: string;
}[] = [
  {
    key: "all",
    label: "All",
  },
  {
    key: "public",
    label: "Public",
  },
  {
    key: "private",
    label: "Private",
  },
];

export default function SnapshotsScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();

  return (
    <SnapshotsContent
      key={user?.id ? `${user.id}:${accountEpoch}:${sessionGeneration ?? "session-pending"}` : "signed-out"}
    />
  );
}

function SnapshotsContent() {
  const [
    snapshots,
    setSnapshots,
  ] = useState<Snapshot[]>([]);

  const [query, setQuery] =
    useState("");

  const [
    activeFilter,
    setActiveFilter,
  ] =
    useState<SnapshotFilter>(
      "all",
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    deletingSnapshotId,
    setDeletingSnapshotId,
  ] = useState("");

  const [
    cloudWarning,
    setCloudWarning,
  ] = useState("");

  const loadSnapshots =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const result =
          await readSnapshotsWithStatus();

        setSnapshots(
          result.value,
        );

        setCloudWarning(
          result.warning ?? "",
        );
      } catch (error) {
        console.error(
          "Unable to load Snapshots:",
          error,
        );

        CanalAlert.alert(
          "Unable to load",
          "Canal could not load your Snapshots.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSnapshots();
    }, [loadSnapshots]),
  );

  const visibleSnapshots =
    useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      return snapshots
        .filter((snapshot) =>
          activeFilter === "all"
            ? true
            : snapshot.visibility ===
              activeFilter,
        )
        .filter((snapshot) => {
          if (!normalizedQuery) {
            return true;
          }

          return [
            snapshot.sceneName,
            snapshot.trackTitle,
            snapshot.trackArtist,
            snapshot.note,
            snapshot.mood,
          ].some((value) =>
            value
              ?.toLowerCase()
              .includes(
                normalizedQuery,
              ),
          );
        });
    }, [
      activeFilter,
      query,
      snapshots,
    ]);

  async function handleShare(
    snapshot: Snapshot,
  ) {
    try {
      const result =
        await shareSnapshot(
          snapshot,
        );

      if (
        result.method ===
        "clipboard"
      ) {
        CanalAlert.alert(
          "Snapshot copied",
          "The Snapshot was copied to your clipboard.",
        );
      }
    } catch (error) {
      CanalAlert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share this Snapshot.",
      );
    }
  }

  function confirmDelete(
    snapshot: Snapshot,
  ) {
    CanalAlert.alert(
      "Delete this Snapshot?",
      `The moment from ${snapshot.sceneName} will be removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void handleDelete(
              snapshot.id,
            );
          },
        },
      ],
    );
  }

  async function handleDelete(
    snapshotId: string,
  ) {
    try {
      setDeletingSnapshotId(
        snapshotId,
      );

      const result =
        await deleteSnapshotWithStatus(
        snapshotId,
      );

      setSnapshots(
        (currentSnapshots) =>
          currentSnapshots.filter(
          (snapshot) =>
            snapshot.id !==
            snapshotId,
          ),
      );

      if (result.warning) {
        setCloudWarning(
          result.warning,
        );

        CanalAlert.alert(
          "Deleted on this device",
          result.warning,
        );
      } else {
        setCloudWarning("");
      }
    } catch (error) {
      console.error(
        "Unable to delete Snapshot:",
        error,
      );

      CanalAlert.alert(
        "Unable to delete",
        "Canal could not delete this Snapshot.",
      );
    } finally {
      setDeletingSnapshotId("");
    }
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={
          styles.page
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back from Snapshots"
            accessibilityRole="button"
            onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.backText}
            >
              ‹ You
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Snapshots
          </Text>

          <Pressable
            accessibilityLabel="Open Soundscape"
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/soundscape",
              )
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.headerAction
              }
            >
              Soundscape
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.eyebrow}>
            MOMENTS
          </Text>

          <Text style={styles.heading}>
            Your Snapshots.
          </Text>

          <Text
            style={styles.description}
          >
            Saved tracks, moods, notes,
            and Scene moments.
          </Text>
        </View>

        {cloudWarning ? (
          <View
            accessibilityRole="alert"
            style={styles.syncWarning}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={19}
              color={canalDynamicColors.gold}
            />

            <View
              style={styles.syncWarningCopy}
            >
              <Text
                style={styles.syncWarningTitle}
              >
                Cloud sync needs attention
              </Text>

              <Text
                style={styles.syncWarningText}
              >
                {cloudWarning}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={styles.searchBox}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={canalDynamicColors.muted}
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Snapshots"
            placeholderTextColor={canalDynamicColors.muted}
            style={styles.searchInput}
          />

          {query ? (
            <Pressable
              accessibilityLabel="Clear Snapshot search"
              accessibilityRole="button"
              onPress={() =>
                setQuery("")
              }
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={canalDynamicColors.muted}
              />
            </Pressable>
          ) : null}
        </View>

        <View
          style={styles.filterRow}
        >
          {FILTERS.map(
            (filter) => {
              const selected =
                activeFilter ===
                filter.key;

              const count =
                filter.key === "all"
                  ? snapshots.length
                  : snapshots.filter(
                      (snapshot) =>
                        snapshot.visibility ===
                        filter.key,
                    ).length;

              return (
                <Pressable
                  key={filter.key}
                  accessibilityLabel={`${filter.label} Snapshots`}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                  }}
                  onPress={() =>
                    setActiveFilter(
                      filter.key,
                    )
                  }
                  style={({ pressed }) => [
                    styles.filterButton,
                    selected &&
                      styles.selectedFilter,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      selected &&
                        styles.selectedFilterText,
                    ]}
                  >
                    {filter.label}
                  </Text>

                  <Text
                    style={[
                      styles.filterCount,
                      selected &&
                        styles.selectedFilterText,
                    ]}
                  >
                    {count}
                  </Text>
                </Pressable>
              );
            },
          )}
        </View>

        {isLoading ? (
          <View
            style={styles.centered}
          >
            <ActivityIndicator
              size="large"
              color="#ff7a1a"
            />
          </View>
        ) : visibleSnapshots.length ===
          0 ? (
          <View
            style={styles.emptyCard}
          >
            <Ionicons
              name="camera-outline"
              size={32}
              color={canalDynamicColors.gold}
            />

            <Text
              style={styles.emptyTitle}
            >
              No Snapshots found
            </Text>

            <Text
              style={styles.emptyText}
            >
              Open a Scene or Stage and
              capture a music moment.
            </Text>
          </View>
        ) : (
          <View
            style={styles.snapshotList}
          >
            {visibleSnapshots.map(
              (snapshot) => (
                <View
                  key={snapshot.id}
                  style={
                    styles.snapshotCard
                  }
                >
                  <Pressable
                    accessibilityLabel={`Open ${snapshot.sceneName} Snapshot`}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname:
                          "/snapshots/[snapshotId]",

                        params: {
                          snapshotId:
                            snapshot.id,
                        },
                      })
                    }
                    style={({ pressed }) => [
                      styles.snapshotMain,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={
                        styles.snapshotIcon
                      }
                    >
                      <Ionicons
                        name="camera-outline"
                        size={24}
                        color={canalDynamicColors.gold}
                      />
                    </View>

                    <View
                      style={
                        styles.snapshotCopy
                      }
                    >
                      <View
                        style={
                          styles.snapshotTitleRow
                        }
                      >
                        <Text
                          numberOfLines={1}
                          style={
                            styles.snapshotTitle
                          }
                        >
                          {
                            snapshot.sceneName
                          }
                        </Text>

                        <Ionicons
                          name={
                            snapshot.pendingCloudSync
                              ? "cloud-offline-outline"
                              : snapshot.visibility ===
                            "public"
                              ? "globe-outline"
                              : "lock-closed-outline"
                          }
                          size={13}
                          color={
                            snapshot.pendingCloudSync
                              ? "#ffb27a"
                              : snapshot.visibility ===
                            "public"
                              ? "#9ff3b5"
                              : "#8f9891"
                          }
                        />
                      </View>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.trackText
                        }
                      >
                        {snapshot.trackTitle
                          ? `${snapshot.trackTitle}${
                              snapshot.trackArtist
                                ? ` · ${snapshot.trackArtist}`
                                : ""
                            }`
                          : "Scene moment"}
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.moodText
                        }
                      >
                        {snapshot.mood ||
                          formatDate(
                            snapshot.createdAt,
                          )}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color={canalDynamicColors.muted}
                    />
                  </Pressable>

                  <View
                    style={
                      styles.actionRow
                    }
                  >
                    <Pressable
                      accessibilityLabel={`Share ${snapshot.sceneName} Snapshot`}
                      accessibilityRole="button"
                      onPress={() => {
                        void handleShare(
                          snapshot,
                        );
                      }}
                      style={({ pressed }) => [
                        styles.cardAction,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={17}
                        color={canalDynamicColors.gold}
                      />

                      <Text
                        style={
                          styles.cardActionText
                        }
                      >
                        Share
                      </Text>
                    </Pressable>

                    <View
                      style={
                        styles.actionDivider
                      }
                    />

                    <Pressable
                      accessibilityLabel={`Delete ${snapshot.sceneName} Snapshot`}
                      accessibilityRole="button"
                      accessibilityState={{
                        busy: deletingSnapshotId === snapshot.id,
                        disabled: deletingSnapshotId === snapshot.id,
                      }}
                      disabled={
                        deletingSnapshotId ===
                        snapshot.id
                      }
                      onPress={() =>
                        confirmDelete(
                          snapshot,
                        )
                      }
                      style={({ pressed }) => [
                        styles.cardAction,
                        deletingSnapshotId ===
                          snapshot.id &&
                          styles.disabled,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      {deletingSnapshotId ===
                      snapshot.id ? (
                        <ActivityIndicator
                          size="small"
                          color="#ff9187"
                        />
                      ) : (
                        <>
                          <Ionicons
                            name="trash-outline"
                            size={17}
                            color={canalDynamicColors.danger}
                          />

                          <Text
                            style={
                              styles.deleteText
                            }
                          >
                            Delete
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ),
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#161513",
  },

  page: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 42,
    gap: 21,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 91,
    minHeight: 48,
    justifyContent: "center",
  },

  backText: {
    color: canalDynamicColors.muted,
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 22,
    fontWeight: "400",
  },

  headerAction: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },

  eyebrow: {
    marginBottom: 8,
    color: canalDynamicColors.gold,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 30,
    fontWeight: "400",
  },

  description: {
    marginTop: 10,
    color: canalDynamicColors.muted,
    fontSize: 15,
    lineHeight: 22,
  },

  searchBox: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  syncWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: "#6d472c",
    borderRadius: 17,
    backgroundColor: "#241a13",
  },

  syncWarningCopy: {
    flex: 1,
  },

  syncWarningTitle: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  syncWarningText: {
    marginTop: 4,
    color: "#d5c1b2",
    fontSize: 11,
    lineHeight: 17,
  },

  searchInput: {
    flex: 1,
    color: canalDynamicColors.text,
    fontSize: 14,
  },

  filterRow: {
    flexDirection: "row",
    gap: 9,
  },

  filterButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 15,
    backgroundColor: canalDynamicColors.surface,
  },

  selectedFilter: {
    borderColor: "#ff7a1a",
    backgroundColor: "#211810",
  },

  filterText: {
    color: canalDynamicColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  filterCount: {
    color: "#8f9891",
    fontSize: 10,
    fontWeight: "800",
  },

  selectedFilterText: {
    color: canalDynamicColors.gold,
  },

  centered: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    alignItems: "center",
    gap: 10,
    padding: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 22,
  },

  emptyTitle: {
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  emptyText: {
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  snapshotList: {
    gap: 13,
  },

  snapshotCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 20,
    backgroundColor: canalDynamicColors.surface,
  },

  snapshotMain: {
    minHeight: 99,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },

  snapshotIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 19,
    backgroundColor: "#2b1d14",
  },

  snapshotCopy: {
    flex: 1,
    paddingRight: 8,
  },

  snapshotTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  snapshotTitle: {
    flex: 1,
    color: canalDynamicColors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  trackText: {
    marginTop: 6,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  moodText: {
    marginTop: 6,
    color: canalDynamicColors.muted,
    fontSize: 10,
  },

  actionRow: {
    minHeight: 48,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: canalDynamicColors.line,
  },

  cardAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  cardActionText: {
    color: canalDynamicColors.gold,
    fontSize: 11,
    fontWeight: "800",
  },

  deleteText: {
    color: canalDynamicColors.danger,
    fontSize: 11,
    fontWeight: "800",
  },

  actionDivider: {
    width: 1,
    backgroundColor: canalDynamicColors.surface,
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.99,
      },
    ],
  },
});
