import {
  router,
} from "expo-router";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  CreatorRelease,
} from "../lib/creator-releases";

const STATUS_COPY: Record<
  CreatorRelease["status"],
  {
    label: string;
    detail: string;
  }
> = {
  draft: {
    label: "DRAFT",
    detail:
      "Review the collection before opening the ballot.",
  },
  open: {
    label: "VOTING OPEN",
    detail:
      "Eligible listeners can choose one favorite Scene.",
  },
  closed: {
    label: "CLOSED",
    detail:
      "Final totals and the winning Scene are available.",
  },
};

export function CreatorReleaseCard(
  props: {
    release: CreatorRelease;
    isOwner: boolean;
  },
) {
  const {
    release,
  } = props;

  const status =
    STATUS_COPY[
      release.status
    ];

  return (
    <Pressable
      accessibilityHint="Opens the release ballot details"
      accessibilityLabel={`Open ${release.title}, ${status.label.toLowerCase()}`}
      accessibilityRole="button"
      onPress={() => {
        router.push({
          pathname:
            "/releases/[releaseId]",
          params: {
            releaseId:
              release.id,
          },
        } as never);
      }}
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
          styles.topRow
        }
      >
        <View
          style={[
            styles.statusBadge,
            release.status ===
              "closed" &&
              styles.closedBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              release.status ===
                "closed" &&
                styles.closedStatusText,
            ]}
          >
            {status.label}
          </Text>
        </View>

        <Text
          style={
            styles.ownerLabel
          }
        >
          {props.isOwner
            ? "CREATED BY YOU"
            : "AVAILABLE TO YOU"}
        </Text>
      </View>

      <Text
        numberOfLines={2}
        selectable
        style={
          styles.title
        }
      >
        {release.title}
      </Text>

      {release.description ? (
        <Text
          numberOfLines={3}
          selectable
          style={
            styles.description
          }
        >
          {
            release.description
          }
        </Text>
      ) : null}

      <View
        style={
          styles.footer
        }
      >
        <Text
          style={
            styles.detail
          }
        >
          {status.detail}
        </Text>

        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={
            styles.arrow
          }
        >
          ›
        </Text>
      </View>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    card: {
      width: "100%",
      minHeight: 156,
      gap: 10,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 22,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFFFFF",
    },

    pressed: {
      opacity: 0.72,
      transform: [
        {
          scale: 0.995,
        },
      ],
    },

    topRow: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    statusBadge: {
      alignSelf:
        "flex-start",
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor:
        "#FFF0E5",
    },

    closedBadge: {
      backgroundColor:
        "#EAF5EE",
    },

    statusText: {
      color: "#B9500B",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    closedStatusText: {
      color: "#326646",
    },

    ownerLabel: {
      flexShrink: 1,
      color: "#8B8179",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
      textAlign: "right",
    },

    title: {
      color: "#1B1B1B",
      fontSize: 21,
      fontWeight: "900",
      lineHeight: 26,
    },

    description: {
      color: "#625A54",
      fontSize: 13,
      lineHeight: 19,
    },

    footer: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    detail: {
      flex: 1,
      color: "#81776F",
      fontSize: 11,
      lineHeight: 16,
    },

    arrow: {
      color: "#F47A24",
      fontSize: 28,
      lineHeight: 30,
    },
  });
