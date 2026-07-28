import { Ionicons } from "@expo/vector-icons";
import {
    router,
} from "expo-router";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NotFoundScreen() {
  return (
    <SafeAreaView
      style={styles.screen}
    >
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons
            name="map-outline"
            size={43}
            color="#ff9a50"
          />
        </View>

        <Text style={styles.eyebrow}>
          ROUTE NOT FOUND
        </Text>

        <Text style={styles.heading}>
          This part of the Canal is
          missing.
        </Text>

        <Text
          style={styles.description}
        >
          The link may be outdated or
          the content may no longer
          exist.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.replace(
              "/(tabs)/home",
            )
          }
          style={({ pressed }) => [
            styles.primaryButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Return Home
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.replace(
              "/(tabs)/explore",
            )
          }
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            Open Discover
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  icon: {
    width: 102,
    height: 102,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 34,
    backgroundColor: "#2b1d14",
  },

  eyebrow: {
    marginTop: 20,
    color: "#ff9a50",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heading: {
    maxWidth: 340,
    marginTop: 9,
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "700",
    lineHeight: 34,
    textAlign: "center",
  },

  description: {
    maxWidth: 330,
    marginTop: 10,
    color: "#8f9891",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  primaryButton: {
    width: "100%",
    minHeight: 55,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 27,
    borderRadius: 17,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 15,
    fontWeight: "800",
  },

  secondaryButton: {
    width: "100%",
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 16,
    backgroundColor: "#171c19",
  },

  secondaryButtonText: {
    color: "#ff9a50",
    fontSize: 13,
    fontWeight: "700",
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
