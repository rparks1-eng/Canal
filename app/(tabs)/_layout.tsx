import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Tabs,
} from "expo-router";

function TabIcon(props: {
  symbol: string;
  label: string;
  color: string;
}) {
  return (
    <View
      style={
        styles.iconContainer
      }
    >
      <Text
        style={[
          styles.icon,

          {
            color:
              props.color,
          },
        ]}
      >
        {props.symbol}
      </Text>

      <Text
        numberOfLines={1}
        style={[
          styles.iconLabel,

          {
            color:
              props.color,
          },
        ]}
      >
        {props.label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:
          false,

        tabBarShowLabel:
          false,

        tabBarActiveTintColor:
          "#F47A24",

        tabBarInactiveTintColor:
          "#8A827B",

        tabBarStyle: {
          height: 84,
          paddingTop: 7,
          paddingBottom: 17,
          borderTopColor:
            "#EEE6E0",
          backgroundColor:
            "#FFFFFF",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",

          tabBarIcon: ({
            color,
          }) => (
            <TabIcon
              symbol="⌂"
              label="Home"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          title: "Library",

          tabBarIcon: ({
            color,
          }) => (
            <TabIcon
              symbol="▤"
              label="Library"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="create"
        options={{
          title: "Create",

          tabBarIcon:
            () => null,

          tabBarButton:
            (
              {
                accessibilityLabel,
                accessibilityState,
                onLongPress,
                onPress,
                style,
                testID,
              },
            ) => {
              return (
                <Pressable
                  accessibilityLabel={
                    accessibilityLabel ??
                    "Create"
                  }
                  accessibilityRole="button"
                  accessibilityState={
                    accessibilityState
                  }
                  onLongPress={
                    onLongPress
                  }
                  onPress={
                    onPress
                  }
                  testID={
                    testID
                  }
                  style={({
                    pressed,
                  }) => [
                    style,

                    styles.createButton,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={
                      styles.createIcon
                    }
                  >
                    <Text
                      style={
                        styles.createIconText
                      }
                    >
                      +
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.createLabel
                    }
                  >
                    Create
                  </Text>
                </Pressable>
              );
            },
        }}
      />

      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",

          tabBarIcon: ({
            color,
          }) => (
            <TabIcon
              symbol="◌"
              label="Activity"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",

          tabBarIcon: ({
            color,
          }) => (
            <TabIcon
              symbol="◉"
              label="Profile"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",

          tabBarIcon: ({
            color,
          }) => (
            <TabIcon
              symbol="⌕"
              label="Explore"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="live"
        options={{
          href: null,
          title: "Live",
        }}
      />

    </Tabs>
  );
}

const styles =
  StyleSheet.create({
    iconContainer: {
      minWidth: 54,
      alignItems:
        "center",
    },

    icon: {
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 24,
    },

    iconLabel: {
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
    },

    createButton: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "flex-start",
      marginTop: -20,
    },

    createIcon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      borderWidth: 5,
      borderColor:
        "#FFF9F4",
    },

    createIconText: {
      color: "#FFFFFF",
      fontSize: 31,
      lineHeight: 33,
      fontWeight: "500",
      marginTop: -2,
    },

    createLabel: {
      color: "#F47A24",
      fontSize: 10,
      fontWeight: "800",
      marginTop: 1,
    },

    pressed: {
      opacity: 0.7,
    },
  });
