import {
  useEffect,
} from "react";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
} from "expo-router";

export default function CreateTabScreen() {
  useEffect(() => {
    const timer =
      setTimeout(() => {
        router.replace(
          "/scene-studio",
        );
      }, 50);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.screen}>
      <ActivityIndicator />

      <Text style={styles.text}>
        Opening Scene Studio...
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF9F4",
    },

    text: {
      color: "#6C655F",
      fontSize: 14,
      marginTop: 12,
    },
  });
