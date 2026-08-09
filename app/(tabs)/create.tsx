import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import * as Haptics from "expo-haptics";
import {
  router,
} from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type CreateActionProps = {
  eyebrow: string;
  title: string;
  description: string;
  symbol: string;
  onPress: () => void;
  accent?: boolean;
};

function CreateAction(
  props: CreateActionProps,
) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        props.title
      }
      onPress={() => {
        if (
          process.env
            .EXPO_OS ===
          "ios"
        ) {
          void Haptics
            .selectionAsync();
        }

        props.onPress();
      }}
      style={({ pressed }) => [
        styles.action,
        props.accent &&
          styles.actionAccent,
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={[
          styles.actionSymbol,
          props.accent &&
            styles.actionSymbolAccent,
        ]}
      >
        <Text
          style={[
            styles.actionSymbolText,
            props.accent &&
              styles.actionSymbolTextAccent,
          ]}
        >
          {props.symbol}
        </Text>
      </View>

      <View
        style={
          styles.actionCopy
        }
      >
        <Text
          style={[
            styles.eyebrow,
            props.accent &&
              styles.eyebrowAccent,
          ]}
        >
          {props.eyebrow}
        </Text>

        <Text
          style={[
            styles.actionTitle,
            props.accent &&
              styles.actionTitleAccent,
          ]}
        >
          {props.title}
        </Text>

        <Text
          style={[
            styles.actionDescription,
            props.accent &&
              styles.actionDescriptionAccent,
          ]}
        >
          {props.description}
        </Text>
      </View>

      <Text
        accessibilityElementsHidden
        style={[
          styles.chevron,
          props.accent &&
            styles.chevronAccent,
        ]}
      >
        ›
      </Text>
    </Pressable>
  );
}

export default function CreateTabScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={
        styles.content
      }
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text
          selectable
          style={styles.kicker}
        >
          CREATE IN CANAL
        </Text>

        <Text
          selectable
          style={styles.heading}
        >
          Shape it solo or make
          it live.
        </Text>

        <Text
          selectable
          style={styles.intro}
        >
          Build a Scene, start a
          synchronized Stage, or
          turn a collection into a
          private run or listener
          ballot.
        </Text>
      </View>

      <CreateAction
        eyebrow="BUILD"
        title="Set the Scene"
        description="Choose the mood, activity, artists, energy, and length for a new soundtrack."
        symbol="＋"
        onPress={() => {
          router.push(
            "/scene-studio",
          );
        }}
      />

      <CreateAction
        accent
        eyebrow="GO LIVE"
        title="Start a Stage"
        description="Bring a saved Scene live with a shared queue, room members, and realtime chat."
        symbol="◉"
        onPress={() => {
          router.push(
            "/create-stage",
          );
        }}
      />

      <CreateAction
        eyebrow="JOIN"
        title="Enter a Stage code"
        description="Use a six-digit invitation code to enter a public or private Stage."
        symbol="#"
        onPress={() => {
          router.push(
            "/join-stage",
          );
        }}
      />

      <CreateAction
        eyebrow="RELEASE"
        title="Start a Release Ballot"
        description="Choose one of your public Scene collections, invite contributor credit, and let listeners pick a favorite."
        symbol="★"
        onPress={() => {
          router.push(
            "/releases/new",
          );
        }}
      />

      <CreateAction
        eyebrow="PRIVATE EVENT"
        title="Plan an Event Run Sheet"
        description="Choose an owned Scene collection, schedule a private run, and freeze its ordered revisions when you start."
        symbol="≡"
        onPress={() => {
          router.push(
            "/event-run-sheets/new",
          );
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Browse private Event Run Sheets"
        onPress={() => {
          router.push(
            "/event-run-sheets",
          );
        }}
        style={({ pressed }) => [
          styles.liveLink,
          pressed &&
            styles.pressed,
        ]}
      >
        <Text
          style={
            styles.liveLinkText
          }
        >
          Browse Event Run Sheets
        </Text>

        <Text
          accessibilityElementsHidden
          style={
            styles.liveLinkArrow
          }
        >
          →
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Browse creator releases"
        onPress={() => {
          router.push(
            "/releases",
          );
        }}
        style={({ pressed }) => [
          styles.liveLink,
          pressed &&
            styles.pressed,
        ]}
      >
        <Text
          style={
            styles.liveLinkText
          }
        >
          Browse creator releases
        </Text>

        <Text
          accessibilityElementsHidden
          style={
            styles.liveLinkArrow
          }
        >
          →
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Browse Live Stages"
        onPress={() => {
          router.push(
            "/(tabs)/live",
          );
        }}
        style={({ pressed }) => [
          styles.liveLink,
          pressed &&
            styles.pressed,
        ]}
      >
        <Text
          style={
            styles.liveLinkText
          }
        >
          Browse Live Stages
        </Text>

        <Text
          accessibilityElementsHidden
          style={
            styles.liveLinkArrow
          }
        >
          →
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: canalDynamicColors.surface,
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 40,
      gap: 14,
    },

    header: {
      paddingBottom: 10,
      gap: 10,
    },

    kicker: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    heading: {
      maxWidth: 330,
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: "900",
      letterSpacing: -1,
    },

    intro: {
      maxWidth: 355,
      color: "#746B64",
      fontSize: 16,
      lineHeight: 23,
    },

    action: {
      minHeight: 142,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: "#E9DED5",
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      boxShadow:
        "0 8px 24px rgba(57, 35, 20, 0.06)",
    },

    actionAccent: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#20140D",
      boxShadow:
        "0 12px 28px rgba(86, 44, 16, 0.18)",
    },

    actionSymbol: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#FFF0E4",
    },

    actionSymbolAccent: {
      backgroundColor:
        "#F47A24",
    },

    actionSymbolText: {
      color: canalDynamicColors.gold,
      fontSize: 25,
      lineHeight: 28,
      fontWeight: "800",
    },

    actionSymbolTextAccent: {
      color: "#FFFFFF",
    },

    actionCopy: {
      flex: 1,
      gap: 5,
    },

    eyebrow: {
      color: "#9A6C4C",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    eyebrowAccent: {
      color: "#FFAD73",
    },

    actionTitle: {
      color: canalDynamicColors.text,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "900",
    },

    actionTitleAccent: {
      color: "#FFFFFF",
    },

    actionDescription: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 19,
    },

    actionDescriptionAccent: {
      color: "#CBB9AD",
    },

    chevron: {
      color: "#B6A9A0",
      fontSize: 30,
      fontWeight: "400",
    },

    chevronAccent: {
      color: canalDynamicColors.gold,
    },

    liveLink: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 6,
    },

    liveLinkText: {
      color: canalDynamicColors.gold,
      fontSize: 15,
      fontWeight: "800",
    },

    liveLinkArrow: {
      color: canalDynamicColors.gold,
      fontSize: 21,
      fontWeight: "700",
    },

    pressed: {
      opacity: 0.68,
      transform: [
        {
          scale: 0.99,
        },
      ],
    },
  });
