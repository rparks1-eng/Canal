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
    ownerDetail: string;
    availableDetail: string;
    privacy: string;
  }
> = {
  draft: {
    label: "DRAFT",
    ownerDetail:
      "Review the collection before opening the ballot.",
    availableDetail:
      "Voting has not opened yet.",
    privacy:
      "Scenes freeze when opened",
  },
  open: {
    label: "VOTING OPEN",
    ownerDetail:
      "Results stay sealed until you close voting.",
    availableDetail:
      "Choose or change one private favorite Scene.",
    privacy:
      "Individual votes stay private",
  },
  closed: {
    label: "CLOSED",
    ownerDetail:
      "Final totals and the winning Scene are available.",
    availableDetail:
      "View final totals and the winning Scene.",
    privacy:
      "Aggregate results only",
  },
};

function formatReleaseDate(
  value: string,
): string {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Recently updated";
  }

  return `Updated ${date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  )}`;
}

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

  const roleLabel =
    props.isOwner
      ? "OWNER"
      : "AVAILABLE TO YOU";

  const accessibleRole =
    props.isOwner
      ? "owner"
      : "available to you";

  return (
    <Pressable
      accessibilityHint={
        release.status ===
          "open" &&
        !props.isOwner
          ? "Opens the ballot where you can choose or change your favorite"
          : "Opens the release ballot details"
      }
      accessibilityLabel={`Open ${release.title}, ${accessibleRole}, ${status.label.toLowerCase()}. ${status.privacy}`}
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
              "open" &&
              styles.openBadge,
            release.status ===
              "closed" &&
              styles.closedBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              release.status ===
                "open" &&
                styles.openStatusText,
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
          {roleLabel}
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
          {props.isOwner
            ? status.ownerDetail
            : status.availableDetail}
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

      <View
        style={
          styles.metaRow
        }
      >
        <Text
          style={
            styles.privacy
          }
        >
          {status.privacy}
        </Text>

        <Text
          style={
            styles.date
          }
        >
          {formatReleaseDate(
            release.updatedAt,
          )}
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
      flexWrap: "wrap",
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

    openBadge: {
      backgroundColor:
        "#EAF1FF",
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

    openStatusText: {
      color: "#315F9A",
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

    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
      paddingTop: 2,
    },

    privacy: {
      color: "#A14B14",
      fontSize: 9,
      fontWeight: "800",
    },

    date: {
      color: "#91867E",
      fontSize: 9,
      fontVariant: [
        "tabular-nums",
      ],
    },
  });
