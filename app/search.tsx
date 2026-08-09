import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../providers/auth-provider";

import {
  getCurrentLiveStageTrack,
  LiveStage,
  readLiveStages,
} from "../lib/live-stages";
import {
  PUBLIC_SCENES,
  PublicScene,
} from "../lib/public-scenes";
import {
  readBlockedUsers,
} from "../lib/relationships";
import {
  readScenes,
  StoredScene,
} from "../lib/scenes";
import {
  readSnapshots,
  Snapshot,
} from "../lib/snapshots";
import {
  DirectoryUser,
  getDirectoryUsers,
} from "../lib/user-directory";

type IoniconName =
  keyof typeof Ionicons.glyphMap;

export default function SearchScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();

  return (
    <SearchScreenContent
      key={`${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`}
    />
  );
}

function SearchScreenContent() {
  const params =
    useLocalSearchParams();

  const initialQuery =
    firstParam(params.query);

  const [query, setQuery] =
    useState(initialQuery);

  const [
    localScenes,
    setLocalScenes,
  ] = useState<StoredScene[]>(
    [],
  );

  const [
    snapshots,
    setSnapshots,
  ] = useState<Snapshot[]>([]);

  const [
    liveStages,
    setLiveStages,
  ] = useState<LiveStage[]>([]);

  const [
    blockedUsers,
    setBlockedUsers,
  ] = useState<string[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState("");

  const directoryUsers =
    useMemo(
      () => getDirectoryUsers(),
      [],
    );

  const loadSearchData =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const [
          scenes,
          storedSnapshots,
          stages,
          blocked,
        ] = await Promise.all([
          readScenes(),
          readSnapshots(),
          readLiveStages(),
          readBlockedUsers(),
        ]);

        setLocalScenes(scenes);

        setSnapshots(
          storedSnapshots,
        );

        setLiveStages(
          stages.filter(
            (stage) =>
              stage.status ===
              "live",
          ),
        );

        setBlockedUsers(
          blocked,
        );
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Canal could not load search results.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSearchData();
    }, [loadSearchData]),
  );

  const normalizedQuery =
    query.trim().toLowerCase();

  const matchingLocalScenes =
    useMemo(
      () =>
        filterLocalScenes(
          localScenes,
          normalizedQuery,
        ).slice(0, 6),
      [
        localScenes,
        normalizedQuery,
      ],
    );

  const matchingPublicScenes =
    useMemo(
      () =>
        filterPublicScenes(
          PUBLIC_SCENES,
          normalizedQuery,
        ).slice(0, 6),
      [normalizedQuery],
    );

  const matchingUsers =
    useMemo(
      () =>
        filterUsers(
          directoryUsers,
          blockedUsers,
          normalizedQuery,
        ).slice(0, 6),
      [
        blockedUsers,
        directoryUsers,
        normalizedQuery,
      ],
    );

  const matchingStages =
    useMemo(
      () =>
        filterStages(
          liveStages,
          normalizedQuery,
        ).slice(0, 6),
      [
        liveStages,
        normalizedQuery,
      ],
    );

  const matchingSnapshots =
    useMemo(
      () =>
        filterSnapshots(
          snapshots,
          normalizedQuery,
        ).slice(0, 6),
      [
        normalizedQuery,
        snapshots,
      ],
    );

  const resultCount =
    matchingLocalScenes.length +
    matchingPublicScenes.length +
    matchingUsers.length +
    matchingStages.length +
    matchingSnapshots.length;

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
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
            ‹ Back
          </Text>
        </Pressable>

        <Text
          style={styles.headerTitle}
        >
          Search
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <View style={styles.searchArea}>
        <View
          style={styles.searchBox}
        >
          <Ionicons
            name="search-outline"
            size={21}
            color={canalDynamicColors.muted}
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Canal"
            placeholderTextColor={canalDynamicColors.muted}
            autoFocus={
              !initialQuery
            }
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
          />

          {query ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() =>
                setQuery("")
              }
            >
              <Ionicons
                name="close-circle"
                size={21}
                color={canalDynamicColors.muted}
              />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={styles.resultSummary}
        >
          {normalizedQuery
            ? `${resultCount} results`
            : "Search Scenes, people, Stages, and Snapshots"}
        </Text>
      </View>

      {loadError ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.centered}>
          <Text selectable style={styles.errorText}>{loadError}</Text>
          <Pressable
            accessibilityLabel="Retry Search"
            accessibilityRole="button"
            onPress={() => { void loadSearchData(); }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View
          style={styles.centered}
        >
          <ActivityIndicator
            size="large"
            color="#ff7a1a"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.page
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {!normalizedQuery ? (
            <View
              style={styles.introCard}
            >
              <View
                style={styles.introIcon}
              >
                <Ionicons
                  name="search"
                  size={30}
                  color={canalDynamicColors.gold}
                />
              </View>

              <Text
                style={styles.introTitle}
              >
                Search all of Canal
              </Text>

              <Text
                style={styles.introText}
              >
                Find music experiences,
                creators, live
                collaboration spaces,
                and saved moments.
              </Text>
            </View>
          ) : resultCount === 0 ? (
            <View
              style={styles.emptyCard}
            >
              <Ionicons
                name="search-outline"
                size={31}
                color={canalDynamicColors.gold}
              />

              <Text
                style={styles.emptyTitle}
              >
                No results found
              </Text>

              <Text
                style={styles.emptyText}
              >
                Try another artist,
                Scene, username, mood,
                or activity.
              </Text>
            </View>
          ) : (
            <>
              <SearchSection
                title="Your Scenes"
                count={
                  matchingLocalScenes.length
                }
              >
                {matchingLocalScenes.map(
                  (scene) => (
                    <SearchResultRow
                      key={scene.id}
                      icon="musical-notes-outline"
                      title={scene.name}
                      subtitle={
                        [
                          scene.activity,
                          scene.duration,
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                        `${scene.tracks.length} tracks`
                      }
                      badge={
                        scene.visibility
                      }
                      onPress={() =>
                        router.push({
                          pathname:
                            "/scenes/[sceneId]",
                          params: {
                            sceneId:
                              scene.id,
                          },
                        })
                      }
                    />
                  ),
                )}
              </SearchSection>

              <SearchSection
                title="Public Scenes"
                count={
                  matchingPublicScenes.length
                }
              >
                {matchingPublicScenes.map(
                  (scene) => (
                    <SearchResultRow
                      key={scene.id}
                      icon="globe-outline"
                      title={scene.name}
                      subtitle={`@${scene.creatorUsername} · ${scene.activity}`}
                      badge="public"
                      onPress={() =>
                        router.push({
                          pathname:
                            "/scenes/[sceneId]",
                          params: {
                            sceneId:
                              scene.id,
                          },
                        })
                      }
                    />
                  ),
                )}
              </SearchSection>

              <SearchSection
                title="People"
                count={
                  matchingUsers.length
                }
              >
                {matchingUsers.map(
                  (user) => (
                    <SearchResultRow
                      key={
                        user.username
                      }
                      icon="person-circle-outline"
                      title={
                        user.displayName
                      }
                      subtitle={`@${user.username} · ${
                        user.genres
                          .slice(0, 2)
                          .join(" · ") ||
                        "Public Soundscape"
                      }`}
                      badge={
                        user.visibility
                      }
                      onPress={() =>
                        router.push({
                          pathname:
                            "/friend/[username]",
                          params: {
                            username:
                              user.username,
                          },
                        })
                      }
                    />
                  ),
                )}
              </SearchSection>

              <SearchSection
                title="Live Stages"
                count={
                  matchingStages.length
                }
              >
                {matchingStages.map(
                  (stage) => {
                    const currentTrack =
                      getCurrentLiveStageTrack(
                        stage,
                      );

                    return (
                      <SearchResultRow
                        key={stage.id}
                        icon="radio-outline"
                        title={stage.name}
                        subtitle={
                          currentTrack
                            ? `${currentTrack.title} · ${currentTrack.artist}`
                            : stage.activity
                        }
                        badge="live"
                        onPress={() =>
                          router.push({
                            pathname:
                              "/live-stage/[stageId]",
                            params: {
                              stageId:
                                stage.id,
                            },
                          })
                        }
                      />
                    );
                  },
                )}
              </SearchSection>

              <SearchSection
                title="Snapshots"
                count={
                  matchingSnapshots.length
                }
              >
                {matchingSnapshots.map(
                  (snapshot) => (
                    <SearchResultRow
                      key={
                        snapshot.id
                      }
                      icon="camera-outline"
                      title={
                        snapshot.sceneName
                      }
                      subtitle={
                        snapshot.trackTitle
                          ? `${snapshot.trackTitle}${
                              snapshot.trackArtist
                                ? ` · ${snapshot.trackArtist}`
                                : ""
                            }`
                          : "Scene moment"
                      }
                      badge={
                        snapshot.visibility
                      }
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
                    />
                  ),
                )}
              </SearchSection>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SearchSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children:
    React.ReactNode;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View
        style={styles.sectionHeader}
      >
        <Text
          style={styles.sectionTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.sectionCount}
        >
          {count}
        </Text>
      </View>

      <View
        style={styles.resultList}
      >
        {children}
      </View>
    </View>
  );
}

function SearchResultRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultRow,
        pressed &&
          styles.pressed,
      ]}
    >
      <View style={styles.resultIcon}>
        <Ionicons
          name={icon}
          size={22}
          color={canalDynamicColors.gold}
        />
      </View>

      <View
        style={
          styles.resultInformation
        }
      >
        <Text
          numberOfLines={1}
          style={styles.resultTitle}
        >
          {title}
        </Text>

        <Text
          numberOfLines={1}
          style={styles.resultSubtitle}
        >
          {subtitle}
        </Text>
      </View>

      {badge ? (
        <View
          style={[
            styles.resultBadge,
            badge === "live" &&
              styles.liveBadge,
            badge === "public" &&
              styles.publicBadge,
          ]}
        >
          <Text
            style={styles.badgeText}
          >
            {badge}
          </Text>
        </View>
      ) : null}

      <Ionicons
        name="chevron-forward"
        size={19}
        color={canalDynamicColors.muted}
      />
    </Pressable>
  );
}

