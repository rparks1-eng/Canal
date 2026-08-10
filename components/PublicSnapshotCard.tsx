import {
  router,
} from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  PublicSnapshotCreator,
} from "../lib/public-snapshots";

import type {
  Snapshot,
} from "../lib/snapshots";

import { SnapshotComposition } from "./snapshot-composition";
import { ProfileAvatar } from "./profile-avatar";
import { VerifiedAccountBadge } from "./verified-account-badge";

import type { SnapshotSocialSummary } from "../lib/snapshot-social";

import { canalDynamicColors } from "../theme/canal-dynamic-colors";

export type SnapshotCardItem =
  Snapshot & {
    creator?:
      PublicSnapshotCreator;
  };

export function PublicSnapshotCard(
  props: {
    snapshot:
      SnapshotCardItem;
    compact?: boolean;
    showCreator?: boolean;
    socialSummary?: SnapshotSocialSummary;
    likeBusy?: boolean;
    onToggleLike?: () => void;
    onOpenComments?: () => void;
  },
) {
  const {
    snapshot,
  } = props;

  return (
    <View
      style={[
        styles.card,

        props.compact
          ? styles.compactCard
          : styles.feedCard,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${snapshot.sceneName} Snapshot`}
        accessibilityHint="Shows the public Snapshot details"
        onPress={() =>
          router.push({
            pathname:
              "/snapshots/[snapshotId]",

            params: {
              snapshotId:
                snapshot.id,
            },
          } as never)
        }
        style={({
          pressed,
        }) => [
          styles.snapshotButton,

          pressed &&
            styles.pressed,
        ]}
      >
        <SnapshotComposition
          snapshot={snapshot}
          height={props.compact ? 108 : 360}
          compact={props.compact}
        />
      </Pressable>

      {!props.compact ? (
        <View style={styles.socialOverlay}>
          <Pressable
            accessibilityLabel={
              props.socialSummary?.likedByMe
                ? "Unlike Snapshot"
                : "Like Snapshot"
            }
            accessibilityRole="button"
            accessibilityState={{
              selected:
                props.socialSummary?.likedByMe === true,
              disabled:
                props.likeBusy || !props.onToggleLike,
            }}
            disabled={props.likeBusy || !props.onToggleLike}
            onPress={props.onToggleLike}
            style={({ pressed }) => [
              styles.socialButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={
                props.socialSummary?.likedByMe
                  ? "heart"
                  : "heart-outline"
              }
              size={20}
              color={
                props.socialSummary?.likedByMe
                  ? "#FF6F68"
                  : "#FFFFFF"
              }
            />
            <Text style={styles.socialCount}>
              {props.socialSummary?.likeCount ?? 0}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="View Snapshot comments"
            accessibilityRole="button"
            onPress={props.onOpenComments}
            style={({ pressed }) => [
              styles.socialButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="chatbubble-outline"
              size={19}
              color="#FFFFFF"
            />
            <Text style={styles.socialCount}>
              {props.socialSummary?.commentCount ?? 0}
            </Text>
          </Pressable>

        </View>
      ) : null}

      {props.showCreator &&
      snapshot.creator ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${snapshot.creator.displayName}'s profile`}
          onPress={() =>
            router.push({
              pathname:
                "/creator/[userId]",

              params: {
                userId:
                  snapshot.creator
                    ?.id,
              },
            } as never)
          }
          style={({
            pressed,
          }) => [
            styles.creatorOverlay,

            pressed &&
              styles.pressed,
          ]}
        >
          <ProfileAvatar
            avatarUrl={snapshot.creator.avatarUrl}
            displayName={snapshot.creator.displayName}
            size={34}
          />

          <View
            style={
              styles.creatorCopy
            }
          >
            <View
              style={
                styles.creatorNameRow
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
                {snapshot.creator
                  .displayName}
                {snapshot.isMine
                  ? " · You"
                  : ""}
              </Text>

              {snapshot.creator
                .isCanal ||
              snapshot.creator
                .isVerified ? (
                <VerifiedAccountBadge
                  size={14}
                />
              ) : null}
            </View>

            <Text
              numberOfLines={
                1
              }
              style={
                styles.creatorHandle
              }
            >
              {snapshot.creator
                .handle}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PublicSnapshotGrid(
  props: {
    snapshots:
      SnapshotCardItem[];
    showCreator?: boolean;
  },
) {
  return (
    <View
      style={
        styles.grid
      }
    >
      {props.snapshots.map(
        (snapshot) => (
          <PublicSnapshotCard
            compact
            key={
              snapshot.id
            }
            snapshot={
              snapshot
            }
            showCreator={
              props.showCreator
            }
          />
        ),
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    card: {
      borderRadius: 20,
      overflow:
        "hidden",
    },

    feedCard: {
      width: "100%",
    },

    compactCard: {
      width: "48%",
      minWidth: 145,
      flexGrow: 1,
    },

    snapshotButton: {
      padding: 0,
    },

    pressed: {
      opacity: 0.72,
    },

    socialOverlay: {
      position: "absolute",
      top: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    socialButton: {
      minWidth: 48,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: 24,
      backgroundColor: "rgba(8, 15, 22, 0.42)",
    },

    socialCount: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },

    artwork: {
      height: 86,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.warningSurface,
      marginBottom: 11,
      overflow:
        "hidden",
    },

    templateBrand: {
      position:
        "absolute",
      top: 10,
      left: 10,
      right: 10,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform:
        "uppercase",
    },

    moodBadge: {
      position:
        "absolute",
      left: 8,
      right: 8,
      bottom: 8,
      alignSelf:
        "center",
      borderRadius: 99,
      backgroundColor:
        "rgba(255, 255, 255, 0.92)",
      paddingHorizontal: 8,
      paddingVertical: 4,
    },

    moodText: {
      color: "#B65413",
      fontSize: 9,
      fontWeight: "900",
      textAlign: "center",
      textTransform:
        "uppercase",
      letterSpacing: 0.5,
    },

    creatorOverlay: {
      position: "absolute",
      left: 12,
      top: 12,
      minHeight: 52,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 8,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 26,
      backgroundColor: "rgba(8, 15, 22, 0.42)",
      maxWidth: "54%",
    },

    creatorCopy: {
      flex: 1,
    },

    creatorNameRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 6,
    },

    creatorName: {
      flexShrink: 1,
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
    },

    creatorBadge: {
      borderRadius: 6,
      backgroundColor: canalDynamicColors.warningSurface,
      color: canalDynamicColors.gold,
      fontSize: 7,
      fontWeight: "900",
      paddingHorizontal: 5,
      paddingVertical: 3,
    },

    creatorHandle: {
      color: "rgba(255,255,255,0.76)",
      fontSize: 9,
      marginTop: 1,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
  });
