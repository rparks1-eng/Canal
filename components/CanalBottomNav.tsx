import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
} from "expo-router";

const ITEMS = [
  {
    label: "Home",
    symbol: "⌂",
    route: "/(tabs)",
    primary: false,
  },
  {
    label: "Library",
    symbol: "▤",
    route: "/(tabs)/library",
    primary: false,
  },
  {
    label: "Create",
    symbol: "+",
    route: "/scene-studio",
    primary: true,
  },
  {
    label: "Activity",
    symbol: "◌",
    route: "/(tabs)/activity",
    primary: false,
  },
  {
    label: "Profile",
    symbol: "◉",
    route: "/(tabs)/profile",
    primary: false,
  },
] as const;

export default function CanalBottomNav() {
  return (
    <View
      accessibilityRole="tablist"
      style={styles.container}
    >
      {ITEMS.map((item) => (
        <Pressable
          key={item.label}
          accessibilityRole={
            item.primary
              ? "button"
              : "tab"
          }
          accessibilityLabel={
            item.primary
              ? "Create Scene"
              : item.label
          }
          onPress={() => {
            if (item.primary) {
              router.push(item.route);
            } else {
              router.replace(item.route);
            }
          }}
          style={({ pressed }) => [
            styles.item,
            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={[
              styles.symbolContainer,
              item.primary &&
                styles.primarySymbolContainer,
            ]}
          >
            <Text
              style={[
                styles.symbol,
                item.primary &&
                  styles.primarySymbol,
              ]}
            >
              {item.symbol}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            style={styles.label}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-around",
      borderTopWidth: 1,
      borderTopColor: "#EEE6E0",
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 6,
      paddingTop: 7,
      paddingBottom: 7,
    },

    item: {
      minWidth: 58,
      minHeight: 54,
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 2,
    },

    symbolContainer: {
      width: 30,
      height: 27,
      alignItems: "center",
      justifyContent: "center",
    },

    primarySymbolContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "#F47A24",
      marginTop: -20,
      borderWidth: 4,
      borderColor: "#FFF9F4",
    },

    symbol: {
      color: "#766E67",
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 24,
    },

    primarySymbol: {
      color: "#FFFFFF",
      fontSize: 28,
      fontWeight: "500",
      lineHeight: 30,
    },

    label: {
      color: "#766E67",
      fontSize: 10,
      fontWeight: "700",
    },

    pressed: {
      opacity: 0.65,
    },
  });