function filterLocalScenes(
  scenes: StoredScene[],
  query: string,
): StoredScene[] {
  if (!query) {
    return [];
  }

  return scenes.filter(
    (scene) =>
      [
        scene.name,
        scene.activity,
        scene.emotions,
        scene.genres,
        scene.energy,
        scene.artists,
      ].some((value) =>
        value
          .toLowerCase()
          .includes(query),
      ),
  );
}

function filterPublicScenes(
  scenes: PublicScene[],
  query: string,
): PublicScene[] {
  if (!query) {
    return [];
  }

  return scenes.filter(
    (scene) =>
      [
        scene.name,
        scene.creatorName,
        scene.creatorUsername,
        scene.activity,
        scene.emotions,
        scene.genres,
        scene.artists,
      ].some((value) =>
        value
          .toLowerCase()
          .includes(query),
      ),
  );
}

function filterUsers(
  users: DirectoryUser[],
  blockedUsers: string[],
  query: string,
): DirectoryUser[] {
  if (!query) {
    return [];
  }

  return users
    .filter(
      (user) =>
        !blockedUsers.includes(
          user.username,
        ),
    )
    .filter(
      (user) =>
        [
          user.displayName,
          user.username,
          user.bio,
          ...user.genres,
          ...user.favoriteArtists,
        ].some((value) =>
          value
            .toLowerCase()
            .includes(query),
        ),
    );
}

