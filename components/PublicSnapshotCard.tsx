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

  const trackLabel =
    snapshot.trackTitle
      ? [
          snapshot.trackTitle,
          snapshot.trackArtist,
        ]
          .filter(
            Boolean,
          )
          .join(
            " · ",
          )
      : "Scene moment";

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

        {props.compact ? <Text
          numberOfLines={
            1
          }
          style={
            styles.sceneName
          }
        >
          {snapshot.sceneName}
        </Text> : null}

        {props.compact ? <Text
          numberOfLines={
            2
          }
          style={
            styles.track
          }
        >
          {trackLabel}
        </Text> : null}

        {props.compact && snapshot.note ? (
          <Text
            numberOfLines={
              props.compact
                ? 2
                : 3
            }
            style={
              styles.note
            }
          >
            {snapshot.note}
          </Text>
        ) : props.compact ? (
          <Text
            style={
              styles.emptyNote
            }
          >
            No note added
          </Text>
        ) : null}

        {snapshot.templateBrandLabel ? (
          <Text
            numberOfLines={1}
            style={
              styles.templateProvenance
            }
          >
            Template ·{" "}
            {
              snapshot.templateBrandLabel
            }
          </Text>
        ) : null}
      </Pressable>

      {!props.compact ? (
        <View style={styles.socialRow}>
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
                  : canalDynamicColors.text
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
              color={canalDynamicColors.text}
            />
            <Text style={styles.socialCount}>
              {props.socialSummary?.commentCount ?? 0}
            </Text>
          </Pressable>

          {snapshot.note ? (
            <Text numberOfLines={2} style={styles.feedCaption}>
              {snapshot.note}
            </Text>
          ) : null}
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
            styles.creatorButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.creatorAvatar
            }
          >
            <Text
              style={
                styles.creatorAvatarText
              }
            >
              {snapshot.creator
                .displayName
                .charAt(
                  0,
                )
                .toUpperCase()}
            </Text>
          </View>

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
      borderWidth: 1,
      borderColor:
        "#EEE5DE",
      borderRadius: 20,
      backgroundColor: canalDynamicColors.surface,
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
      padding: 13,
    },

    pressed: {
      opacity: 0.72,
    },

    socialRow: {
      minHeight: 56,
      paddingHorizontal: 13,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },

    socialButton: {
      minWidth: 48,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    socialCount: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },

    feedCaption: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 17,
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

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    track: {
      minHeight: 30,
      color: "#746D67",
      fontSize: 11,
      lineHeight: 15,
      marginTop: 4,
    },

    note: {
      color: "#4F4944",
      fontSize: 12,
      lineHeight: 17,
      marginTop: 8,
    },

    emptyNote: {
      color: "#A09993",
      fontSize: 11,
      fontStyle:
        "italic",
      marginTop: 8,
    },

    templateProvenance: {
      color: canalDynamicColors.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.2,
      marginTop: 9,
      textTransform:
        "uppercase",
    },

    creatorButton: {
      minHeight: 52,
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F3ECE6",
      paddingHorizontal: 13,
      paddingVertical: 9,
    },

    creatorAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginRight: 8,
    },

    creatorAvatarText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
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
      color: canalDynamicColors.text,
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
      color: "#8B837C",
      fontSize: 9,
      marginTop: 1,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
  });
