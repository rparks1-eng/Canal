import {
  Ionicons,
} from "@expo/vector-icons";

import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import {
  router,
} from "expo-router";

import {
  canalDynamicColors,
} from "../../theme/canal-dynamic-colors";

import {
  useNotificationCenter,
} from "../../providers/notification-center-provider";

type CanalHeaderActionsProps = {
  tone?: "auto" | "light" | "dark";
  showSettings?: boolean;
};

export function CanalHeaderActions({
  tone = "auto",
  showSettings = true,
}: CanalHeaderActionsProps) {
  const { unreadCount } = useNotificationCenter();
  const color =
    tone === "light"
      ? "#F7F4EC"
      : tone === "dark"
        ? "#343632"
        : canalDynamicColors.text;

  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityHint="Opens your notifications and recent activity."
        accessibilityLabel="Open Activity notifications"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() =>
          router.push(
            "/(tabs)/activity" as never,
          )
        }
        style={({ pressed }) => [
          styles.action,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          color={color}
          name="notifications-outline"
          size={19}
        />
        {unreadCount > 0 ? (
          <View
            accessibilityLabel={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
            style={styles.unreadBadge}
          >
            {unreadCount > 9 ? (
              <View style={styles.unreadBadgeWide} />
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {showSettings ? (
      <Pressable
        accessibilityHint="Opens Canal settings."
        accessibilityLabel="Open Settings"
        accessibilityRole="button"
        hitSlop={4}
        onPress={() =>
          router.push(
            "/settings" as never,
          )
        }
        style={({ pressed }) => [
          styles.action,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          color={color}
          name="settings-outline"
          size={19}
        />
      </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },

  action: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  pressed: {
    opacity: 0.45,
  },

  unreadBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#E43636",
  },

  unreadBadgeWide: {
    display: "none",
  },
});