function filterStages(
  stages: LiveStage[],
  query: string,
): LiveStage[] {
  if (!query) {
    return [];
  }

  return stages.filter(
    (stage) =>
      [
        stage.name,
        stage.hostName,
        stage.hostUsername,
        stage.activity,
      ].some((value) =>
        value
          .toLowerCase()
          .includes(query),
      ),
  );
}

function filterSnapshots(
  snapshots: Snapshot[],
  query: string,
): Snapshot[] {
  if (!query) {
    return [];
  }

  return snapshots.filter(
    (snapshot) =>
      [
        snapshot.sceneName,
        snapshot.trackTitle,
        snapshot.trackArtist,
        snapshot.note,
        snapshot.mood,
      ].some((value) =>
        value
          ?.toLowerCase()
          .includes(query),
      ),
  );
}

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },

  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },

  headerButton: {
    width: 80,
    minHeight: 48,
    justifyContent: "center",
  },

  headerSpacer: {
    width: 80,
  },

  backText: {
    color: canalDynamicColors.muted,
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 16,
    fontWeight: "700",
  },

  searchArea: {
    paddingHorizontal: 22,
    paddingBottom: 13,
  },

  searchBox: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 18,
    backgroundColor: canalDynamicColors.surface,
  },

  searchInput: {
    flex: 1,
    color: canalDynamicColors.text,
    fontSize: 15,
  },

  resultSummary: {
    marginTop: 8,
    color: "#777f79",
    fontSize: 11,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  errorText: {
    maxWidth: 320,
    color: "#8D211C",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  retryButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  retryButtonText: {
    color: canalDynamicColors.lavender,
    fontSize: 14,
    fontWeight: "800",
  },

  page: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 42,
    gap: 23,
  },

  introCard: {
    alignItems: "center",
    padding: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 22,
  },

  introIcon: {
    width: 67,
    height: 67,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#2b1d14",
  },

  introTitle: {
    marginTop: 13,
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  introText: {
    maxWidth: 330,
    marginTop: 8,
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
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
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    maxWidth: 320,
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  section: {
    gap: 11,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitle: {
    color: canalDynamicColors.text,
    fontSize: 19,
    fontWeight: "700",
  },

  sectionCount: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "800",
  },

  resultList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 20,
    backgroundColor: canalDynamicColors.surface,
  },

  resultRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#292f2b",
  },

  resultIcon: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderRadius: 15,
    backgroundColor: "#2b1d14",
  },

  resultInformation: {
    flex: 1,
    paddingRight: 8,
  },

  resultTitle: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  resultSubtitle: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  resultBadge: {
    marginRight: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: "#2d332f",
  },

  liveBadge: {
    backgroundColor: "#3b1c19",
  },

  publicBadge: {
    backgroundColor: "#1d5b32",
  },

  badgeText: {
    color: "#c5cbc6",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
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
