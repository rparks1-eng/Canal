import {
  useCallback,
  useState,
} from "react";

import {
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
  readListeningHistory,
  readSharedSnapshots,
  toggleSnapshotLike,
} from "../../lib/canal-session";

import type {
  ListeningHistoryEntry,
  SharedSnapshot,
} from "../../lib/canal-session";

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

  return date.toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

export default function ActivityScreen() {
  const [
    history,
    setHistory,
  ] = useState<
    ListeningHistoryEntry[]
  >([]);

  const [
    feed,
    setFeed,
  ] = useState<
    SharedSnapshot[]
  >([]);

  const load =
    useCallback(() => {
      const run =
        async (): Promise<void> => {
          const [
            storedHistory,
            storedFeed,
          ] =
            await Promise.all([
              readListeningHistory(),
              readSharedSnapshots(),
            ]);

          setHistory(
            storedHistory,
          );

          setFeed(
            storedFeed,
          );
        };

      void run();
    }, []);

  useFocusEffect(load);

  const like =
    async (
      snapshotId: string,
    ): Promise<void> => {
      await toggleSnapshotLike(
        snapshotId,
      );

      setFeed(
        await readSharedSnapshots(),
      );
    };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text style={styles.title}>
          Activity
        </Text>

        <Text style={styles.subtitle}>
          Listening history and Scene
          Snapshots shared inside this
          local MVP.
        </Text>

        <View style={styles.localNotice}>
          <Text
            style={
              styles.localNoticeTitle
            }
          >
            Local social preview
          </Text>

          <Text
            style={
              styles.localNoticeText
            }
          >
            Posts and likes currently stay
            on this device. A real multi-user
            feed requires the cloud backend.
          </Text>
        </View>

        <Text
          style={
            styles.sectionTitle
          }
        >
          Scene feed
        </Text>

        {feed.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={
                styles.emptyTitle
              }
            >
              No Snapshots shared yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Finish a Scene, create a
              Snapshot, and publish it to
              see it here.
            </Text>
          </View>
        ) : (
          feed.map(
            (snapshot) => (
              <Pressable
                key={snapshot.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname:
                      "/scenes/[sceneId]",

                    params: {
                      sceneId:
                        snapshot.sceneId,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.post,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.postHeader
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
                      C
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={
                        styles.postUser
                      }
                    >
                      Canal Listener
                    </Text>

                    <Text
                      style={
                        styles.postDate
                      }
                    >
                      {formatDate(
                        snapshot.createdAt,
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.snapshotCard
                  }
                >
                  <Text
                    style={
                      styles.snapshotEyebrow
                    }
                  >
                    {snapshot.activity}
                  </Text>

                  <Text
                    style={
                      styles.snapshotName
                    }
                  >
                    {snapshot.sceneName}
                  </Text>

                  <Text
                    style={
                      styles.snapshotMood
                    }
                  >
                    {snapshot.mood}
                  </Text>

                  <Text
                    style={
                      styles.snapshotMeta
                    }
                  >
                    {
                      snapshot.trackCount
                    }{" "}
                    tracks •{" "}
                    {snapshot.artists ||
                      "Multiple artists"}
                  </Text>
                </View>

                {snapshot.caption ? (
                  <Text
                    style={
                      styles.caption
                    }
                  >
                    {snapshot.caption}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => {
                    event.stopPropagation();

                    void like(
                      snapshot.id,
                    );
                  }}
                  style={({ pressed }) => [
                    styles.likeButton,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.likeText,

                      snapshot.likedByMe &&
                        styles.likeTextActive,
                    ]}
                  >
                    {snapshot.likedByMe
                      ? "♥"
                      : "♡"}{" "}
                    {snapshot.likes}
                  </Text>
                </Pressable>
              </Pressable>
            ),
          )
        )}

        <Text
          style={[
            styles.sectionTitle,
            styles.historyTitle,
          ]}
        >
          Listening history
        </Text>

        {history.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={
                styles.emptyTitle
              }
            >
              No completed sessions
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Start a saved Scene and finish
              the session to build your
              history.
            </Text>
          </View>
        ) : (
          history.map(
            (entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname:
                      "/scenes/[sceneId]",

                    params: {
                      sceneId:
                        entry.sceneId,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.historyRow,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.historyIcon
                  }
                >
                  <Text
                    style={
                      styles.historyIconText
                    }
                  >
                    ◉
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={
                      styles.historyName
                    }
                  >
                    {entry.sceneName}
                  </Text>

                  <Text
                    style={
                      styles.historyMeta
                    }
                  >
                    {entry.tracksPlayed} tracks
                    •{" "}
                    {Math.max(
                      1,
                      Math.round(
                        entry.durationSeconds /
                          60,
                      ),
                    )}{" "}
                    min •{" "}
                    {formatDate(
                      entry.completedAt ??
                        entry.startedAt,
                    )}
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
          )
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
      paddingTop: 12,
      paddingBottom: 40,
    },

    title: {
      color: "#181818",
      fontSize: 30,
      fontWeight: "900",
    },

    subtitle: {
      color: "#746D67",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
      marginBottom: 16,
    },

    localNotice: {
      backgroundColor:
        "#FFF0E5",
      borderRadius: 17,
      padding: 14,
      marginBottom: 24,
    },

    localNoticeTitle: {
      color: "#A64B0C",
      fontSize: 13,
      fontWeight: "900",
    },

    localNoticeText: {
      color: "#7B5234",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 20,
      fontWeight: "900",
      marginBottom: 11,
    },

    historyTitle: {
      marginTop: 25,
    },

    empty: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 18,
    },

    emptyTitle: {
      color: "#1B1B1B",
      fontSize: 17,
      fontWeight: "900",
    },

    emptyText: {
      color: "#746D67",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },

    post: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 16,
      marginBottom: 13,
    },

    postHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },

    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginRight: 10,
    },

    avatarText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    postUser: {
      color: "#262321",
      fontSize: 14,
      fontWeight: "800",
    },

    postDate: {
      color: "#938B84",
      fontSize: 10,
      marginTop: 2,
    },

    snapshotCard: {
      backgroundColor:
        "#2B1710",
      borderRadius: 18,
      padding: 18,
    },

    snapshotEyebrow: {
      color: "#FFB781",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
      textTransform:
        "uppercase",
    },

    snapshotName: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 5,
    },

    snapshotMood: {
      color: "#E0C9BE",
      fontSize: 14,
      marginTop: 4,
    },

    snapshotMeta: {
      color: "#BFA99F",
      fontSize: 10,
      marginTop: 15,
    },

    caption: {
      color: "#4C4642",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 12,
    },

    likeButton: {
      alignSelf:
        "flex-start",
      paddingVertical: 8,
      paddingRight: 15,
      marginTop: 5,
    },

    likeText: {
      color: "#726A64",
      fontSize: 14,
      fontWeight: "800",
    },

    likeTextActive: {
      color: "#F47A24",
    },

    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 18,
      padding: 13,
      marginBottom: 10,
    },

    historyIcon: {
      width: 45,
      height: 45,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F3ECE7",
      marginRight: 12,
    },

    historyIconText: {
      color: "#F47A24",
      fontSize: 18,
    },

    historyName: {
      color: "#262321",
      fontSize: 14,
      fontWeight: "800",
    },

    historyMeta: {
      color: "#8A827B",
      fontSize: 10,
      marginTop: 4,
    },

    arrow: {
      color: "#AAA19A",
      fontSize: 25,
      marginLeft: 8,
    },

    pressed: {
      opacity: 0.7,
    },
  });
